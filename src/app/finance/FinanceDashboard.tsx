"use client";

import {
  can,
  hasOrganizationFinance,
  type PermissionKey,
} from "@/domain/access/permissions";
import { DateInput } from "@/components/ui/DateInput";
import Link from "next/link";
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { shiftMonth } from "@/lib/dates/month";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  compensationModelLabels,
  monthlyCompensation,
  type CompensationRecord,
} from "@/domain/finance/compensation";
import type { CompensationModel } from "@/domain/types";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  ExpenseMinusIcon,
  IncomePlusIcon,
} from "@/components/ui/FileActionIcons";
import {
  abbreviateText,
  belongsToCompany,
  belongsToConsultant,
  belongsToConsultantLedger,
  transactionPeriodTotals,
  consultantIncomeShareMinor,
  belongsToFixedConsultantResult,
  calculateShareMinor,
  companyBalanceDeltaMinor,
  consultantBalanceMovementHistory,
  earnsInvoiceShare,
  expenseTotalsByCategory,
  FinanceHistoryEntry,
  financeTotals,
  fixedConsultantRetainedResultHistory,
  flexibleConsultantBalanceHistory,
  flexibleConsultantRetainedResultHistory,
  formatSek,
  formatSekCompact,
  isSalaryRelatedExpenseCode,
  transactionTableDescription,
  transactionFinanceHistory,
  vatPayableMinor,
  vatPayableHistory,
  outstandingInvoiceHistory,
} from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  transactionListHref,
  transactionListState,
} from "./transaction-navigation";
import { AttachmentClip, AttachmentDownloads } from "./FinanceAttachments";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { ReportExportButtons } from "@/components/ui/ReportExportButtons";
import {
  DetailFacts,
  DetailSection,
  DetailSections,
  DetailSummary,
  DetailTag,
} from "@/components/ui/DetailView";
import {
  createFinanceCsv,
  transactionExportCsvHeaders,
} from "@/domain/finance/csv";

export interface FinancePageData {
  financeEnabled: boolean;
  users: Array<{
    id: string;
    displayName: string;
    employeeNumber: string;
    role: string;
    compensationModel: CompensationModel | null;
  }>;
  customers: Array<{
    id: string;
    name: string;
    contactPerson: string;
    financeEmail: string;
  }>;
  categories: Array<{
    id: string;
    code: string;
    name: { en: string; sv: string };
    direction: "income" | "expense";
    active: boolean;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    consultantId: string | null;
    compensationModel: CompensationModel | null;
    customerName: string;
    customerContactPerson: string;
    customerFinanceEmail: string;
    visibleDescription: string;
    internalNote: string;
    vatRateBps: number;
    issueDate: string;
    dueDate: string;
    periodFrom: string | null;
    periodTo: string | null;
    paidDate: string | null;
    status: "issued" | "paid" | "void";
    netMinor: number;
    vatMinor: number;
    roundingMinor: number;
    grossMinor: number;
    shareBps: number;
  }>;
  transactions: Array<{
    id: string;
    direction: "income" | "expense";
    categoryId: string;
    consultantId: string | null;
    invoiceId: string | null;
    invoiceConsultantId: string | null;
    funding: "company" | "consultant" | null;
    date: string;
    netMinor: number;
    vatRateBps: number;
    vatMinor: number;
    roundingMinor: number;
    grossMinor: number;
    consultantBalanceDeltaMinor: number;
    visibleDescription: string;
    internalNote: string;
    applyConsultantShare: boolean;
    shareBpsOverride: number | null;
    status: "posted" | "reversal";
    reversedByTransactionId: string | null;
    createdAt: number;
    attachments: Array<{ id: string; name: string; contentType: string }>;
  }>;
  agreements: CompensationRecord[];
  vatSettlements: Array<{
    id: string;
    paymentDate: string;
    periodFrom: string;
    periodTo: string;
    reference: string;
    amountMinor: number;
    roundingMinor: number;
    status: "active" | "reversed";
  }>;
}

type Actor = {
  id: string;
  role: string;
  locale: "sv-SE" | "en-SE";
  permissions: PermissionKey[];
};
type FinanceSection =
  "overview" | "invoices" | "categories" | "transactions" | "customers";
function today() {
  return new Date().toISOString().slice(0, 10);
}

type FinancePeriod = "month" | "year" | "all" | "range";
type ExpenseFundingFilter = "all" | "company" | "consultant";

const expenseTotalLabels = new Set([
  "totalConsultantFundedExpenses",
  "totalCompanyFundedExpenses",
  "totalExpenses",
]);

function inFinancePeriod(
  date: string,
  period: FinancePeriod,
  anchor: string,
  from: string,
  to: string,
) {
  if (period === "all") return true;
  if (period === "range") return date >= from && date <= to;
  return date.startsWith(period === "month" ? anchor : anchor.slice(0, 4));
}

