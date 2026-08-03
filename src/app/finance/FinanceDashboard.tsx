"use client";

import Link from "next/link";
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  belongsToCompany,
  belongsToFixedConsultantResult,
  calculateShareMinor,
  companyBalanceDeltaMinor,
  expenseTotalsByCategory,
  financeTotals,
  formatSek,
  transactionTableDescription,
} from "@/domain/finance/calculations";
import { appCheckFetch } from "@/lib/firebase/client";
import {
  transactionListHref,
  transactionListState,
} from "./transaction-navigation";

export interface FinancePageData {
  financeEnabled: boolean;
  users: Array<{
    id: string;
    displayName: string;
    employeeNumber: string;
    role: string;
    compensationModel: "flexible" | "fixed" | null;
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
    customerName: string;
    issueDate: string;
    dueDate: string;
    paidDate: string | null;
    status: "issued" | "paid" | "void";
    netMinor: number;
    vatMinor: number;
    grossMinor: number;
    shareBps: number;
  }>;
  transactions: Array<{
    id: string;
    direction: "income" | "expense";
    categoryId: string;
    consultantId: string | null;
    invoiceId: string | null;
    funding: "company" | "consultant" | null;
    date: string;
    netMinor: number;
    vatMinor: number;
    grossMinor: number;
    consultantBalanceDeltaMinor: number;
    visibleDescription: string;
    internalNote: string;
    status: "posted" | "reversal";
    reversedByTransactionId: string | null;
    createdAt: number;
  }>;
  agreements: Array<{
    id: string;
    userId: string;
    model: "flexible" | "fixed";
    validFrom: string;
    validTo: string | null;
    shareBps: number;
    fixedMonthlySalaryMinor: number | null;
  }>;
}

type Actor = { id: string; role: string; locale: "sv-SE" | "en-SE" };
type FinanceSection =
  | "overview"
  | "compensation"
  | "invoices"
  | "categories"
  | "transactions"
  | "customers";
function today() {
  return new Date().toISOString().slice(0, 10);
}

