"use client";

import { useLocale } from "@/components/localization/LocaleProvider";
import { DocumentPreview, downloadFile } from "@/components/ui/DocumentPreview";

export type PayslipItem = {
  id: string;
  userId: string;
  userName: string;
  period: string;
  year: number;
  month: number;
  fileName: string;
  contentType: string;
  uploadedAt: string;
};

export const payslipFileUrl = (id: string) =>
  `/api/documents/payslips/${encodeURIComponent(id)}/file`;

export const downloadPayslip = (item: PayslipItem) =>
  downloadFile(payslipFileUrl(item.id), item.fileName);

export function PayslipPreview({
  payslip,
  toolbar,
  toolbarEnd,
}: {
  payslip: PayslipItem;
  toolbar?: React.ReactNode;
  toolbarEnd?: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <DocumentPreview
      fileUrl={payslipFileUrl(payslip.id)}
      fileName={payslip.fileName}
      contentType={payslip.contentType}
      title={t("payslipPreviewTitle")}
      toolbar={toolbar}
      toolbarEnd={toolbarEnd}
    />
  );
}