function dateValue(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function BalanceChart({
  transactions,
  locale,
  period,
  anchor,
  rangeFrom,
  rangeTo,
  mode,
  categoryName,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  period: FinancePeriod;
  anchor: string;
  rangeFrom: string;
  rangeTo: string;
  mode: "balance" | "result";
  categoryName: (id: string) => string;
}) {
  const { t } = useLocale();
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const zoomScope = `${period}:${anchor}:${rangeFrom}:${rangeTo}:${mode}`;
  const [storedZoom, setZoom] = useState({
    start: 0,
    end: 1,
    scope: zoomScope,
  });
  const zoom =
    storedZoom.scope === zoomScope
      ? storedZoom
      : { start: 0, end: 1, scope: zoomScope };
  const [selection, setSelection] = useState<{
    start: number;
    current: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sorted = [...transactions]
    .filter((transaction) =>
      inFinancePeriod(transaction.date, period, anchor, rangeFrom, rangeTo),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysInYear =
    new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
  const rangeStart = dateValue(rangeFrom);
  const rangeDuration = Math.max(86_400_000, dateValue(rangeTo) - rangeStart);
  const dayOfYear = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`);
    return (
      Math.floor(
        (value.getTime() - Date.UTC(value.getUTCFullYear(), 0, 1)) / 86_400_000,
      ) + 1
    );
  };
  const dailyPoints = sorted.reduce<
    Array<{
      date: string;
      transactions: FinancePageData["transactions"];
      change: number;
      balance: number;
      xRatio: number;
    }>
  >((points, transaction) => {
    const change =
      mode === "balance"
        ? transaction.consultantBalanceDeltaMinor
        : transaction.direction === "income"
          ? transaction.netMinor
          : -transaction.netMinor;
    const previous = points.at(-1);
    if (previous?.date === transaction.date) {
      previous.transactions.push(transaction);
      previous.change += change;
      previous.balance += change;
      return points;
    }
    const balance = (previous?.balance ?? 0) + change;
    return [
      ...points,
      {
        date: transaction.date,
        transactions: [transaction],
        change,
        balance,
        xRatio: 0,
      },
    ];
  }, []);
  const transactionPoints = dailyPoints.map((point, index) => {
    const xRatio =
      period === "month"
        ? Number(point.date.slice(8, 10)) / daysInMonth
        : period === "year"
          ? (dayOfYear(point.date) - 0.5) / daysInYear
          : period === "range"
            ? (dateValue(point.date) - rangeStart) / rangeDuration
            : (index + 1) / Math.max(1, dailyPoints.length);
    return { ...point, xRatio };
  });
  const chartPoints = transactionPoints.filter(
    (point) => point.xRatio >= zoom.start && point.xRatio <= zoom.end,
  );
  const values = chartPoints.map((point) => point.balance);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  const rawRange = max - min;
  const padding = rawRange === 0 ? 10_000 : rawRange * 0.12;
  min = min < 0 ? min - padding : 0;
  max = max > 0 ? max + padding : 0;
  if (min === max) max = padding;
  const range = max - min;
  const plot = { left: 88, right: 975, top: 20, bottom: 308 };
  const visibleRatio = (ratio: number) =>
    (ratio - zoom.start) / (zoom.end - zoom.start);
  const x = (ratio: number) =>
    plot.left + visibleRatio(ratio) * (plot.right - plot.left);
  const y = (value: number) =>
    plot.bottom - ((value - min) / range) * (plot.bottom - plot.top);
  const polyline = chartPoints
    .map((point) => `${x(point.xRatio)},${y(point.balance)}`)
    .join(" ");
  const firstChartPoint = chartPoints[0];
  const area = firstChartPoint
    ? `M ${x(firstChartPoint.xRatio)} ${y(0)} L ${chartPoints
        .map((point) => `${x(point.xRatio)} ${y(point.balance)}`)
        .join(" L ")} L ${x(chartPoints.at(-1)?.xRatio ?? 0)} ${y(0)} Z`
    : "";
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => min + (range * index) / 4,
  );
  const rangeTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = new Date(rangeStart + rangeDuration * ratio);
    return {
      ratio,
      label: new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        ...(value.getUTCFullYear() !== new Date(rangeStart).getUTCFullYear()
          ? { year: "numeric" }
          : {}),
        timeZone: "UTC",
      }).format(value),
    };
  });
  const allXTicks =
    period === "month"
      ? [0, 5, 10, 15, 20, 25, daysInMonth]
          .filter(
            (value, index, values) =>
              value <= daysInMonth && values.indexOf(value) === index,
          )
          .map((value) => ({
            ratio: value / daysInMonth,
            label: String(value),
          }))
      : period === "year"
        ? Array.from({ length: 12 }, (_, index) => ({
            ratio:
              (Date.UTC(year, index, 1) - Date.UTC(year, 0, 1)) /
              86_400_000 /
              daysInYear,
            label: String(index + 1),
          }))
        : period === "range"
          ? rangeTicks
          : [
              { ratio: 0, label: "0" },
              ...(sorted.length
                ? [{ ratio: 1, label: sorted.at(-1)?.date ?? "" }]
                : []),
            ];
  const xTicks = allXTicks.filter(
    (tick) => tick.ratio >= zoom.start && tick.ratio <= zoom.end,
  );
  const axisSek = (minor: number) =>
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(minor / 100);
  const hovered = hoveredPoint === null ? null : chartPoints[hoveredPoint];
  const pointerPosition = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const scale = Math.min(bounds.width / 1000, bounds.height / 360);
    const renderedWidth = 1000 * scale;
    const renderedHeight = 360 * scale;
    const offsetX = (bounds.width - renderedWidth) / 2;
    const offsetY = (bounds.height - renderedHeight) / 2;
    return {
      x: (event.clientX - bounds.left - offsetX) / scale,
      y: (event.clientY - bounds.top - offsetY) / scale,
    };
  };
  const pointerRatio = (event: ReactPointerEvent<SVGSVGElement>) => {
    const position = pointerPosition(event);
    if (position === null) return zoom.start;
    const plotRatio = Math.max(
      0,
      Math.min(1, (position.x - plot.left) / (plot.right - plot.left)),
    );
    return zoom.start + plotRatio * (zoom.end - zoom.start);
  };
  const finishSelection = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!selection) return;
    const end = pointerRatio(event);
    const start = Math.min(selection.start, end);
    const finish = Math.max(selection.start, end);
    if (finish - start >= (zoom.end - zoom.start) * 0.025) {
      setZoom({ start, end: finish, scope: zoomScope });
      setHoveredPoint(null);
    }
    setSelection(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const selectionStart = selection
    ? Math.min(selection.start, selection.current)
    : 0;
  const selectionEnd = selection
    ? Math.max(selection.start, selection.current)
    : 0;
  return (
    <div className="finance-chart">
      <div className="finance-chart-toolbar">
        <span>{t("chartZoomHint")}</span>
        <button
          className="button button-secondary finance-chart-reset"
          type="button"
          disabled={zoom.start === 0 && zoom.end === 1}
          onClick={() => setZoom({ start: 0, end: 1, scope: zoomScope })}
        >
          {t("resetZoom")}
        </button>
      </div>
      <div className="finance-chart-canvas">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 360"
          role="img"
          aria-label={t("balanceHistory")}
          onPointerDown={(event) => {
            if (event.pointerType === "touch") return;
            const position = pointerPosition(event);
            if (
              position === null ||
              position.x < plot.left ||
              position.x > plot.right ||
              position.y < plot.top ||
              position.y > plot.bottom
            )
              return;
            event.preventDefault();
            const ratio = pointerRatio(event);
            event.currentTarget.setPointerCapture(event.pointerId);
            setSelection({ start: ratio, current: ratio });
          }}
          onPointerMove={(event) => {
            if (selection) {
              event.preventDefault();
              setSelection({ ...selection, current: pointerRatio(event) });
            }
          }}
          onPointerUp={finishSelection}
          onPointerCancel={() => setSelection(null)}
        >
          <defs>
            <linearGradient id="balance-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop
                offset="100%"
                stopColor="currentColor"
                stopOpacity="0.015"
              />
            </linearGradient>
          </defs>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className="finance-chart-gridline"
                x1={plot.left}
                x2={plot.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="finance-chart-axis-label"
                x={plot.left - 12}
                y={y(tick) + 4}
                textAnchor="end"
              >
                {axisSek(tick)}
              </text>
            </g>
          ))}
          <line
            className="finance-chart-axis"
            x1={plot.left}
            x2={plot.left}
            y1={plot.top}
            y2={plot.bottom}
          />
          <line
            className="finance-chart-zero"
            x1={plot.left}
            x2={plot.right}
            y1={y(0)}
            y2={y(0)}
          />
          {xTicks.map((tick) => (
            <g key={`${tick.ratio}-${tick.label}`}>
              <line
                className="finance-chart-axis"
                x1={x(tick.ratio)}
                x2={x(tick.ratio)}
                y1={plot.bottom}
                y2={plot.bottom + 6}
              />
              <text
                className="finance-chart-axis-label"
                x={x(tick.ratio)}
                y={plot.bottom + 24}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            </g>
          ))}
          <text className="finance-chart-axis-title" x={18} y={18}>
            SEK
          </text>
          <text
            className="finance-chart-axis-title"
            x={plot.right}
            y={352}
            textAnchor="end"
          >
            {period === "month"
              ? t("chartDay")
              : period === "year"
                ? t("month")
                : t("date")}
          </text>
          <rect
            className="finance-chart-interaction"
            x={plot.left}
            y={plot.top}
            width={plot.right - plot.left}
            height={plot.bottom - plot.top}
          />
          {area && <path className="finance-chart-area" d={area} />}
          <polyline
            className="finance-chart-line"
            points={polyline}
            fill="none"
          />
          {hovered && (
            <line
              className="finance-chart-crosshair"
              x1={x(hovered.xRatio)}
              x2={x(hovered.xRatio)}
              y1={plot.top}
              y2={plot.bottom}
            />
          )}
          {chartPoints.map((point, index) => (
            <g key={point.date}>
              <circle
                className="finance-chart-point-target"
                cx={x(point.xRatio)}
                cy={y(point.balance)}
                r={7}
                tabIndex={0}
                role="button"
                aria-label={t("viewDayTransactions") + ": " + point.date}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseEnter={() => setHoveredPoint(index)}
                onMouseLeave={() => setHoveredPoint(null)}
                onFocus={() => setHoveredPoint(index)}
                onBlur={() => setHoveredPoint(null)}
                onClick={() => setSelectedDay(point.date)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedDay(point.date);
                  }
                }}
              />
              {hoveredPoint === index && (
                <circle
                  className="finance-chart-active-point"
                  cx={x(point.xRatio)}
                  cy={y(point.balance)}
                  r={4}
                />
              )}
            </g>
          ))}
          {selection && (
            <rect
              className="finance-chart-selection"
              x={x(selectionStart)}
              y={plot.top}
              width={Math.max(0, x(selectionEnd) - x(selectionStart))}
              height={plot.bottom - plot.top}
            />
          )}
        </svg>
        {hovered && (
          <div
            className="finance-chart-tooltip"
            style={{
              left: `clamp(120px, ${(x(hovered.xRatio) / 1000) * 100}%, calc(100% - 120px))`,
              top: `${(y(hovered.balance) / 360) * 100}%`,
              transform:
                y(hovered.balance) < 125
                  ? "translate(-50%, 12px)"
                  : "translate(-50%, calc(-100% - 12px))",
            }}
          >
            <>
              <strong>{hovered.date}</strong>
              <span>
                {t("transactionCount")}: {hovered.transactions.length}
              </span>
              <span>
                {t("dailyChange")}: {formatSek(hovered.change, locale)}
              </span>
              <span>
                {t("balanceAtPoint")}: {formatSek(hovered.balance, locale)}
              </span>
            </>
          </div>
        )}
      </div>
      {selectedDay && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedDay(null)}
        >
          <section
            className="modal daily-transactions-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-transactions-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h2 id="daily-transactions-title">{t("dailyTransactions")}</h2>
                <p>{selectedDay}</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setSelectedDay(null)}
              >
                {"\u00d7"}
              </button>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("type")}</th>
                    <th>{t("category")}</th>
                    <th>{t("description")}</th>
                    <th>{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionPoints
                    .find((point) => point.date === selectedDay)
                    ?.transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{t(transaction.direction)}</td>
                        <td>{categoryName(transaction.categoryId)}</td>
                        <td>
                          {transaction.internalNote ||
                            transaction.visibleDescription ||
                            "—"}
                        </td>
                        <td>
                          {formatSek(
                            mode === "balance"
                              ? transaction.consultantBalanceDeltaMinor
                              : transaction.direction === "income"
                                ? transaction.netMinor
                                : -transaction.netMinor,
                            locale,
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>{t("dailyChange")}</th>
                    <th>
                      {formatSek(
                        transactionPoints.find(
                          (point) => point.date === selectedDay,
                        )?.change ?? 0,
                        locale,
                      )}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
            <footer className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setSelectedDay(null)}
              >
                {t("close")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function IncomeExpenseBarChart({
  transactions,
  locale,
  period,
  anchor,
  rangeFrom,
  rangeTo,
  includeVat,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  period: FinancePeriod;
  anchor: string;
  rangeFrom: string;
  rangeTo: string;
  includeVat: boolean;
}) {
  const { t } = useLocale();
  const [hoveredBar, setHoveredBar] = useState<{
    label: string;
    type: "income" | "expense";
    value: number;
    x: number;
    y: number;
  } | null>(null);
  const year = anchor.slice(0, 4);
  const visible = transactions.filter((transaction) =>
    inFinancePeriod(transaction.date, period, anchor, rangeFrom, rangeTo),
  );
  const totalsFor = (items: FinancePageData["transactions"]) => ({
    income: Math.max(
      0,
      items
        .filter((transaction) => transaction.direction === "income")
        .reduce(
          (sum, transaction) =>
            sum + (includeVat ? transaction.grossMinor : transaction.netMinor),
          0,
        ),
    ),
    expense: Math.max(
      0,
      items
        .filter((transaction) => transaction.direction === "expense")
        .reduce(
          (sum, transaction) =>
            sum + (includeVat ? transaction.grossMinor : transaction.netMinor),
          0,
        ),
    ),
  });
  const groups =
    period === "year"
      ? Array.from({ length: 12 }, (_, monthIndex) => {
          const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
          return {
            key: monthKey,
            label: new Intl.DateTimeFormat(locale, { month: "short" }).format(
              new Date(Date.UTC(Number(year), monthIndex, 1)),
            ),
            ...totalsFor(
              visible.filter((transaction) =>
                transaction.date.startsWith(monthKey),
              ),
            ),
          };
        })
      : [
          {
            key: period,
            label:
              period === "month"
                ? anchor
                : period === "range"
                  ? `${rangeFrom} \u2013 ${rangeTo}`
                  : t("allTime"),
            ...totalsFor(visible),
          },
        ];
  const maxValue = Math.max(
    10_000,
    ...groups.flatMap((group) => [group.income, group.expense]),
  );
  const chartMax = maxValue * 1.12;
  const plot = { left: 88, right: 975, top: 20, bottom: 300 };
  const plotWidth = plot.right - plot.left;
  const y = (value: number) =>
    plot.bottom - (value / chartMax) * (plot.bottom - plot.top);
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => (chartMax * index) / 4,
  );
  const axisSek = (minor: number) =>
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(minor / 100);
  const groupWidth = plotWidth / groups.length;
  const pairWidth = Math.min(groupWidth * 0.72, period === "year" ? 52 : 300);
  const barGap = Math.max(4, pairWidth * 0.1);
  const barWidth = (pairWidth - barGap) / 2;
  return (
    <div className="finance-bar-chart">
      <div className="finance-bar-chart-canvas">
        <svg
          viewBox="0 0 1000 360"
          role="img"
          aria-label={t("incomeExpenseChart")}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className="finance-chart-gridline"
                x1={plot.left}
                x2={plot.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="finance-chart-axis-label"
                x={plot.left - 12}
                y={y(tick) + 4}
                textAnchor="end"
              >
                {axisSek(tick)}
              </text>
            </g>
          ))}
          <line
            className="finance-chart-axis"
            x1={plot.left}
            x2={plot.left}
            y1={plot.top}
            y2={plot.bottom}
          />
          <line
            className="finance-chart-zero"
            x1={plot.left}
            x2={plot.right}
            y1={plot.bottom}
            y2={plot.bottom}
          />
          <text className="finance-chart-axis-title" x={18} y={18}>
            SEK
          </text>
          {groups.map((group, index) => {
            const center = plot.left + groupWidth * (index + 0.5);
            const incomeX = center - pairWidth / 2;
            const expenseX = incomeX + barWidth + barGap;
            return (
              <g key={group.key}>
                <rect
                  className="finance-bar finance-bar-income"
                  x={incomeX}
                  y={Math.min(y(group.income), plot.bottom - 2)}
                  width={barWidth}
                  height={Math.max(2, plot.bottom - y(group.income))}
                  rx="4"
                  tabIndex={0}
                  onMouseEnter={() =>
                    setHoveredBar({
                      label: group.label,
                      type: "income",
                      value: group.income,
                      x: incomeX + barWidth / 2,
                      y: y(group.income),
                    })
                  }
                  onMouseLeave={() => setHoveredBar(null)}
                  onFocus={() =>
                    setHoveredBar({
                      label: group.label,
                      type: "income",
                      value: group.income,
                      x: incomeX + barWidth / 2,
                      y: y(group.income),
                    })
                  }
                  onBlur={() => setHoveredBar(null)}
                />
                <rect
                  className="finance-bar finance-bar-expense"
                  x={expenseX}
                  y={Math.min(y(group.expense), plot.bottom - 2)}
                  width={barWidth}
                  height={Math.max(2, plot.bottom - y(group.expense))}
                  rx="4"
                  tabIndex={0}
                  onMouseEnter={() =>
                    setHoveredBar({
                      label: group.label,
                      type: "expense",
                      value: group.expense,
                      x: expenseX + barWidth / 2,
                      y: y(group.expense),
                    })
                  }
                  onMouseLeave={() => setHoveredBar(null)}
                  onFocus={() =>
                    setHoveredBar({
                      label: group.label,
                      type: "expense",
                      value: group.expense,
                      x: expenseX + barWidth / 2,
                      y: y(group.expense),
                    })
                  }
                  onBlur={() => setHoveredBar(null)}
                />
                <text
                  className="finance-chart-axis-label"
                  x={center}
                  y={plot.bottom + 23}
                  textAnchor="middle"
                >
                  {group.label}
                </text>
              </g>
            );
          })}
        </svg>
        {hoveredBar && (
          <div
            className="finance-chart-tooltip"
            style={{
              left: `clamp(120px, ${(hoveredBar.x / 1000) * 100}%, calc(100% - 120px))`,
              top: `${(hoveredBar.y / 360) * 100}%`,
              transform:
                hoveredBar.y < 105
                  ? "translate(-50%, 12px)"
                  : "translate(-50%, calc(-100% - 12px))",
            }}
          >
            <strong>{t(hoveredBar.type)}</strong>
            <span>{hoveredBar.label}</span>
            <span>{formatSek(hoveredBar.value, locale)}</span>
          </div>
        )}
      </div>
      <div className="finance-bar-legend" aria-hidden="true">
        <span>
          <i className="finance-bar-income" />
          {t("income")}
        </span>
        <span>
          <i className="finance-bar-expense" />
          {t("expenses")}
        </span>
      </div>
    </div>
  );
}

function ExpenseCategoryChart({
  transactions,
  locale,
  categoryName,
  categoryCode,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  categoryName: (id: string) => string;
  categoryCode: (id: string) => string;
}) {
  const { t } = useLocale();
  const [includeSalaryRelated, setIncludeSalaryRelated] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<{
    label: string;
    count: number;
    amountMinor: number;
    x: number;
    y: number;
  } | null>(null);
  const allTotals = expenseTotalsByCategory(transactions);
  const totals = includeSalaryRelated
    ? allTotals
    : allTotals.filter(
        (item) => !isSalaryRelatedExpenseCode(categoryCode(item.categoryId)),
      );
  const maximum = Math.max(0, ...totals.map((item) => item.amountMinor));
  const chartMax = Math.max(10_000, maximum * 1.1);
  const chartHeight = 380;
  const plot = { left: 88, right: 975, top: 20, bottom: 270 };
  const groupWidth = (plot.right - plot.left) / Math.max(1, totals.length);
  const barWidth = Math.min(46, groupWidth * 0.52);
  const y = (value: number) =>
    plot.bottom - (value / chartMax) * (plot.bottom - plot.top);
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => (chartMax * index) / 4,
  );
  const axisSek = (minor: number) =>
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(minor / 100);
  return (
    <div className="finance-expense-category-chart">
      <label className="checkbox-row finance-expense-category-toggle">
        <input
          type="checkbox"
          checked={includeSalaryRelated}
          onChange={(event) => setIncludeSalaryRelated(event.target.checked)}
        />
        <span>{t("includeSalaryRelatedExpenses")}</span>
      </label>
      {totals.length === 0 ? (
        <div className="finance-chart-empty">{t("noCategoryExpenses")}</div>
      ) : (
        <div className="finance-expense-category-canvas">
          <svg
            viewBox={`0 0 1000 ${chartHeight}`}
            style={{ minWidth: `${Math.max(620, totals.length * 82)}px` }}
            role="img"
            aria-label={t("expenseCategoryChart")}
          >
            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  className="finance-chart-gridline"
                  x1={plot.left}
                  x2={plot.right}
                  y1={y(tick)}
                  y2={y(tick)}
                />
                <text
                  className="finance-chart-axis-label"
                  x={plot.left - 12}
                  y={y(tick) + 4}
                  textAnchor="end"
                >
                  {axisSek(tick)}
                </text>
              </g>
            ))}
            <line
              className="finance-chart-axis"
              x1={plot.left}
              x2={plot.left}
              y1={plot.top}
              y2={plot.bottom}
            />
            <line
              className="finance-chart-zero"
              x1={plot.left}
              x2={plot.right}
              y1={plot.bottom}
              y2={plot.bottom}
            />
            <text className="finance-chart-axis-title" x={18} y={18}>
              SEK
            </text>
            {totals.map((item, index) => {
              const center = plot.left + groupWidth * (index + 0.5);
              const label = categoryName(item.categoryId);
              const count = transactions.filter(
                (transaction) =>
                  transaction.direction === "expense" &&
                  transaction.categoryId === item.categoryId,
              ).length;
              const hoverDetails = {
                label,
                count,
                amountMinor: item.amountMinor,
                x: center,
                y: y(item.amountMinor),
              };
              return (
                <g key={item.categoryId}>
                  <line
                    className="finance-chart-axis"
                    x1={center}
                    x2={center}
                    y1={plot.bottom}
                    y2={plot.bottom + 6}
                  />
                  <text
                    className="finance-chart-axis-label finance-expense-category-label"
                    x={center}
                    y={plot.bottom + 28}
                    textAnchor="end"
                    transform={`rotate(-35 ${center} ${plot.bottom + 28})`}
                  >
                    {label}
                  </text>
                  <rect
                    className="finance-expense-category-bar"
                    x={center - barWidth / 2}
                    y={Math.min(y(item.amountMinor), plot.bottom - 3)}
                    width={barWidth}
                    height={Math.max(3, plot.bottom - y(item.amountMinor))}
                    rx="4"
                    tabIndex={0}
                    onMouseEnter={() => setHoveredCategory(hoverDetails)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    onFocus={() => setHoveredCategory(hoverDetails)}
                    onBlur={() => setHoveredCategory(null)}
                  />
                </g>
              );
            })}
          </svg>
          {hoveredCategory && (
            <div
              className="finance-chart-tooltip"
              style={{
                left: `clamp(120px, ${(hoveredCategory.x / 1000) * 100}%, calc(100% - 120px))`,
                top: `${(hoveredCategory.y / chartHeight) * 100}%`,
                transform:
                  hoveredCategory.y < 105
                    ? "translate(-50%, 12px)"
                    : "translate(-50%, calc(-100% - 12px))",
              }}
            >
              <strong>{hoveredCategory.label}</strong>
              <span>
                {t("transactionCount")}: {hoveredCategory.count}
              </span>
              <span>{formatSek(hoveredCategory.amountMinor, locale)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FinanceHistoryModal({
  title,
  description,
  changeLabel,
  entries,
  locale,
  categoryName,
  consultantName,
  eyebrow,
  close,
}: {
  title: string;
  description: string;
  changeLabel?: string;
  entries: FinanceHistoryEntry[];
  locale: Actor["locale"];
  categoryName: (id: string) => string;
  /** When given, adds a column naming the consultant, or the company. */
  consultantName?: (id: string) => string;
  eyebrow?: string;
  close: () => void;
}) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const newestFirst = [...entries].reverse();
  const pageCount = Math.max(1, Math.ceil(newestFirst.length / 10));
  const visibleEntries = newestFirst.slice((page - 1) * 10, page * 10);
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        className="modal finance-history-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{eyebrow ?? t("financialHistory")}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label={t("close")}
            onClick={close}
          >
            &times;
          </button>
        </header>
        {visibleEntries.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("date")}</th>
                  <th>{t("source")}</th>
                  {consultantName && <th>{t("consultant")}</th>}
                  <th>{t("description")}</th>
                  <th>{changeLabel ?? t("balanceChange")}</th>
                  <th>{t("runningTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.date}</td>
                    <td>
                      {entry.kind === "invoice"
                        ? `${t("invoice")} ${entry.reference}`
                        : entry.kind === "vatSettlement"
                          ? [t("vatPayment"), entry.reference]
                              .filter(Boolean)
                              .join(" ")
                          : entry.categoryId
                            ? categoryName(entry.categoryId)
                            : t("expense")}
                    </td>
                    {consultantName && (
                      <td>
                        {entry.kind === "vatSettlement"
                          ? "—"
                          : entry.consultantId
                            ? consultantName(entry.consultantId)
                            : t("company")}
                      </td>
                    )}
                    <td>{entry.description || "—"}</td>
                    <td>{formatSek(entry.changeMinor, locale)}</td>
                    <td>{formatSek(entry.runningTotalMinor, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t("noFinancialHistory")}</p>
        )}
        {newestFirst.length > 10 && (
          <div className="pagination">
            <button
              className="button secondary"
              type="button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t("previous")}
            </button>
            <span>
              {t("page")} {page} {t("of")} {pageCount}
            </span>
            <button
              className="button secondary"
              type="button"
              disabled={page === pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              {t("next")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export function FinanceDashboard({
  data,
  actor,
  section,
}: {
  data: FinancePageData;
  actor: Actor;
  section: FinanceSection;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const manager = hasOrganizationFinance(actor);
  const admin = actor.role === "admin";
  const canAddLedger = can(actor, "finance.ledger.add");
  const canEditLedger = can(actor, "finance.ledger.edit");
  const canDeleteLedger = can(actor, "finance.ledger.delete");
  const canEditInvoices = can(actor, "finance.invoices.edit");
  const canEditCustomers = can(actor, "finance.customers.edit");
  const canEditCategories = can(actor, "finance.categories.edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [chartPeriod, setChartPeriod] = useState<FinancePeriod>("year");
  const [chartAnchor, setChartAnchor] = useState(today().slice(0, 7));
  const [chartRangeFrom, setChartRangeFrom] = useState(
    `${today().slice(0, 7)}-01`,
  );
  const [chartRangeTo, setChartRangeTo] = useState(today());
  const [includeVatInIncomeExpense, setIncludeVatInIncomeExpense] =
    useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState(
    manager ? "company" : actor.id,
  );
  const [expenseFundingFilter, setExpenseFundingFilter] =
    useState<ExpenseFundingFilter>("all");
  // Whose report the export buttons download: a chosen consultant for finance
  // staff, or yourself in My finances.
  const reportUserId = manager
    ? can(actor, "finance.overview.export") &&
      selectedConsultant !== "all" &&
      selectedConsultant !== "company"
      ? selectedConsultant
      : null
    : can(actor, "my.finance.export")
      ? actor.id
      : null;
  const [financeHistory, setFinanceHistory] = useState<
    | "netIncome"
    | "vatPayable"
    | "outstandingInvoices"
    | "consultantBalance"
    | "retainedResult"
    | "earnedShare"
    | "spentFromBalance"
    | null
  >(null);
  // `?invoice=` and `?transaction=` open that record's details, so other
  // pages can link straight to it.
  const [viewingInvoice, setViewingInvoice] = useState<
    FinancePageData["invoices"][number] | null
  >(
    () =>
      data.invoices.find(
        (invoice) => invoice.id === searchParams.get("invoice"),
      ) ?? null,
  );
  const [invoiceConsultantFilter, setInvoiceConsultantFilter] = useState("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const linkedTransaction =
    data.transactions.find(
      (item) => item.id === searchParams.get("transaction"),
    ) ?? null;
  const latestListedTransaction = manager
    ? data.transactions[0]
    : data.transactions.find((item) => belongsToConsultant(item, actor.id));
  const initialTransactionListState = transactionListState(
    searchParams,
    (linkedTransaction ?? latestListedTransaction)?.date.slice(0, 7) ??
      today().slice(0, 7),
  );
  const [transactionConsultantFilter, setTransactionConsultantFilter] =
    useState(manager ? initialTransactionListState.scope : actor.id);
  const [transactionPeriod, setTransactionPeriod] = useState<FinancePeriod>(
    manager ? initialTransactionListState.period : "month",
  );
  const [transactionPeriodAnchor, setTransactionPeriodAnchor] = useState(
    initialTransactionListState.anchor,
  );
  const [transactionRangeFrom, setTransactionRangeFrom] = useState(
    initialTransactionListState.from,
  );
  const [transactionRangeTo, setTransactionRangeTo] = useState(
    initialTransactionListState.to,
  );
  const [transactionSearch, setTransactionSearch] = useState("");
  const changeChartRangeFrom = (value: string) => {
    setChartRangeFrom(value);
    if (value && chartRangeTo && value > chartRangeTo) setChartRangeTo(value);
  };
  const changeChartRangeTo = (value: string) => {
    setChartRangeTo(value);
    if (value && chartRangeFrom && value < chartRangeFrom)
      setChartRangeFrom(value);
  };
  const changeTransactionRangeFrom = (value: string) => {
    setTransactionRangeFrom(value);
    if (value && transactionRangeTo && value > transactionRangeTo)
      setTransactionRangeTo(value);
  };
  const changeTransactionRangeTo = (value: string) => {
    setTransactionRangeTo(value);
    if (value && transactionRangeFrom && value < transactionRangeFrom)
      setTransactionRangeFrom(value);
  };
  const [deletingTransaction, setDeletingTransaction] = useState<
    FinancePageData["transactions"][number] | null
  >(null);
  const [viewingTransaction, setViewingTransaction] = useState<
    FinancePageData["transactions"][number] | null
  >(linkedTransaction);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [payingInvoice, setPayingInvoice] = useState<
    FinancePageData["invoices"][number] | null
  >(null);
  const categoryName = (id: string) => {
    const item = data.categories.find((category) => category.id === id);
    return item ? item.name[locale === "sv-SE" ? "sv" : "en"] : "—";
  };
  const categoryCode = (id: string) =>
    data.categories.find((category) => category.id === id)?.code ?? "";
  const consultantName = (id: string | null) =>
    id
      ? (data.users.find((user) => user.id === id)?.displayName ?? "—")
      : t("companyOnly");
  const selectedModel = data.users.find(
    (user) => user.id === selectedConsultant,
  )?.compensationModel;
  const invoiceConsultantIds = useMemo(
    () =>
      new Map(
        data.transactions
          .filter((item) => item.invoiceId)
          .map((item) => [item.invoiceId!, item.invoiceConsultantId]),
      ),
    [data.transactions],
  );
  const visibleTransactions = useMemo(
    () =>
      selectedConsultant === "all"
        ? data.transactions
        : selectedConsultant === "company"
          ? data.transactions.filter(belongsToCompany)
          : data.transactions.filter(
              (item) =>
                belongsToConsultant(
                  item,
                  selectedConsultant,
                  manager ? expenseFundingFilter : "consultant",
                ) ||
                (manager &&
                  selectedModel === "fixed" &&
                  belongsToFixedConsultantResult(
                    item,
                    selectedConsultant,
                    item.invoiceId
                      ? (invoiceConsultantIds.get(item.invoiceId) ?? null)
                      : null,
                  )),
            ),
    [
      data.transactions,
      expenseFundingFilter,
      invoiceConsultantIds,
      manager,
      selectedConsultant,
      selectedModel,
    ],
  );
  const summaryTransactions = useMemo(
    () =>
      selectedConsultant === "all"
        ? data.transactions
        : selectedConsultant === "company"
          ? data.transactions.filter(belongsToCompany)
          : data.transactions.filter(
              (item) =>
                belongsToConsultant(item, selectedConsultant, "all") ||
                (selectedModel === "fixed" &&
                  belongsToFixedConsultantResult(
                    item,
                    selectedConsultant,
                    item.invoiceId
                      ? (invoiceConsultantIds.get(item.invoiceId) ?? null)
                      : null,
                  )),
            ),
    [
      data.transactions,
      invoiceConsultantIds,
      selectedConsultant,
      selectedModel,
    ],
  );
  const visibleOverviewTransactions = useMemo(
    () =>
      visibleTransactions.filter((transaction) =>
        inFinancePeriod(
          transaction.date,
          chartPeriod,
          chartAnchor,
          chartRangeFrom,
          chartRangeTo,
        ),
      ),
    [
      chartAnchor,
      chartPeriod,
      chartRangeFrom,
      chartRangeTo,
      visibleTransactions,
    ],
  );
  const totals = financeTotals(
    selectedConsultant === "company"
      ? summaryTransactions.map((transaction) => ({
          ...transaction,
          consultantBalanceDeltaMinor: companyBalanceDeltaMinor(transaction),
        }))
      : summaryTransactions,
  );
  // For a flexible or hybrid consultant the overview's income is their
  // share, the same figure as "Income (consultant share)" in Income and
  // expenses. Fixed-salary consultants have no share, so their income is the
  // whole invoice income they bring in.
  const selectedConsultantEarnsShare =
    selectedConsultant !== "all" &&
    selectedConsultant !== "company" &&
    earnsInvoiceShare(selectedModel);
  const consultantShareIncome = selectedConsultantEarnsShare
    ? summaryTransactions.map((transaction) => ({
        ...transaction,
        netMinor: consultantIncomeShareMinor(transaction),
      }))
    : summaryTransactions;
  const netIncomeMinor = selectedConsultantEarnsShare
    ? consultantShareIncome.reduce(
        (sum, transaction) => sum + transaction.netMinor,
        0,
      )
    : totals.incomeMinor;
  const netIncomeHistory = transactionFinanceHistory(
    consultantShareIncome.filter(
      (transaction) =>
        !selectedConsultantEarnsShare || transaction.netMinor !== 0,
    ),
    "income",
  );
  const netIncomeTitle = selectedConsultantEarnsShare
    ? t("netIncomeConsultantShare")
    : selectedConsultant !== "all" && selectedConsultant !== "company"
      ? t("netIncomeFromConsultant")
      : t("netIncome");
  const organizationVatPayable = vatPayableMinor(
    data.transactions,
    data.vatSettlements,
  );
  const vatHistory = vatPayableHistory(data.transactions, data.vatSettlements);
  const earnedShareHistory = consultantBalanceMovementHistory(
    summaryTransactions,
    "earned",
  );
  const spentFromBalanceHistory = consultantBalanceMovementHistory(
    summaryTransactions,
    "spent",
  );
  const earnedShare = earnedShareHistory.at(-1)?.runningTotalMinor ?? 0;
  const spentFromBalance =
    spentFromBalanceHistory.at(-1)?.runningTotalMinor ?? 0;
  const consultantLiability = manager
    ? data.users
        .filter((user) => earnsInvoiceShare(user.compensationModel))
        .reduce(
          (sum, user) =>
            sum +
            Math.max(
              0,
              data.transactions
                .filter((item) => item.consultantId === user.id)
                .reduce(
                  (value, item) => value + item.consultantBalanceDeltaMinor,
                  0,
                ),
            ),
          0,
        )
    : totals.balanceMinor;
  const outstandingInvoicesHistory = outstandingInvoiceHistory(
    data.invoices.filter(
      (invoice) =>
        selectedConsultant === "all" ||
        selectedConsultant === "company" ||
        invoice.consultantId === selectedConsultant,
    ),
    selectedConsultant === "company",
  );
  const outstandingInvoices =
    outstandingInvoicesHistory.at(-1)?.runningTotalMinor ?? 0;
  const historyConsultantName = (id: string) =>
    data.users.find((user) => user.id === id)?.displayName ?? "—";
  const consultantBalanceHistory =
    earnsInvoiceShare(selectedModel) &&
    selectedConsultant !== "all" &&
    selectedConsultant !== "company"
      ? flexibleConsultantBalanceHistory(
          data.invoices,
          data.transactions,
          selectedConsultant,
        )
      : [];
  const retainedResultHistory =
    selectedConsultant === "company"
      ? transactionFinanceHistory(summaryTransactions, "result")
      : selectedConsultant !== "all"
        ? earnsInvoiceShare(selectedModel)
          ? flexibleConsultantRetainedResultHistory(
              data.invoices,
              data.transactions,
              selectedConsultant,
            )
          : selectedModel === "fixed"
            ? fixedConsultantRetainedResultHistory(
                data.invoices,
                data.transactions,
                selectedConsultant,
              )
            : []
        : [];
  const selectedFlexibleConsultantBalance =
    consultantBalanceHistory.at(-1)?.runningTotalMinor ?? 0;
  const retainedResult =
    selectedModel &&
    selectedConsultant !== "all" &&
    selectedConsultant !== "company"
      ? (retainedResultHistory.at(-1)?.runningTotalMinor ?? 0)
      : totals.netResultMinor -
        (selectedConsultant === "all" ? consultantLiability : 0);
  const monthlyCompensationRows = monthlyCompensation(
    data.agreements,
    data.transactions,
    selectedConsultant,
    today(),
  );
  const filteredInvoices = data.invoices.filter(
    (invoice) =>
      (invoiceConsultantFilter === "all" ||
        (invoiceConsultantFilter === "company" &&
          invoice.consultantId === null) ||
        invoice.consultantId === invoiceConsultantFilter) &&
      (invoiceStatusFilter === "all" || invoice.status === invoiceStatusFilter),
  );
  const normalizedTransactionSearch = transactionSearch
    .trim()
    .toLocaleLowerCase(locale);
  // Managers looking at one consultant see everything the company earned and
  // spent through them: the whole invoice income (company share with VAT and
  // any consultant share) and expenses of every funding.
  const transactionListShowsConsultant =
    transactionConsultantFilter !== "all" &&
    transactionConsultantFilter !== "company";
  const managerConsultantTransactionList =
    manager && transactionListShowsConsultant;
  const transactionListTransactions = data.transactions.filter(
    (transaction) => {
      const matchesConsultant =
        transactionConsultantFilter === "all" ||
        (transactionConsultantFilter === "company" &&
          belongsToCompany(transaction)) ||
        (transactionListShowsConsultant &&
          (manager
            ? belongsToConsultantLedger(
                transaction,
                transactionConsultantFilter,
              )
            : belongsToConsultant(transaction, transactionConsultantFilter)));
      const matchesPeriod = inFinancePeriod(
        transaction.date,
        transactionPeriod,
        transactionPeriodAnchor,
        transactionRangeFrom,
        transactionRangeTo,
      );
      const searchable = [
        t(transaction.direction),
        categoryName(transaction.categoryId),
        transactionTableDescription(transaction),
      ]
        .join(" ")
        .toLocaleLowerCase(locale);
      return (
        matchesConsultant &&
        matchesPeriod &&
        (!normalizedTransactionSearch ||
          searchable.includes(normalizedTransactionSearch))
      );
    },
  );
  const transactionListTotals = transactionPeriodTotals(
    transactionListTransactions,
  );
  // Split income like expenses for consultants whose income is shared with
  // the company. Fixed-salary consultants have no share, so they only get
  // Total income (unless the period holds income from an earlier agreement
  // that did credit them).
  const transactionListShowsIncomeShares =
    managerConsultantTransactionList &&
    (earnsInvoiceShare(
      data.users.find((user) => user.id === transactionConsultantFilter)
        ?.compensationModel,
    ) ||
      transactionListTotals.consultantShareIncomeNetMinor !== 0);
  const transactionListBalanceChange = (
    transaction: FinancePageData["transactions"][number],
  ) =>
    manager && transactionConsultantFilter === "company"
      ? companyBalanceDeltaMinor(transaction)
      : // The company share of an invoice is not the consultant's balance.
        managerConsultantTransactionList &&
          transaction.consultantId !== transactionConsultantFilter
        ? 0
        : transaction.consultantBalanceDeltaMinor;
  const transactionDeleteProtection = (
    transaction: FinancePageData["transactions"][number],
  ) =>
    transaction.invoiceId
      ? t("invoiceTransactionDeleteProtected")
      : transaction.reversedByTransactionId || transaction.status === "reversal"
        ? t("reversalTransactionDeleteProtected")
        : "";
  const transactionReturnHref = transactionListHref({
    scope: transactionConsultantFilter,
    period: transactionPeriod,
    anchor: transactionPeriodAnchor,
    from: transactionRangeFrom,
    to: transactionRangeTo,
  });
  const transactionFormHref = (path: string) =>
    `${path}?${new URLSearchParams({ returnTo: transactionReturnHref })}`;

  function downloadTransactionCsv() {
    const userNumber = new Map(
      data.users.map((user) => [user.id, user.employeeNumber]),
    );
    const categoryCodeById = new Map(
      data.categories.map((category) => [category.id, category.code]),
    );
    const csv = createFinanceCsv(
      transactionExportCsvHeaders,
      transactionListTransactions.map((transaction) => ({
        direction: transaction.direction,
        import_key: transaction.id,
        consultant_employee_number:
          userNumber.get(transaction.consultantId ?? "") ?? "",
        date: transaction.date,
        category_code: categoryCodeById.get(transaction.categoryId) ?? "",
        net_sek: (transaction.netMinor / 100).toFixed(2),
        vat_percent: (transaction.vatRateBps / 100).toFixed(2),
        funding: transaction.funding ?? "",
        apply_share: transaction.applyConsultantShare ? "true" : "false",
        description: transaction.visibleDescription,
        internal_note: transaction.internalNote,
        share_percent:
          transaction.shareBpsOverride === null
            ? ""
            : (transaction.shareBpsOverride / 100).toFixed(2),
      })),
    );
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `income-expenses-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printTransactionPdf() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    const rows = transactionListTransactions
      .map(
        (transaction) => `<tr>
          <td>${escapeHtml(transaction.date)}</td>
          <td>${escapeHtml(t(transaction.direction))}</td>
          <td>${escapeHtml(categoryName(transaction.categoryId))}</td>
          <td>${escapeHtml(consultantName(transaction.consultantId))}</td>
          <td>${escapeHtml(transactionTableDescription(transaction) || "—")}</td>
          <td>${escapeHtml(formatSek(transaction.netMinor, locale))}</td>
          <td>${escapeHtml(formatSek(transaction.grossMinor, locale))}</td>
        </tr>`,
      )
      .join("");
    printWindow.document
      .write(`<!doctype html><html lang="${locale.slice(0, 2)}"><head><title>${escapeHtml(t("incomeExpenseManagement"))}</title><style>
      body{font:12px Arial,sans-serif;color:#172033;margin:24px}h1{font-size:22px} .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}.summary div{border:1px solid #ccd3dd;border-radius:6px;padding:10px}.summary span{display:block;color:#526070;margin-bottom:5px}.summary strong{font-size:14px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #dfe4ea;padding:8px;text-align:left}th{background:#f3f5f7}@page{size:landscape;margin:12mm}
    </style></head><body><h1>${escapeHtml(t("incomeExpenseManagement"))}</h1>
      <div class="summary" style="grid-template-columns:repeat(${Math.min(transactionTotalsSummary.length, 3)},1fr)">
        ${transactionTotalsSummary.map(({ label, netMinor, grossMinor }, index) => `<div${startsExpenseRow(index) ? ' style="grid-column-start:1"' : ""}><span>${escapeHtml(t(label))}</span><strong>${escapeHtml(formatTotalWithVat(netMinor, grossMinor))}</strong></div>`).join("")}
      </div><table><thead><tr><th>${escapeHtml(t("date"))}</th><th>${escapeHtml(t("type"))}</th><th>${escapeHtml(t("category"))}</th><th>${escapeHtml(t("consultant"))}</th><th>${escapeHtml(t("description"))}</th><th>${escapeHtml(t("netAmount"))}</th><th>${escapeHtml(t("totalIncludingVat"))}</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
    printWindow.document.close();
  }
  const chartMode =
    !manager || earnsInvoiceShare(selectedModel) ? "balance" : "result";

  async function post(
    payload: Record<string, unknown>,
    successKey: Parameters<typeof t>[0],
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await appCheckFetch("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(
          t(
            `financeError_${result.error ?? "financeOperationFailed"}` as Parameters<
              typeof t
            >[0],
          ),
        );
        return false;
      }
      setMessage(t(successKey));
      router.refresh();
      return true;
    } catch {
      setError(t("serverUnavailable"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data.financeEnabled)
    return (
      <>
        <div className="topbar">
          <div>
            <div className="eyebrow">{t("finance")}</div>
            <h1>{t("financialOverview")}</h1>
            <p className="muted page-description">
              {t("financeDisabledDescription")}
            </p>
          </div>
        </div>
        <section className="card">
          <p>
            {admin ? t("financeEnableWarning") : t("financeAwaitingActivation")}
          </p>
          {admin && (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void post({ action: "enableFinance" }, "financeEnabledMessage")
              }
            >
              {t("enableFinance")}
            </button>
          )}
          {error && <p className="notice notice-error">{error}</p>}
        </section>
      </>
    );

  const title = {
    overview: manager ? t("financialOverview") : t("myFinances"),
    invoices: manager ? t("invoiceManagement") : t("myInvoices"),
    categories: t("categoryManagement"),
    transactions: t("incomeExpenseManagement"),
    customers: t("customerManagement"),
  }[section];
  // Managers see each total excluding VAT with its VAT beside it, for
  // example "100 000 kr (+25 000 kr VAT)". Consultants see net amounts only.
  const transactionTotalsSummary: Array<{
    label: Parameters<typeof t>[0];
    netMinor: number;
    grossMinor?: number;
  }> = manager
    ? [
        ...(transactionListShowsIncomeShares
          ? [
              {
                label: "incomeConsultantShare" as const,
                netMinor: transactionListTotals.consultantShareIncomeNetMinor,
                // The consultant share carries no VAT.
                grossMinor: transactionListTotals.consultantShareIncomeNetMinor,
              },
              {
                label: "incomeCompanyShare" as const,
                netMinor: transactionListTotals.companyShareIncomeNetMinor,
                grossMinor: transactionListTotals.companyShareIncomeGrossMinor,
              },
            ]
          : []),
        {
          label: "totalIncome",
          netMinor: transactionListTotals.incomeNetMinor,
          grossMinor: transactionListTotals.incomeGrossMinor,
        },
        ...(managerConsultantTransactionList
          ? [
              {
                label: "totalConsultantFundedExpenses" as const,
                netMinor: transactionListTotals.consultantFundedExpenseNetMinor,
                grossMinor:
                  transactionListTotals.consultantFundedExpenseGrossMinor,
              },
              {
                label: "totalCompanyFundedExpenses" as const,
                netMinor: transactionListTotals.companyFundedExpenseNetMinor,
                grossMinor:
                  transactionListTotals.companyFundedExpenseGrossMinor,
              },
            ]
          : []),
        {
          label: "totalExpenses",
          netMinor: transactionListTotals.expenseNetMinor,
          grossMinor: transactionListTotals.expenseGrossMinor,
        },
      ]
    : [
        {
          label: "totalIncome",
          netMinor: transactionListTotals.incomeNetMinor,
        },
        {
          label: "totalExpenses",
          netMinor: transactionListTotals.expenseNetMinor,
        },
      ];
  // With more than two totals, income fills the first row and expenses
  // start on a row of their own.
  const firstExpenseTotal = transactionTotalsSummary.findIndex(({ label }) =>
    expenseTotalLabels.has(label),
  );
  const startsExpenseRow = (index: number) =>
    transactionTotalsSummary.length > 2 && index === firstExpenseTotal;
  function formatTotalWithVat(netMinor: number, grossMinor?: number) {
    if (grossMinor === undefined) return formatSekCompact(netMinor, locale);
    return t("amountPlusVat")
      .replace("{amount}", formatSekCompact(netMinor, locale))
      .replace("{vat}", formatSekCompact(grossMinor - netMinor, locale));
  }
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">{t("finance")}</div>
          <h1>{title}</h1>
          <p className="muted page-description">
            {section === "overview"
              ? manager
                ? t("financeManagementDescription")
                : t("consultantFinanceDescription")
              : section === "invoices" && !manager
                ? t("consultantInvoicesDescription")
                : section === "transactions" && !manager
                  ? t("consultantTransactionsDescription")
                  : t(
                      `${section}SectionDescription` as Parameters<typeof t>[0],
                    )}
          </p>
        </div>
      </div>
      {(error || message) && (
        <p className={`notice ${error ? "notice-error" : "notice-success"}`}>
          {error || message}
        </p>
      )}

      {section === "overview" && (
        <>
          <section className="finance-metrics">
            <div className="metric">
              {manager ? (
                <button
                  className="metric-button"
                  type="button"
                  onClick={() => setFinanceHistory("netIncome")}
                >
                  <span>{netIncomeTitle}</span>
                  <strong>{formatSek(netIncomeMinor, locale)}</strong>
                  <small>{t("viewHistory")}</small>
                </button>
              ) : (
                <button
                  className="metric-button"
                  type="button"
                  onClick={() => setFinanceHistory("earnedShare")}
                >
                  <span>{t("earnedShare")}</span>
                  <strong>{formatSek(earnedShare, locale)}</strong>
                  <small>{t("viewHistory")}</small>
                </button>
              )}
            </div>
            <div className="metric">
              {manager ? (
                <>
                  {/* Every expense booked on the consultant, whatever its
                      funding, like Total expenses in Income and expenses.
                      The expense funding filter only narrows the charts. */}
                  <span>
                    {selectedConsultant !== "all" &&
                    selectedConsultant !== "company"
                      ? t("totalExpenses")
                      : t("netExpenses")}
                  </span>
                  <strong>{formatSek(totals.expenseMinor, locale)}</strong>
                </>
              ) : (
                <button
                  className="metric-button"
                  type="button"
                  onClick={() => setFinanceHistory("spentFromBalance")}
                >
                  <span>{t("spentFromBalance")}</span>
                  <strong>{formatSek(spentFromBalance, locale)}</strong>
                  <small>{t("viewHistory")}</small>
                </button>
              )}
            </div>
            {(selectedConsultant === "all" ||
              (selectedConsultant !== "company" &&
                selectedModel !== "fixed")) && (
              <div className="metric">
                {earnsInvoiceShare(selectedModel) &&
                selectedConsultant !== "all" &&
                selectedConsultant !== "company" ? (
                  <button
                    className="metric-button"
                    type="button"
                    onClick={() => setFinanceHistory("consultantBalance")}
                  >
                    <span>
                      {manager
                        ? t("consultantLiability")
                        : t("remainingBalance")}
                    </span>
                    <strong>
                      {formatSek(selectedFlexibleConsultantBalance, locale)}
                    </strong>
                    <small>{t("viewHistory")}</small>
                  </button>
                ) : (
                  <>
                    <span>
                      {manager
                        ? selectedConsultant === "company"
                          ? t("companyBalance")
                          : t("consultantLiability")
                        : t("remainingBalance")}
                    </span>
                    <strong>
                      {formatSek(
                        selectedConsultant === "all"
                          ? consultantLiability
                          : totals.balanceMinor,
                        locale,
                      )}
                    </strong>
                  </>
                )}
              </div>
            )}
            {manager && (
              <>
                {can(actor, "finance.vat.view") &&
                  (selectedConsultant === "all" ||
                    selectedConsultant === "company") && (
                    <div className="metric">
                      <button
                        className="metric-button"
                        type="button"
                        onClick={() => setFinanceHistory("vatPayable")}
                      >
                        <span>{t("vatPayable")}</span>
                        <strong>
                          {formatSek(organizationVatPayable, locale)}
                        </strong>
                        <small>{t("viewHistory")}</small>
                      </button>
                    </div>
                  )}
                <div className="metric">
                  {(selectedModel &&
                    selectedConsultant !== "all" &&
                    selectedConsultant !== "company") ||
                  selectedConsultant === "company" ? (
                    <button
                      className="metric-button"
                      type="button"
                      onClick={() => setFinanceHistory("retainedResult")}
                    >
                      <span>{t("retainedResult")}</span>
                      <strong>{formatSek(retainedResult, locale)}</strong>
                      <small>{t("viewHistory")}</small>
                    </button>
                  ) : (
                    <>
                      <span>{t("retainedResult")}</span>
                      <strong>{formatSek(retainedResult, locale)}</strong>
                    </>
                  )}
                </div>
                {can(actor, "finance.invoices.view") && (
                  <div className="metric">
                    <button
                      className="metric-button"
                      type="button"
                      onClick={() => setFinanceHistory("outstandingInvoices")}
                    >
                      <span>
                        {t(
                          selectedConsultant === "company"
                            ? "companyOutstandingInvoiceShare"
                            : "outstandingInvoices",
                        )}
                      </span>
                      <strong>{formatSek(outstandingInvoices, locale)}</strong>
                      <small>{t("showDetails")}</small>
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
          {monthlyCompensationRows.length > 0 && (
            <section className="card table-wrap">
              <div className="week-head">
                <h2>
                  {t("monthlyCompensation")}{" "}
                  <InfoTip text={t("monthlyCompensationTip")} />
                </h2>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>{t("month")}</th>
                    <th>{t("fixedSalary")}</th>
                    <th>{t("invoiceShare")}</th>
                    <th>{t("total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyCompensationRows.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{formatSek(row.fixedMinor, locale)}</td>
                      <td>{formatSek(row.shareMinor, locale)}</td>
                      <td>{formatSek(row.totalMinor, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="card finance-chart-controls">
            <div className="finance-chart-filter-groups">
              <div className="finance-chart-filter-group">
                <h2>{t("chartPeriod")}</h2>
                <div className="actions">
                  <select
                    className="field finance-period"
                    aria-label={t("chartPeriod")}
                    value={chartPeriod}
                    onChange={(event) =>
                      setChartPeriod(event.target.value as typeof chartPeriod)
                    }
                  >
                    <option value="month">{t("month")}</option>
                    <option value="year">{t("year")}</option>
                    <option value="range">{t("customDateRange")}</option>
                    <option value="all">{t("allTime")}</option>
                  </select>
                  {chartPeriod === "month" && (
                    <div className="month-stepper finance-chart-date-control">
                      <button
                        className="button secondary month-step-button"
                        type="button"
                        aria-label={t("previousMonth")}
                        title={t("previousMonth")}
                        onClick={() =>
                          setChartAnchor(shiftMonth(chartAnchor, -1))
                        }
                      >
                        {"\u2039"}
                      </button>
                      <input
                        className="field finance-period"
                        type="month"
                        aria-label={t("chartPeriod")}
                        value={chartAnchor}
                        onChange={(event) => setChartAnchor(event.target.value)}
                      />
                      <button
                        className="button secondary month-step-button"
                        type="button"
                        aria-label={t("nextMonth")}
                        title={t("nextMonth")}
                        onClick={() =>
                          setChartAnchor(shiftMonth(chartAnchor, 1))
                        }
                      >
                        {"\u203a"}
                      </button>
                    </div>
                  )}
                  {chartPeriod === "year" && (
                    <input
                      className="field finance-period finance-chart-date-control"
                      type="number"
                      min="2000"
                      max="2100"
                      aria-label={t("chartPeriod")}
                      value={chartAnchor.slice(0, 4)}
                      onChange={(event) =>
                        setChartAnchor(`${event.target.value}-01`)
                      }
                    />
                  )}
                  {reportUserId &&
                    (chartPeriod === "month" || chartPeriod === "year") && (
                      <ReportExportButtons
                        endpoint="/api/finance/report"
                        query={{
                          userId: reportUserId,
                          year: chartAnchor.slice(0, 4),
                          ...(chartPeriod === "month"
                            ? { month: String(Number(chartAnchor.slice(5, 7))) }
                            : {}),
                        }}
                        hints={{
                          xlsx: "financeExportExcelHint",
                          pdf: "financeExportPdfHint",
                        }}
                        errorKey="financeReportExportFailed"
                        disabled={!/^\d{4}-\d{2}$/.test(chartAnchor)}
                      />
                    )}
                  {chartPeriod === "range" && (
                    <>
                      <label className="compact-date-field">
                        {t("fromDateInclusive")}
                        <DateInput
                          className="field finance-period"
                          value={chartRangeFrom}
                          onChange={(event) =>
                            changeChartRangeFrom(event.target.value)
                          }
                        />
                      </label>
                      <label className="compact-date-field">
                        {t("toDateInclusive")}
                        <DateInput
                          className="field finance-period"
                          value={chartRangeTo}
                          onChange={(event) =>
                            changeChartRangeTo(event.target.value)
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
              {manager && (
                <div className="finance-chart-filter-group finance-chart-consultant-filters">
                  <div className="actions">
                    <label className="compact-date-field">
                      {t("consultant")}
                      <select
                        className="field"
                        value={selectedConsultant}
                        onChange={(event) => {
                          setSelectedConsultant(event.target.value);
                          setExpenseFundingFilter("all");
                        }}
                      >
                        <option value="all">
                          {t("allConsultantsAndCompany")}
                        </option>
                        <option value="company">{t("companyOnly")}</option>
                        {data.users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedConsultant !== "all" &&
                      selectedConsultant !== "company" && (
                        <label className="compact-date-field">
                          {t("expenseFundingFilter")}
                          <select
                            className="field"
                            value={expenseFundingFilter}
                            onChange={(event) =>
                              setExpenseFundingFilter(
                                event.target.value as ExpenseFundingFilter,
                              )
                            }
                          >
                            <option value="all">{t("allExpenses")}</option>
                            <option value="company">
                              {t("companyFunded")}
                            </option>
                            <option value="consultant">
                              {t("consultantFunded")}
                            </option>
                          </select>
                        </label>
                      )}
                  </div>
                </div>
              )}
            </div>
          </section>
          <section className="card finance-chart-card">
            <h2>
              {chartMode === "balance"
                ? t("balanceHistory")
                : t("financialHistory")}
            </h2>
            <BalanceChart
              transactions={visibleTransactions}
              locale={locale}
              period={chartPeriod}
              anchor={chartAnchor}
              rangeFrom={chartRangeFrom}
              rangeTo={chartRangeTo}
              mode={chartMode}
              categoryName={categoryName}
            />
          </section>
          <section className="card finance-chart-card">
            <div className="finance-income-expense-heading">
              <h2>{t("incomeExpenseChart")}</h2>
              <label className="checkbox-row finance-chart-vat-toggle">
                <input
                  type="checkbox"
                  checked={includeVatInIncomeExpense}
                  onChange={(event) =>
                    setIncludeVatInIncomeExpense(event.target.checked)
                  }
                />
                <span>{t("includeVat")}</span>
              </label>
            </div>
            <IncomeExpenseBarChart
              transactions={visibleTransactions}
              locale={locale}
              period={chartPeriod}
              anchor={chartAnchor}
              rangeFrom={chartRangeFrom}
              rangeTo={chartRangeTo}
              includeVat={includeVatInIncomeExpense}
            />
          </section>
          {chartPeriod !== "all" && (
            <section className="card finance-chart-card">
              <h2>{t("expenseCategoryChart")}</h2>
              <ExpenseCategoryChart
                transactions={visibleOverviewTransactions}
                locale={locale}
                categoryName={categoryName}
                categoryCode={categoryCode}
              />
            </section>
          )}
        </>
      )}

      {manager && section === "customers" && (
        <section className="card table-wrap">
          <div className="week-head">
            <h2>{t("currentCustomers")}</h2>
            {can(actor, "finance.customers.add") && (
              <Link className="button" href="/finance/customers/new">
                {t("addCustomer")}
              </Link>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("customerName")}</th>
                <th>{t("contactPerson")}</th>
                <th>{t("financeDepartmentEmail")}</th>
                <th>
                  <span className="sr-only">{t("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.contactPerson}</td>
                  <td>{customer.financeEmail}</td>
                  <td>
                    {canEditCustomers && (
                      <Link
                        className="table-action icon-action"
                        aria-label={t("edit")}
                        title={t("edit")}
                        href={`/finance/customers/${customer.id}/edit`}
                      >
                        <ActionIcon type="edit" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {manager && section === "categories" && (
        <section className="card table-wrap">
          <div className="week-head">
            <h2>{t("currentCategories")}</h2>
            {can(actor, "finance.categories.add") && (
              <Link className="button" href="/finance/categories/new">
                {t("addCategory")}
              </Link>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("categoryCode")}</th>
                <th>{t("englishName")}</th>
                <th>{t("swedishName")}</th>
                <th>{t("type")}</th>
                <th>{t("status")}</th>
                {canEditCategories && (
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.code}</td>
                  <td>{category.name.en}</td>
                  <td>{category.name.sv}</td>
                  <td>{t(category.direction)}</td>
                  <td>{t(category.active ? "active" : "inactive")}</td>
                  {canEditCategories && (
                    <td>
                      <Link
                        className="table-action icon-action"
                        aria-label={t("edit")}
                        title={t("edit")}
                        href={`/finance/categories/${category.id}/edit`}
                      >
                        <ActionIcon type="edit" />
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {section === "invoices" && (
        <>
          {manager && (
            <section className="card">
              <div className="week-head">
                <h2>{t("invoices")}</h2>
                <div className="actions">
                  {can(actor, "finance.invoices.import") && (
                    <Link
                      className="button secondary"
                      href="/finance/invoices/import"
                    >
                      {t("csvImport")}
                    </Link>
                  )}
                  {can(actor, "finance.invoices.add") && (
                    <Link className="button" href="/finance/invoices/new">
                      {t("addInvoice")}
                    </Link>
                  )}
                </div>
              </div>
              <div className="finance-filter-bar">
                <label>
                  {t("consultant")}
                  <select
                    className="field"
                    value={invoiceConsultantFilter}
                    onChange={(event) =>
                      setInvoiceConsultantFilter(event.target.value)
                    }
                  >
                    <option value="all">{t("allConsultantsAndCompany")}</option>
                    <option value="company">{t("companyOnly")}</option>
                    {data.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("paymentStatus")}
                  <select
                    className="field"
                    value={invoiceStatusFilter}
                    onChange={(event) =>
                      setInvoiceStatusFilter(event.target.value)
                    }
                  >
                    <option value="all">{t("allStatuses")}</option>
                    <option value="issued">{t("issued")}</option>
                    <option value="paid">{t("paid")}</option>
                  </select>
                </label>
              </div>
            </section>
          )}
          <section className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("invoiceNumber")}</th>
                  <th>{t("customer")}</th>
                  {manager && <th>{t("consultant")}</th>}
                  <th>{t("issueDate")}</th>
                  <th>{t("paymentDate")}</th>
                  <th>{t("netAmount")}</th>
                  <th>
                    {manager ? t("totalIncludingVat") : t("myInvoiceShare")}
                  </th>
                  <th>{t("status")}</th>
                  {manager && (
                    <th>
                      <span className="sr-only">{t("actions")}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>{invoice.customerName}</td>
                    {manager && <td>{consultantName(invoice.consultantId)}</td>}
                    <td>{invoice.issueDate}</td>
                    <td>{invoice.paidDate ?? "—"}</td>
                    <td>{formatSek(invoice.netMinor, locale)}</td>
                    <td>
                      {manager
                        ? formatSek(invoice.grossMinor, locale)
                        : `${formatSek(
                            calculateShareMinor(
                              invoice.netMinor,
                              invoice.shareBps,
                            ),
                            locale,
                          )} (${new Intl.NumberFormat(locale, {
                            maximumFractionDigits: 2,
                          }).format(invoice.shareBps / 100)}%)`}
                    </td>
                    <td>{t(invoice.status)}</td>
                    {manager && (
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={t("viewDetails")}
                            title={t("viewDetails")}
                            onClick={() => setViewingInvoice(invoice)}
                          >
                            i
                          </button>
                          {canEditInvoices && (
                            <Link
                              className="table-action icon-action"
                              href={`/finance/invoices/${encodeURIComponent(invoice.id)}/attachments`}
                              aria-label={t("editInvoiceAttachments")}
                              title={t("editInvoiceAttachments")}
                            >
                              <ActionIcon type="edit" />
                            </Link>
                          )}
                          {canEditInvoices && invoice.status === "issued" && (
                            <button
                              className="table-action"
                              type="button"
                              onClick={() => setPayingInvoice(invoice)}
                            >
                              {t("markAsPaid")}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {section === "transactions" && (
        <>
          {manager && (
            <div className="actions finance-page-actions">
              {can(actor, "finance.ledger.export") && (
                <>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={downloadTransactionCsv}
                  >
                    {t("exportCsv")}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={printTransactionPdf}
                  >
                    {t("exportPdf")}
                  </button>
                </>
              )}
              {canAddLedger && (
                <Link
                  className="button secondary"
                  href="/finance/transactions/copy-expenses"
                >
                  {t("copyExpensesButton")}
                </Link>
              )}
              {can(actor, "finance.ledger.import") && (
                <Link
                  className="button secondary"
                  href="/finance/transactions/import"
                >
                  {t("csvImport")}
                </Link>
              )}
              {canAddLedger && (
                <Link
                  className="button"
                  href={transactionFormHref("/finance/transactions/new")}
                >
                  {t("addTransaction")}
                </Link>
              )}
            </div>
          )}
          <section className="card finance-filter-bar finance-filter-bar-wide">
            {manager && (
              <>
                <label>
                  {t("showFinancialDataFor")}
                  <select
                    className="field"
                    value={transactionConsultantFilter}
                    onChange={(event) =>
                      setTransactionConsultantFilter(event.target.value)
                    }
                  >
                    <option value="all">{t("allConsultantsAndCompany")}</option>
                    <option value="company">{t("companyOnly")}</option>
                    {data.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("periodType")}
                  <select
                    className="field"
                    value={transactionPeriod}
                    onChange={(event) =>
                      setTransactionPeriod(event.target.value as FinancePeriod)
                    }
                  >
                    <option value="month">{t("month")}</option>
                    <option value="year">{t("year")}</option>
                    <option value="all">{t("allTime")}</option>
                    <option value="range">{t("customDateRange")}</option>
                  </select>
                </label>
              </>
            )}
            {transactionPeriod === "month" && (
              <div className="finance-filter-control">
                <span>{manager ? t("chartPeriod") : t("month")}</span>
                <div className="month-stepper">
                  <button
                    className="button secondary month-step-button"
                    type="button"
                    aria-label={t("previousMonth")}
                    title={t("previousMonth")}
                    onClick={() =>
                      setTransactionPeriodAnchor(
                        shiftMonth(transactionPeriodAnchor, -1),
                      )
                    }
                  >
                    {"\u2039"}
                  </button>
                  <input
                    className="field"
                    type="month"
                    value={transactionPeriodAnchor}
                    onChange={(event) =>
                      setTransactionPeriodAnchor(event.target.value)
                    }
                  />
                  <button
                    className="button secondary month-step-button"
                    type="button"
                    aria-label={t("nextMonth")}
                    title={t("nextMonth")}
                    onClick={() =>
                      setTransactionPeriodAnchor(
                        shiftMonth(transactionPeriodAnchor, 1),
                      )
                    }
                  >
                    {"\u203a"}
                  </button>
                </div>
              </div>
            )}
            {transactionPeriod === "year" && (
              <label>
                {t("chartPeriod")}
                <input
                  className="field"
                  type="number"
                  min="2000"
                  max="2100"
                  value={transactionPeriodAnchor.slice(0, 4)}
                  onChange={(event) =>
                    setTransactionPeriodAnchor(`${event.target.value}-01`)
                  }
                />
              </label>
            )}
            {transactionPeriod === "range" && (
              <>
                <label>
                  {t("fromDateInclusive")}
                  <DateInput
                    className="field"
                    value={transactionRangeFrom}
                    onChange={(event) =>
                      changeTransactionRangeFrom(event.target.value)
                    }
                  />
                </label>
                <label>
                  {t("toDateInclusive")}
                  <DateInput
                    className="field"
                    value={transactionRangeTo}
                    onChange={(event) =>
                      changeTransactionRangeTo(event.target.value)
                    }
                  />
                </label>
              </>
            )}
            <label>
              {t("searchTransactions")}
              <input
                className="field"
                type="search"
                value={transactionSearch}
                placeholder={t("searchTransactionsPlaceholder")}
                onChange={(event) => setTransactionSearch(event.target.value)}
              />
            </label>
          </section>
          <section
            className={`transaction-period-summary${transactionTotalsSummary.length === 2 ? " transaction-period-summary-pair" : ""}`}
            aria-label={t("periodTotals")}
          >
            {transactionTotalsSummary.map(
              ({ label, netMinor, grossMinor }, index) => (
                <div
                  key={label}
                  className={
                    startsExpenseRow(index)
                      ? "transaction-period-summary-row-start"
                      : undefined
                  }
                >
                  <span>{t(label)}</span>
                  <strong>{formatTotalWithVat(netMinor, grossMinor)}</strong>
                </div>
              ),
            )}
          </section>
        </>
      )}
      {section === "transactions" && (
        <section className="card table-wrap">
          <h2>{t("transactions")}</h2>
          <table>
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("type")}</th>
                <th>{t("category")}</th>
                {manager && <th>{t("consultant")}</th>}
                <th>{t("description")}</th>
                <th>{t("netAmount")}</th>
                <th>{t("totalIncludingVat")}</th>
                <th>{t("balanceChange")}</th>
                <th>{t("attachment")}</th>
                <th>
                  <span className="sr-only">{t("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {transactionListTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td>
                  <td>
                    <span
                      className={`direction-icon direction-${transaction.direction}`}
                      role="img"
                      aria-label={t(transaction.direction)}
                      title={t(transaction.direction)}
                    >
                      {transaction.direction === "income" ? (
                        <IncomePlusIcon />
                      ) : (
                        <ExpenseMinusIcon />
                      )}
                    </span>
                  </td>
                  <td>{categoryName(transaction.categoryId)}</td>
                  {manager && (
                    <td>{consultantName(transaction.consultantId)}</td>
                  )}
                  <td title={transactionTableDescription(transaction)}>
                    {abbreviateText(transactionTableDescription(transaction)) ||
                      "—"}
                  </td>
                  <td>{formatSekCompact(transaction.netMinor, locale)}</td>
                  <td>{formatSekCompact(transaction.grossMinor, locale)}</td>
                  <td>
                    {formatSekCompact(
                      transactionListBalanceChange(transaction),
                      locale,
                    )}
                  </td>
                  <td>
                    {transaction.attachments.length ? (
                      <div className="table-attachment-clips">
                        {transaction.attachments.map((attachment) => (
                          <AttachmentClip
                            key={attachment.id}
                            entityType="transaction"
                            entityId={transaction.id}
                            attachment={attachment}
                          />
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("viewDetails")}
                        title={t("viewDetails")}
                        onClick={() => setViewingTransaction(transaction)}
                      >
                        i
                      </button>
                      {(canEditLedger || canDeleteLedger) && (
                        <>
                          {canEditLedger &&
                            !transactionDeleteProtection(transaction) && (
                              <Link
                                className="table-action icon-action"
                                aria-label={t("edit")}
                                title={t("edit")}
                                href={transactionFormHref(
                                  `/finance/transactions/${encodeURIComponent(transaction.id)}/edit`,
                                )}
                              >
                                <ActionIcon type="edit" />
                              </Link>
                            )}
                          {canDeleteLedger && (
                            <div
                              className="protected-action"
                              tabIndex={
                                transactionDeleteProtection(transaction)
                                  ? 0
                                  : -1
                              }
                            >
                              <button
                                className="table-action table-action-danger icon-action"
                                aria-label={t("delete")}
                                title={t("delete")}
                                disabled={
                                  busy ||
                                  Boolean(
                                    transactionDeleteProtection(transaction),
                                  )
                                }
                                onClick={() => {
                                  setDeletingTransaction(transaction);
                                  setDeleteConfirmation("");
                                }}
                              >
                                <ActionIcon type="delete" />
                              </button>
                              {transactionDeleteProtection(transaction) && (
                                <span
                                  className="protected-action-tooltip"
                                  role="tooltip"
                                >
                                  {transactionDeleteProtection(transaction)}
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {viewingTransaction && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setViewingTransaction(null)}
        >
          <section
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-details-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("transactionDetails")}</span>
                <h2 id="transaction-details-title">
                  {categoryName(viewingTransaction.categoryId)}
                </h2>
                <p className="detail-meta">
                  <span>{viewingTransaction.date}</span>
                  <span>{consultantName(viewingTransaction.consultantId)}</span>
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                onClick={() => setViewingTransaction(null)}
              >
                {"\u00d7"}
              </button>
            </header>
            <DetailSummary
              tone={viewingTransaction.direction}
              tags={
                <>
                  <DetailTag tone={viewingTransaction.direction}>
                    {t(viewingTransaction.direction)}
                  </DetailTag>
                  {viewingTransaction.funding && (
                    <DetailTag>
                      {t(
                        viewingTransaction.funding === "company"
                          ? "companyFunded"
                          : "consultantFunded",
                      )}
                    </DetailTag>
                  )}
                </>
              }
              amount={formatSek(viewingTransaction.grossMinor, locale)}
              headline={t("totalIncludingVat")}
            >
              {viewingTransaction.visibleDescription}
            </DetailSummary>
            <DetailSections>
              <DetailSection title={t("detailAmounts")}>
                <DetailFacts
                  rows={[
                    [
                      t("netAmount"),
                      formatSek(viewingTransaction.netMinor, locale),
                    ],
                    [
                      t("vatAmount"),
                      formatSek(viewingTransaction.vatMinor, locale),
                    ],
                    viewingTransaction.roundingMinor !== 0 && [
                      t("rounding"),
                      formatSek(viewingTransaction.roundingMinor, locale),
                    ],
                    [
                      t("totalIncludingVat"),
                      formatSek(viewingTransaction.grossMinor, locale),
                    ],
                  ]}
                />
              </DetailSection>
              <DetailSection title={t("detailBooking")}>
                <DetailFacts
                  rows={[
                    [t("type"), t(viewingTransaction.direction)],
                    [
                      t("category"),
                      categoryName(viewingTransaction.categoryId),
                    ],
                    [
                      t("consultant"),
                      consultantName(viewingTransaction.consultantId),
                    ],
                    [
                      t("funding"),
                      viewingTransaction.funding
                        ? t(
                            viewingTransaction.funding === "company"
                              ? "companyFunded"
                              : "consultantFunded",
                          )
                        : "\u2014",
                    ],
                    [t("date"), viewingTransaction.date],
                  ]}
                />
              </DetailSection>
            </DetailSections>
            {manager && viewingTransaction.internalNote && (
              <DetailSection title={t("internalNote")}>
                <p>{viewingTransaction.internalNote}</p>
              </DetailSection>
            )}
            <AttachmentDownloads
              entityType="transaction"
              entityId={viewingTransaction.id}
            />
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setViewingTransaction(null)}
              >
                {t("close")}
              </button>
            </footer>
          </section>
        </div>
      )}

      {viewingInvoice && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setViewingInvoice(null)}
        >
          <section
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-details-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setViewingInvoice(null);
            }}
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow">{t("invoiceDetails")}</span>
                <h2 id="invoice-details-title">
                  {viewingInvoice.customerName || "\u2014"}
                </h2>
                <p className="detail-meta">
                  <span>
                    {t("invoiceNumber")} {viewingInvoice.invoiceNumber}
                  </span>
                  <span>{viewingInvoice.issueDate}</span>
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t("close")}
                autoFocus
                onClick={() => setViewingInvoice(null)}
              >
                {"\u00d7"}
              </button>
            </header>
            <DetailSummary
              tone={
                viewingInvoice.status === "paid"
                  ? "positive"
                  : viewingInvoice.status === "void"
                    ? "negative"
                    : "neutral"
              }
              tags={
                <DetailTag
                  tone={
                    viewingInvoice.status === "paid"
                      ? "positive"
                      : viewingInvoice.status === "void"
                        ? "negative"
                        : "neutral"
                  }
                >
                  {t(viewingInvoice.status)}
                </DetailTag>
              }
              amount={formatSek(viewingInvoice.grossMinor, locale)}
              headline={
                viewingInvoice.paidDate
                  ? `${t("paymentDate")} ${viewingInvoice.paidDate}`
                  : `${t("dueDate")} ${viewingInvoice.dueDate}`
              }
            >
              {viewingInvoice.visibleDescription}
            </DetailSummary>
            <DetailSections>
              <DetailSection title={t("detailAmounts")}>
                <DetailFacts
                  rows={[
                    [
                      t("netAmount"),
                      formatSek(viewingInvoice.netMinor, locale),
                    ],
                    [t("vatPercent"), `${viewingInvoice.vatRateBps / 100}%`],
                    [
                      t("vatAmount"),
                      formatSek(viewingInvoice.vatMinor, locale),
                    ],
                    viewingInvoice.roundingMinor !== 0 && [
                      t("rounding"),
                      formatSek(viewingInvoice.roundingMinor, locale),
                    ],
                    [
                      t("totalIncludingVat"),
                      formatSek(viewingInvoice.grossMinor, locale),
                    ],
                  ]}
                />
              </DetailSection>
              <DetailSection title={t("detailDates")}>
                <DetailFacts
                  rows={[
                    [t("issueDate"), viewingInvoice.issueDate],
                    [t("dueDate"), viewingInvoice.dueDate],
                    [t("paymentDate"), viewingInvoice.paidDate || "\u2014"],
                    viewingInvoice.periodFrom &&
                      viewingInvoice.periodTo && [
                        t("invoicePeriod"),
                        `${viewingInvoice.periodFrom} \u2013 ${viewingInvoice.periodTo}`,
                      ],
                  ]}
                />
              </DetailSection>
              <DetailSection title={t("customer")}>
                <DetailFacts
                  rows={[
                    [t("customer"), viewingInvoice.customerName],
                    [t("contactPerson"), viewingInvoice.customerContactPerson],
                    [
                      t("financeDepartmentEmail"),
                      viewingInvoice.customerFinanceEmail,
                    ],
                  ]}
                />
              </DetailSection>
              <DetailSection title={t("detailConsultantShare")}>
                <DetailFacts
                  rows={[
                    [
                      t("consultant"),
                      consultantName(viewingInvoice.consultantId),
                    ],
                    [
                      t("compensationModel"),
                      viewingInvoice.compensationModel
                        ? t(
                            compensationModelLabels[
                              viewingInvoice.compensationModel
                            ],
                          )
                        : "\u2014",
                    ],
                    [
                      t("invoiceSharePercent"),
                      `${viewingInvoice.shareBps / 100}%`,
                    ],
                  ]}
                />
              </DetailSection>
            </DetailSections>
            {viewingInvoice.internalNote && (
              <DetailSection title={t("internalNote")}>
                <p>{viewingInvoice.internalNote}</p>
              </DetailSection>
            )}
            <AttachmentDownloads
              entityType="invoice"
              entityId={viewingInvoice.id}
            />
            <footer className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setViewingInvoice(null)}
              >
                {t("close")}
              </button>
            </footer>
          </section>
        </div>
      )}

      {payingInvoice && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal modal-small"
            role="dialog"
            aria-modal="true"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void post(
                {
                  action: "markInvoicePaid",
                  invoiceId: payingInvoice.id,
                  paidDate: form.get("paidDate"),
                  categoryId: form.get("categoryId"),
                },
                "invoicePaid",
              ).then((ok) => {
                if (ok) setPayingInvoice(null);
              });
            }}
          >
            <header className="modal-header">
              <div>
                <h2>{t("markInvoicePaidTitle")}</h2>
                <p>{t("markInvoicePaidDescription")}</p>
              </div>
            </header>
            <div className="form-grid">
              <label>
                {t("paymentDate")}
                <DateInput
                  className="field"
                  name="paidDate"
                  defaultValue={today()}
                  required
                />
              </label>
              <label>
                {t("category")}
                <select className="field" name="categoryId" required>
                  <option value="">{t("selectCategory")}</option>
                  {data.categories
                    .filter(
                      (category) =>
                        category.active && category.direction === "income",
                    )
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {categoryName(category.id)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {error && <p className="notice notice-error">{error}</p>}
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setPayingInvoice(null)}
              >
                {t("cancel")}
              </button>
              <button className="button" disabled={busy}>
                {t("markAsPaid")}
              </button>
            </footer>
          </form>
        </div>
      )}
      {financeHistory === "consultantBalance" && (
        <FinanceHistoryModal
          title={manager ? t("consultantLiability") : t("remainingBalance")}
          description={t("consultantBalanceHistoryDescription")}
          entries={consultantBalanceHistory}
          locale={locale}
          categoryName={categoryName}
          close={() => setFinanceHistory(null)}
        />
      )}
      {financeHistory === "earnedShare" && (
        <FinanceHistoryModal
          title={t("earnedShare")}
          description={t("earnedShareHistoryDescription")}
          entries={earnedShareHistory}
          locale={locale}
          categoryName={categoryName}
          close={() => setFinanceHistory(null)}
        />
      )}
      {financeHistory === "spentFromBalance" && (
        <FinanceHistoryModal
          title={t("spentFromBalance")}
          description={t("spentFromBalanceHistoryDescription")}
          changeLabel={t("amount")}
          entries={spentFromBalanceHistory}
          locale={locale}
          categoryName={categoryName}
          close={() => setFinanceHistory(null)}
        />
      )}
      {financeHistory === "netIncome" && (
        <FinanceHistoryModal
          title={netIncomeTitle}
          description={t("netIncomeHistoryDescription")}
          entries={netIncomeHistory}
          locale={locale}
          categoryName={categoryName}
          consultantName={historyConsultantName}
          close={() => setFinanceHistory(null)}
        />
      )}
      {financeHistory === "vatPayable" && (
        <FinanceHistoryModal
          title={t("vatPayable")}
          description={t("vatPayableHistoryDescription")}
          changeLabel={t("vatChange")}
          entries={vatHistory}
          locale={locale}
          categoryName={categoryName}
          consultantName={historyConsultantName}
          close={() => setFinanceHistory(null)}
        />
      )}
      {financeHistory === "outstandingInvoices" && (
        <FinanceHistoryModal
          title={t(
            selectedConsultant === "company"
              ? "companyOutstandingInvoiceShare"
              : "outstandingInvoices",
          )}
          description={t(
            selectedConsultant === "company"
              ? "companyOutstandingInvoiceShareDescription"
              : "outstandingInvoicesDescription",
          )}
          eyebrow={t("details")}
          changeLabel={t(
            selectedConsultant === "company" ? "companyShare" : "netAmount",
          )}
          entries={outstandingInvoicesHistory}
          locale={locale}
          categoryName={categoryName}
          consultantName={historyConsultantName}
          close={() => setFinanceHistory(null)}
        />
      )}
      {financeHistory === "retainedResult" && (
        <FinanceHistoryModal
          title={t("retainedResult")}
          description={t(
            selectedConsultant === "company"
              ? "companyRetainedResultHistoryDescription"
              : selectedModel === "fixed"
                ? "fixedRetainedResultHistoryDescription"
                : "retainedResultHistoryDescription",
          )}
          entries={retainedResultHistory}
          locale={locale}
          categoryName={categoryName}
          close={() => setFinanceHistory(null)}
        />
      )}
      {deletingTransaction && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-transaction-title"
          >
            <header className="modal-header">
              <div>
                <span className="eyebrow danger-text">
                  {t("permanentAction")}
                </span>
                <h2 id="delete-transaction-title">
                  {t("deleteTransactionTitle")}
                </h2>
                <p>{t("deleteTransactionDescription")}</p>
              </div>
            </header>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <label>
              {t("typeConfirmation")} <strong>I am sure</strong>
              <input
                className="field"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                autoFocus
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setDeletingTransaction(null);
                  setDeleteConfirmation("");
                }}
              >
                {t("cancel")}
              </button>
              <button
                className="button danger"
                disabled={busy || deleteConfirmation !== "I am sure"}
                onClick={() =>
                  void post(
                    {
                      action: "deleteTransaction",
                      transactionId: deletingTransaction.id,
                      confirmation: deleteConfirmation,
                    },
                    "transactionDeleted",
                  ).then((ok) => {
                    if (ok) {
                      setDeletingTransaction(null);
                      setDeleteConfirmation("");
                    }
                  })
                }
              >
                {busy ? t("deleting") : t("deleteTransaction")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