function BalanceChart({
  transactions,
  locale,
  period,
  anchor,
  mode,
  categoryName,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  period: "month" | "year" | "all";
  anchor: string;
  mode: "balance" | "result";
  categoryName: (id: string) => string;
}) {
  const { t } = useLocale();
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const zoomScope = `${period}:${anchor}:${mode}`;
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
  const prefix = period === "month" ? anchor : anchor.slice(0, 4);
  const sorted = [...transactions]
    .filter((transaction) =>
      period === "all" ? true : transaction.date.startsWith(prefix),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysInYear =
    new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
  const dayOfYear = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`);
    return (
      Math.floor(
        (value.getTime() - Date.UTC(value.getUTCFullYear(), 0, 1)) / 86_400_000,
      ) + 1
    );
  };
  const transactionPoints = sorted.reduce<
    Array<{
      transaction: FinancePageData["transactions"][number];
      change: number;
      balance: number;
      xRatio: number;
    }>
  >((points, transaction, index) => {
    const change =
      mode === "balance"
        ? transaction.consultantBalanceDeltaMinor
        : transaction.direction === "income"
          ? transaction.netMinor
          : -transaction.netMinor;
    const balance = (points.at(-1)?.balance ?? 0) + change;
    const xRatio =
      period === "month"
        ? Number(transaction.date.slice(8, 10)) / daysInMonth
        : period === "year"
          ? (dayOfYear(transaction.date) - 0.5) / daysInYear
          : (index + 1) / Math.max(1, sorted.length);
    return [...points, { transaction, change, balance, xRatio }];
  }, []);
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
            const position = pointerPosition(event);
            if (
              position === null ||
              position.x < plot.left ||
              position.x > plot.right ||
              position.y < plot.top ||
              position.y > plot.bottom
            )
              return;
            const ratio = pointerRatio(event);
            event.currentTarget.setPointerCapture(event.pointerId);
            setSelection({ start: ratio, current: ratio });
          }}
          onPointerMove={(event) => {
            if (selection) {
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
            <circle
              className="finance-chart-point"
              key={point.transaction.id}
              cx={x(point.xRatio)}
              cy={y(point.balance)}
              r={4}
              tabIndex={0}
              onMouseEnter={() => setHoveredPoint(index)}
              onMouseLeave={() => setHoveredPoint(null)}
              onFocus={() => setHoveredPoint(index)}
              onBlur={() => setHoveredPoint(null)}
            />
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
              <strong>{categoryName(hovered.transaction.categoryId)}</strong>
              <span>
                {hovered.transaction.date} · {t(hovered.transaction.direction)}
              </span>
              {(hovered.transaction.internalNote ||
                hovered.transaction.visibleDescription) && (
                <span>
                  {t("description")}:{" "}
                  {hovered.transaction.internalNote ||
                    hovered.transaction.visibleDescription}
                </span>
              )}
              <span>
                {t("balanceChange")}: {formatSek(hovered.change, locale)}
              </span>
              <span>
                {t("balanceAtPoint")}: {formatSek(hovered.balance, locale)}
              </span>
            </>
          </div>
        )}
      </div>
    </div>
  );
}

function financialTrendGroups(
  transactions: FinancePageData["transactions"],
  locale: Actor["locale"],
  period: "month" | "year" | "all",
  anchor: string,
) {
  const totalsFor = (items: FinancePageData["transactions"]) => {
    const income = items
      .filter((transaction) => transaction.direction === "income")
      .reduce((sum, transaction) => sum + transaction.netMinor, 0);
    const expense = items
      .filter((transaction) => transaction.direction === "expense")
      .reduce((sum, transaction) => sum + transaction.netMinor, 0);
    return { income, expense, result: income - expense };
  };
  if (period === "month") {
    const year = Number(anchor.slice(0, 4));
    const month = Number(anchor.slice(5, 7));
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: days }, (_, index) => {
      const key = `${anchor}-${String(index + 1).padStart(2, "0")}`;
      return {
        key,
        label: String(index + 1),
        ...totalsFor(
          transactions.filter((transaction) => transaction.date === key),
        ),
      };
    });
  }
  if (period === "year") {
    const year = anchor.slice(0, 4);
    return Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, "0")}`;
      return {
        key,
        label: new Intl.DateTimeFormat(locale, { month: "short" }).format(
          new Date(Date.UTC(Number(year), index, 1)),
        ),
        ...totalsFor(
          transactions.filter((transaction) =>
            transaction.date.startsWith(key),
          ),
        ),
      };
    });
  }
  const years = [...new Set(transactions.map((item) => item.date.slice(0, 4)))]
    .filter(Boolean)
    .sort();
  return (years.length ? years : [anchor.slice(0, 4)]).map((year) => ({
    key: year,
    label: year,
    ...totalsFor(
      transactions.filter((transaction) => transaction.date.startsWith(year)),
    ),
  }));
}

