"use client";

import { useState } from "react";
import { useLocale } from "@/components/localization/LocaleProvider";
import { ActionIcon } from "@/components/ui/ActionIcon";
import { FilePreviewModal } from "@/components/ui/FilePreview";

/** Where finance reads a salary row's generated payslip PDF. */
export const salaryPayslipUrl = (slipId: string) =>
  `/api/finance/salaries/${encodeURIComponent(slipId)}/payslip`;

/** The PDF icon that opens a salary's payslip in the shared preview popup. */
export function PayslipPdfButton({
  slipId,
  name,
}: {
  slipId: string;
  name: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="table-action icon-action"
        type="button"
        aria-label={t("viewPayslip")}
        title={t("viewPayslip")}
        onClick={() => setOpen(true)}
      >
        <ActionIcon type="pdf" />
      </button>
      {open && (
        <FilePreviewModal
          target={{
            name,
            contentType: "application/pdf",
            fileUrl: salaryPayslipUrl(slipId),
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
