"use client";

import Link from "next/link";
import { useLocale } from "@/components/localization/LocaleProvider";
import {
  DetailFacts,
  DetailSection,
  DetailSections,
  DetailSummary,
  DetailTag,
} from "@/components/ui/DetailView";
import { formatSek } from "@/domain/finance/calculations";
import { isDomesticCountry } from "@/domain/finance/invoice-settings";

type Customer = {
  id: string;
  name: string;
  contactPerson: string;
  financeEmail: string;
  financeBccEmail: string;
  customerNumber: string;
  orgNumber: string;
  vatNumber: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  defaultYourReference: string;
  paymentTermsDays: number | null;
  invoiceLocale: "sv-SE" | "en-SE";
};

type CustomerInvoice = {
  status: "issued" | "paid" | "void";
  grossMinor: number;
  issueDate: string;
};

/** A customer's details popup, laid out like the invoice details. */
export function CustomerDetails({
  customer,
  defaultPaymentTermsDays,
  invoices,
  canEdit,
  onClose,
}: {
  customer: Customer;
  defaultPaymentTermsDays: number;
  invoices: CustomerInvoice[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useLocale();
  const counted = invoices.filter((invoice) => invoice.status !== "void");
  const unpaid = counted.filter((invoice) => invoice.status === "issued");
  const unpaidMinor = unpaid.reduce((sum, item) => sum + item.grossMinor, 0);
  const invoicedMinor = counted.reduce((sum, item) => sum + item.grossMinor, 0);
  const latest = counted
    .map((invoice) => invoice.issueDate)
    .sort()
    .at(-1);
  const missingAddress =
    !customer.addressLine || !customer.postalCode || !customer.city;
  const postalLine = [customer.postalCode, customer.city]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-details-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t("customerDetails")}</span>
            <h2 id="customer-details-title">{customer.name}</h2>
            <p className="detail-meta">
              {customer.customerNumber && (
                <span>
                  {t("customerNumber")} {customer.customerNumber}
                </span>
              )}
              {customer.orgNumber && <span>{customer.orgNumber}</span>}
            </p>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label={t("close")}
            autoFocus
            onClick={onClose}
          >
            {"×"}
          </button>
        </header>
        <DetailSummary
          tone={unpaid.length ? "neutral" : "positive"}
          tags={
            <>
              <DetailTag tone={unpaid.length ? "neutral" : "positive"}>
                {unpaid.length
                  ? t("customerUnpaidCount").replace(
                      "{count}",
                      String(unpaid.length),
                    )
                  : t("customerNothingUnpaid")}
              </DetailTag>
              {missingAddress && (
                <DetailTag tone="negative">
                  {t("customerAddressMissingTag")}
                </DetailTag>
              )}
            </>
          }
          amount={formatSek(unpaidMinor, locale)}
          headline={t("customerUnpaidTotal")}
        />
        <DetailSections>
          <DetailSection title={t("customerContact")}>
            <DetailFacts
              rows={[
                [t("contactPerson"), customer.contactPerson],
                [t("financeDepartmentEmail"), customer.financeEmail],
                [t("financeBccEmail"), customer.financeBccEmail],
              ]}
            />
          </DetailSection>
          <DetailSection title={t("invoiceSettingsAddress")}>
            <DetailFacts
              rows={[
                [t("invoiceSetting_addressLine"), customer.addressLine || "—"],
                [
                  `${t("invoiceSetting_postalCode")} / ${t("invoiceSetting_city")}`,
                  postalLine || "—",
                ],
                [
                  t("invoiceSetting_country"),
                  customer.country ||
                    (isDomesticCountry(customer.country) ? "Sverige" : ""),
                ],
              ]}
            />
          </DetailSection>
          <DetailSection title={t("customerInvoiceDetails")}>
            <DetailFacts
              rows={[
                [t("customerNumber"), customer.customerNumber || "—"],
                [t("invoiceSetting_orgNumber"), customer.orgNumber],
                [t("invoiceSetting_vatNumber"), customer.vatNumber],
                [t("defaultYourReference"), customer.defaultYourReference],
                [
                  t("customerPaymentTermsDays"),
                  customer.paymentTermsDays != null
                    ? String(customer.paymentTermsDays)
                    : t("customerDefaultTerms").replace(
                        "{days}",
                        String(defaultPaymentTermsDays),
                      ),
                ],
                [
                  t("invoiceLanguage"),
                  customer.invoiceLocale === "en-SE" ? "English" : "Svenska",
                ],
              ]}
            />
          </DetailSection>
          <DetailSection title={t("invoices")} count={counted.length}>
            <DetailFacts
              rows={[
                [t("customerInvoicedTotal"), formatSek(invoicedMinor, locale)],
                [t("customerUnpaidTotal"), formatSek(unpaidMinor, locale)],
                [t("customerLatestInvoice"), latest ?? "—"],
              ]}
            />
          </DetailSection>
        </DetailSections>
        <footer className="modal-actions">
          {canEdit && (
            <Link
              className="button secondary"
              href={`/finance/customers/${encodeURIComponent(customer.id)}/edit`}
            >
              {t("editCustomer")}
            </Link>
          )}
          <button className="button secondary" type="button" onClick={onClose}>
            {t("close")}
          </button>
        </footer>
      </section>
    </div>
  );
}