function IncomeExpenseBarChart({
  transactions,
  locale,
  period,
  anchor,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  period: "month" | "year" | "all";
  anchor: string;
}) {
  const { t } = useLocale();
  const [hoveredBar, setHoveredBar] = useState<{
    label: string;
    type: "income" | "expense";
    value: number;
    x: number;
    y: number;
  } | null>(null);
  const groups = financialTrendGroups(transactions, locale, period, anchor);
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
  const pairWidth = Math.min(groupWidth * 0.72, 52);
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

function CashFlowWaterfallChart({
  transactions,
  locale,
  period,
  anchor,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  period: "month" | "year" | "all";
  anchor: string;
}) {
  const { t } = useLocale();
  const prefix = period === "month" ? anchor : anchor.slice(0, 4);
  const inPeriod = transactions.filter((transaction) =>
    period === "all" ? true : transaction.date.startsWith(prefix),
  );
  const opening =
    period === "all"
      ? 0
      : transactions
          .filter((transaction) => transaction.date < prefix)
          .reduce(
            (sum, transaction) =>
              sum +
              (transaction.direction === "income"
                ? transaction.netMinor
                : -transaction.netMinor),
            0,
          );
  const income = inPeriod
    .filter((transaction) => transaction.direction === "income")
    .reduce((sum, transaction) => sum + transaction.netMinor, 0);
  const expenses = inPeriod
    .filter((transaction) => transaction.direction === "expense")
    .reduce((sum, transaction) => sum + transaction.netMinor, 0);
  const closing = opening + income - expenses;
  const steps = [
    {
      key: "opening",
      label: t("openingBalance"),
      start: 0,
      end: opening,
      total: true,
    },
    {
      key: "income",
      label: t("income"),
      start: opening,
      end: opening + income,
      total: false,
    },
    {
      key: "expenses",
      label: t("expenses"),
      start: opening + income,
      end: closing,
      total: false,
    },
    {
      key: "closing",
      label: t("closingBalance"),
      start: 0,
      end: closing,
      total: true,
    },
  ];
  const values = steps.flatMap((step) => [step.start, step.end, 0]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(10_000, (rawMax - rawMin) * 0.12);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const plot = { left: 88, right: 975, top: 20, bottom: 300 };
  const y = (value: number) =>
    plot.bottom - ((value - min) / (max - min)) * (plot.bottom - plot.top);
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => min + ((max - min) * index) / 4,
  );
  const slot = (plot.right - plot.left) / steps.length;
  const barWidth = Math.min(120, slot * 0.58);
  const axisSek = (minor: number) =>
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(minor / 100);
  return (
    <div className="finance-waterfall-chart">
      <svg
        viewBox="0 0 1000 360"
        role="img"
        aria-label={t("cashFlowWaterfall")}
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
          className="finance-chart-zero"
          x1={plot.left}
          x2={plot.right}
          y1={y(0)}
          y2={y(0)}
        />
        <text className="finance-chart-axis-title" x={18} y={18}>
          SEK
        </text>
        {steps.map((step, index) => {
          const center = plot.left + slot * (index + 0.5);
          const top = Math.min(y(step.start), y(step.end));
          const height = Math.max(3, Math.abs(y(step.start) - y(step.end)));
          const value = step.total ? step.end : step.end - step.start;
          return (
            <g key={step.key}>
              {index < steps.length - 1 && (
                <line
                  className="finance-waterfall-connector"
                  x1={center + barWidth / 2}
                  x2={center + slot - barWidth / 2}
                  y1={y(step.end)}
                  y2={y(step.end)}
                />
              )}
              <rect
                className={`finance-waterfall-bar ${step.total ? "finance-waterfall-total" : value >= 0 ? "finance-waterfall-positive" : "finance-waterfall-negative"}`}
                x={center - barWidth / 2}
                y={top}
                width={barWidth}
                height={height}
                rx="5"
                tabIndex={0}
              >
                <title>{`${step.label}: ${formatSek(value, locale)}`}</title>
              </rect>
              <text
                className="finance-chart-axis-label"
                x={center}
                y={plot.bottom + 24}
                textAnchor="middle"
              >
                {step.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ProfitMarginChart({
  transactions,
  locale,
  period,
  anchor,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  period: "month" | "year" | "all";
  anchor: string;
}) {
  const { t } = useLocale();
  const groups = financialTrendGroups(transactions, locale, period, anchor).map(
    (group) => ({
      ...group,
      margin: group.income > 0 ? (group.result / group.income) * 100 : 0,
    }),
  );
  const values = groups.map((group) => group.margin);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const padding = Math.max(5, (rawMax - rawMin) * 0.12);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const plot = { left: 72, right: 975, top: 20, bottom: 300 };
  const x = (index: number) =>
    groups.length === 1
      ? (plot.left + plot.right) / 2
      : plot.left + (index / (groups.length - 1)) * (plot.right - plot.left);
  const y = (value: number) =>
    plot.bottom - ((value - min) / (max - min)) * (plot.bottom - plot.top);
  const points = groups
    .map((group, index) => `${x(index)},${y(group.margin)}`)
    .join(" ");
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => min + ((max - min) * index) / 4,
  );
  const labelEvery = Math.max(1, Math.ceil(groups.length / 12));
  return (
    <div className="finance-margin-chart">
      <svg
        viewBox="0 0 1000 360"
        role="img"
        aria-label={t("profitMarginTrend")}
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
              {Math.round(tick)}%
            </text>
          </g>
        ))}
        <line
          className="finance-chart-zero"
          x1={plot.left}
          x2={plot.right}
          y1={y(0)}
          y2={y(0)}
        />
        <polyline className="finance-margin-line" points={points} fill="none" />
        {groups.map((group, index) => (
          <g key={group.key}>
            <circle
              className="finance-margin-point"
              cx={x(index)}
              cy={y(group.margin)}
              r="4"
              tabIndex={0}
            >
              <title>{`${group.label}: ${group.margin.toFixed(1)}% · ${t("netResult")}: ${formatSek(group.result, locale)}`}</title>
            </circle>
            {index % labelEvery === 0 && (
              <text
                className="finance-chart-axis-label"
                x={x(index)}
                y={plot.bottom + 24}
                textAnchor="middle"
              >
                {group.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ExpenseCategoryChart({
  transactions,
  locale,
  categoryName,
}: {
  transactions: FinancePageData["transactions"];
  locale: Actor["locale"];
  categoryName: (id: string) => string;
}) {
  const { t } = useLocale();
  const totals = expenseTotalsByCategory(transactions);
  const maximum = Math.max(0, ...totals.map((item) => item.amountMinor));
  if (totals.length === 0)
    return <div className="finance-chart-empty">{t("noCategoryExpenses")}</div>;
  return (
    <div
      className="finance-expense-category-chart"
      role="list"
      aria-label={t("expenseCategoryChart")}
    >
      {totals.map((item) => (
        <div
          className="finance-expense-category-row"
          role="listitem"
          key={item.categoryId}
        >
          <span className="finance-expense-category-label">
            {categoryName(item.categoryId)}
          </span>
          <span className="finance-expense-category-track" aria-hidden="true">
            <span
              className="finance-expense-category-fill"
              style={{ width: `${(item.amountMinor / maximum) * 100}%` }}
            />
          </span>
          <strong>{formatSek(item.amountMinor, locale)}</strong>
        </div>
      ))}
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
  const manager = ["admin", "accountant"].includes(actor.role);
  const admin = actor.role === "admin";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [chartPeriod, setChartPeriod] = useState<"month" | "year" | "all">(
    "month",
  );
  const [chartAnchor, setChartAnchor] = useState(today().slice(0, 7));
  const [selectedConsultant, setSelectedConsultant] = useState(
    manager ? "all" : actor.id,
  );
  const [invoiceConsultantFilter, setInvoiceConsultantFilter] = useState("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const initialTransactionListState = transactionListState(
    searchParams,
    data.transactions[0]?.date.slice(0, 7) ?? today().slice(0, 7),
  );
  const [transactionConsultantFilter, setTransactionConsultantFilter] =
    useState(initialTransactionListState.scope);
  const [transactionPeriod, setTransactionPeriod] = useState<"month" | "year">(
    initialTransactionListState.period,
  );
  const [transactionPeriodAnchor, setTransactionPeriodAnchor] = useState(
    initialTransactionListState.anchor,
  );
  const [endingAgreement, setEndingAgreement] = useState<
    FinancePageData["agreements"][number] | null
  >(null);
  const [deletingTransaction, setDeletingTransaction] = useState<
    FinancePageData["transactions"][number] | null
  >(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [payingInvoice, setPayingInvoice] = useState<
    FinancePageData["invoices"][number] | null
  >(null);
  const categoryName = (id: string) => {
    const item = data.categories.find((category) => category.id === id);
    return item ? item.name[locale === "sv-SE" ? "sv" : "en"] : "—";
  };
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
        data.invoices.map((invoice) => [invoice.id, invoice.consultantId]),
      ),
    [data.invoices],
  );
  const visibleTransactions = useMemo(
    () =>
      selectedConsultant === "all"
        ? data.transactions
        : selectedConsultant === "company"
          ? data.transactions.filter(belongsToCompany)
          : data.transactions.filter(
              (item) =>
                item.consultantId === selectedConsultant ||
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
      invoiceConsultantIds,
      manager,
      selectedConsultant,
      selectedModel,
    ],
  );
  const visibleOverviewTransactions = useMemo(
    () =>
      visibleTransactions.filter(
        (transaction) =>
          chartPeriod === "all" ||
          transaction.date.startsWith(
            chartPeriod === "month" ? chartAnchor : chartAnchor.slice(0, 4),
          ),
      ),
    [chartAnchor, chartPeriod, visibleTransactions],
  );
  const totals = financeTotals(
    selectedConsultant === "company"
      ? visibleTransactions.map((transaction) => ({
          ...transaction,
          consultantBalanceDeltaMinor: companyBalanceDeltaMinor(transaction),
        }))
      : visibleTransactions,
  );
  const earnedShare = visibleTransactions.reduce(
    (sum, item) => sum + Math.max(0, item.consultantBalanceDeltaMinor),
    0,
  );
  const spentFromBalance = visibleTransactions.reduce(
    (sum, item) => sum + Math.max(0, -item.consultantBalanceDeltaMinor),
    0,
  );
  const consultantLiability = manager
    ? data.users
        .filter((user) => user.compensationModel === "flexible")
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
  const outstandingInvoices = data.invoices
    .filter(
      (invoice) =>
        invoice.status === "issued" &&
        (selectedConsultant === "all" ||
          (selectedConsultant === "company" && invoice.consultantId === null) ||
          invoice.consultantId === selectedConsultant),
    )
    .reduce((sum, invoice) => sum + invoice.grossMinor, 0);
  const filteredInvoices = data.invoices.filter(
    (invoice) =>
      (invoiceConsultantFilter === "all" ||
        (invoiceConsultantFilter === "company" &&
          invoice.consultantId === null) ||
        invoice.consultantId === invoiceConsultantFilter) &&
      (invoiceStatusFilter === "all" || invoice.status === invoiceStatusFilter),
  );
  const transactionListTransactions = data.transactions.filter(
    (transaction) =>
      (transactionConsultantFilter === "all" ||
        (transactionConsultantFilter === "company" &&
          belongsToCompany(transaction)) ||
        transaction.consultantId === transactionConsultantFilter) &&
      transaction.date.startsWith(
        transactionPeriod === "month"
          ? transactionPeriodAnchor
          : transactionPeriodAnchor.slice(0, 4),
      ),
  );
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
  });
  const transactionFormHref = (path: string) =>
    `${path}?${new URLSearchParams({ returnTo: transactionReturnHref })}`;
  const chartMode =
    !manager || selectedModel === "flexible" ? "balance" : "result";

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
    compensation: t("compensationManagement"),
    invoices: manager ? t("invoiceManagement") : t("myInvoices"),
    categories: t("categoryManagement"),
    transactions: t("incomeExpenseManagement"),
    customers: t("customerManagement"),
  }[section];
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
                : t(`${section}SectionDescription` as Parameters<typeof t>[0])}
          </p>
        </div>
        {manager && section === "overview" && (
          <label>
            {t("consultant")}
            <select
              className="field"
              value={selectedConsultant}
              onChange={(event) => setSelectedConsultant(event.target.value)}
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
        )}
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
              <span>{manager ? t("netIncome") : t("earnedShare")}</span>
              <strong>
                {formatSek(manager ? totals.incomeMinor : earnedShare, locale)}
              </strong>
            </div>
            <div className="metric">
              <span>{manager ? t("netExpenses") : t("spentFromBalance")}</span>
              <strong>
                {formatSek(
                  manager ? totals.expenseMinor : spentFromBalance,
                  locale,
                )}
              </strong>
            </div>
            <div className="metric">
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
            </div>
            {manager && (
              <>
                <div className="metric">
                  <span>{t("vatPayable")}</span>
                  <strong>
                    {formatSek(
                      totals.outputVatMinor - totals.inputVatMinor,
                      locale,
                    )}
                  </strong>
                </div>
                <div className="metric">
                  <span>{t("retainedResult")}</span>
                  <strong>
                    {formatSek(
                      totals.netResultMinor -
                        (selectedConsultant === "all"
                          ? consultantLiability
                          : 0),
                      locale,
                    )}
                  </strong>
                </div>
                <div className="metric">
                  <span>{t("outstandingInvoices")}</span>
                  <strong>{formatSek(outstandingInvoices, locale)}</strong>
                </div>
              </>
            )}
          </section>
          <section className="card finance-chart-controls">
            <div className="week-head">
              <h2>{t("chartPeriod")}</h2>
              <div className="actions">
                <select
                  className="field finance-period"
                  value={chartPeriod}
                  onChange={(event) =>
                    setChartPeriod(event.target.value as typeof chartPeriod)
                  }
                >
                  <option value="month">{t("month")}</option>
                  <option value="year">{t("year")}</option>
                  <option value="all">{t("allTime")}</option>
                </select>
                {chartPeriod === "month" && (
                  <input
                    className="field finance-period"
                    type="month"
                    aria-label={t("chartPeriod")}
                    value={chartAnchor}
                    onChange={(event) => setChartAnchor(event.target.value)}
                  />
                )}
                {chartPeriod === "year" && (
                  <input
                    className="field finance-period"
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
              </div>
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
              mode={chartMode}
              categoryName={categoryName}
            />
          </section>
          <section className="card finance-chart-card">
            <h2>{t("cashFlowWaterfall")}</h2>
            <CashFlowWaterfallChart
              transactions={visibleTransactions}
              locale={locale}
              period={chartPeriod}
              anchor={chartAnchor}
            />
          </section>
          <section className="card finance-chart-card">
            <h2>{t("incomeExpenseTrend")}</h2>
            <IncomeExpenseBarChart
              transactions={visibleTransactions}
              locale={locale}
              period={chartPeriod}
              anchor={chartAnchor}
            />
          </section>
          <section className="card finance-chart-card">
            <h2>{t("profitMarginTrend")}</h2>
            <ProfitMarginChart
              transactions={visibleTransactions}
              locale={locale}
              period={chartPeriod}
              anchor={chartAnchor}
            />
          </section>
          {chartPeriod !== "all" && (
            <section className="card finance-chart-card">
              <h2>{t("expenseCategoryChart")}</h2>
              <ExpenseCategoryChart
                transactions={visibleOverviewTransactions}
                locale={locale}
                categoryName={categoryName}
              />
            </section>
          )}
        </>
      )}

      {manager && section === "compensation" && (
        <section className="card table-wrap">
          <div className="week-head">
            <h2>{t("currentCompensation")}</h2>
            {admin && (
              <Link className="button" href="/finance/compensation/new">
                {t("addCompensation")}
              </Link>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("consultant")}</th>
                <th>{t("compensationModel")}</th>
                <th>{t("validFrom")}</th>
                <th>{t("validTo")}</th>
                <th>{t("compensationTerms")}</th>
                {admin && (
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.agreements.map((agreement) => (
                <tr key={agreement.id}>
                  <td>{consultantName(agreement.userId)}</td>
                  <td>
                    {t(
                      agreement.model === "flexible"
                        ? "flexible"
                        : "fixedSalary",
                    )}
                  </td>
                  <td>{agreement.validFrom}</td>
                  <td>{agreement.validTo ?? "—"}</td>
                  <td>
                    {agreement.model === "flexible"
                      ? `${t("invoiceSharePercent")}: ${agreement.shareBps / 100}%`
                      : agreement.fixedMonthlySalaryMinor !== null
                        ? `${t("monthlySalary")}: ${formatSek(agreement.fixedMonthlySalaryMinor, locale)}`
                        : "—"}
                  </td>
                  {admin && (
                    <td>
                      {agreement.validTo === null && (
                        <button
                          className="table-action"
                          onClick={() => setEndingAgreement(agreement)}
                        >
                          {t("setValidTo")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {manager && section === "customers" && (
        <section className="card table-wrap">
          <div className="week-head">
            <h2>{t("currentCustomers")}</h2>
            <Link className="button" href="/finance/customers/new">
              {t("addCustomer")}
            </Link>
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
                    <Link
                      className="table-action"
                      href={`/finance/customers/${customer.id}/edit`}
                    >
                      {t("edit")}
                    </Link>
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
            {admin && (
              <Link className="button" href="/finance/categories/new">
                {t("addCategory")}
              </Link>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("code")}</th>
                <th>{t("englishName")}</th>
                <th>{t("swedishName")}</th>
                <th>{t("type")}</th>
                <th>{t("status")}</th>
                {admin && (
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
                  {admin && (
                    <td>
                      <Link
                        className="table-action"
                        href={`/finance/categories/${category.id}/edit`}
                      >
                        {t("edit")}
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
                  <Link
                    className="button secondary"
                    href="/finance/invoices/import"
                  >
                    {t("csvImport")}
                  </Link>
                  <Link className="button" href="/finance/invoices/new">
                    {t("addInvoice")}
                  </Link>
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
                        {invoice.status === "issued" && (
                          <button
                            className="table-action"
                            type="button"
                            onClick={() => setPayingInvoice(invoice)}
                          >
                            {t("markAsPaid")}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {manager && section === "transactions" && (
        <>
          <div className="actions finance-page-actions">
            <Link
              className="button secondary"
              href="/finance/transactions/copy-expenses"
            >
              {t("copyExpensesButton")}
            </Link>
            <Link
              className="button secondary"
              href="/finance/transactions/import"
            >
              {t("csvImport")}
            </Link>
            <Link
              className="button"
              href={transactionFormHref("/finance/transactions/new")}
            >
              {t("addTransaction")}
            </Link>
          </div>
          <section className="card finance-filter-bar finance-filter-bar-three">
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
                  setTransactionPeriod(event.target.value as "month" | "year")
                }
              >
                <option value="month">{t("month")}</option>
                <option value="year">{t("year")}</option>
              </select>
            </label>
            <label>
              {t("chartPeriod")}
              {transactionPeriod === "month" ? (
                <input
                  className="field"
                  type="month"
                  value={transactionPeriodAnchor}
                  onChange={(event) =>
                    setTransactionPeriodAnchor(event.target.value)
                  }
                />
              ) : (
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
              )}
            </label>
          </section>
        </>
      )}
      {((manager && section === "transactions") ||
        (!manager && section === "overview")) && (
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
                {manager && (
                  <th>
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {(manager && section === "transactions"
                ? transactionListTransactions
                : visibleOverviewTransactions
              ).map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td>
                  <td>{t(transaction.direction)}</td>
                  <td>{categoryName(transaction.categoryId)}</td>
                  {manager && (
                    <td>{consultantName(transaction.consultantId)}</td>
                  )}
                  <td>{transactionTableDescription(transaction) || "—"}</td>
                  <td>{formatSek(transaction.netMinor, locale)}</td>
                  <td>{formatSek(transaction.grossMinor, locale)}</td>
                  <td>
                    {formatSek(
                      manager && transactionConsultantFilter === "company"
                        ? companyBalanceDeltaMinor(transaction)
                        : transaction.consultantBalanceDeltaMinor,
                      locale,
                    )}
                  </td>
                  {manager && (
                    <td>
                      <div className="row-actions">
                        {!transactionDeleteProtection(transaction) && (
                          <Link
                            className="table-action"
                            href={transactionFormHref(
                              `/finance/transactions/${encodeURIComponent(transaction.id)}/edit`,
                            )}
                          >
                            {t("edit")}
                          </Link>
                        )}
                        <div
                          className="protected-action"
                          tabIndex={
                            transactionDeleteProtection(transaction) ? 0 : -1
                          }
                        >
                          <button
                            className="table-action table-action-danger"
                            disabled={
                              busy ||
                              Boolean(transactionDeleteProtection(transaction))
                            }
                            onClick={() => {
                              setDeletingTransaction(transaction);
                              setDeleteConfirmation("");
                            }}
                          >
                            {t("delete")}
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
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
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
                <input
                  className="field"
                  type="date"
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
      {endingAgreement && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal modal-small"
            role="alertdialog"
            aria-modal="true"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void post(
                {
                  action: "setCompensationValidTo",
                  agreementId: endingAgreement.id,
                  validTo: form.get("validTo"),
                },
                "validToSaved",
              ).then((ok) => {
                if (ok) setEndingAgreement(null);
              });
            }}
          >
            <header className="modal-header">
              <div>
                <h2>{t("setValidToTitle")}</h2>
                <p>{t("setValidToExplanation")}</p>
              </div>
            </header>
            <label>
              {t("validTo")}
              <input
                className="field"
                type="date"
                name="validTo"
                min={endingAgreement.validFrom}
                defaultValue={today()}
                required
              />
            </label>
            <footer className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEndingAgreement(null)}
              >
                {t("cancel")}
              </button>
              <button className="button" disabled={busy}>
                {t("confirmSetValidTo")}
              </button>
            </footer>
          </form>
        </div>
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
