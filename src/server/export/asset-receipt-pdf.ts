import {
  pdfDocument,
  type PdfImage,
  PdfPage,
  textWidth,
  wrapText,
} from "./pdf-document";

export { PDF_CONTENT_TYPE } from "./pdf-document";

/**
 * The receipt someone accepts when company equipment is handed to them: the
 * company, the recipient, a table of the equipment, the terms, and the
 * confirmation with place, date and the electronic acceptance as signature.
 */

export type AssetReceiptPdfLabels = Record<
  | "title"
  | "company"
  | "orgNumber"
  | "recipient"
  | "personalNumber"
  | "date"
  | "issuedEquipment"
  | "equipment"
  | "makeModel"
  | "serialNumber"
  | "accessories"
  | "noAccessories"
  | "terms"
  | "confirmation"
  | "confirmationText"
  | "placeAndDate"
  | "recipientHeading"
  | "name"
  | "signature"
  | "signedElectronically"
  | "notYetAccepted",
  string
> & { termLines: string[] };

export interface AssetReceiptPdfInput {
  company: { legalName: string; orgNumber: string };
  recipientName: string;
  /** Left out when empty. */
  personalNumber: string;
  issuedOn: string;
  lines: {
    equipment: string;
    makeModel: string;
    serialNumber: string;
    accessories: string;
  }[];
  /** Missing while the receipt waits for the recipient. */
  accepted: { place: string; date: string; dateTime: string } | null;
  /** The drawn or typed signature, once accepted with one. */
  signature: PdfImage | null;
  labels: AssetReceiptPdfLabels;
}

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 50;
const CONTENT = WIDTH - 2 * MARGIN;
const BOTTOM = HEIGHT - MARGIN;
const MUTED = "555555";
const HEADER_FILL = "F2EDE4";
const SIGNATURE_INK = "1F2A44";
const SIGNATURE_WIDTH = 210;
const SIGNATURE_HEIGHT = 64;

export function assetReceiptPdf(input: AssetReceiptPdfInput): Buffer {
  const { labels } = input;
  const pages: PdfPage[] = [];
  let page = new PdfPage(WIDTH, HEIGHT);
  pages.push(page);
  let y = MARGIN;

  const room = (height: number) => {
    if (y + height <= BOTTOM) return;
    page = new PdfPage(WIDTH, HEIGHT);
    pages.push(page);
    y = MARGIN;
  };

  /** `Label: value` with the label in bold. */
  const field = (label: string, value: string) => {
    room(16);
    const prefix = `${label}: `;
    page.text(prefix, MARGIN, y, 10.5, { bold: true });
    const start = MARGIN + textWidth(prefix, 10.5, true);
    for (const [index, line] of wrapText(
      value,
      CONTENT - (start - MARGIN),
      10.5,
    ).entries()) {
      if (index > 0) room(14);
      page.text(line, start, y, 10.5);
      y += 14;
    }
  };

  const heading = (value: string) => {
    room(34);
    y += 12;
    page.text(value, MARGIN, y, 14, { bold: true });
    y += 22;
  };

  const paragraph = (value: string, indent = 0, size = 10.5) => {
    for (const line of wrapText(value, CONTENT - indent, size)) {
      room(14);
      page.text(line, MARGIN + indent, y, size);
      y += 14;
    }
  };

  page.text(labels.title, MARGIN, y, 16, {
    align: "center",
    width: CONTENT,
  });
  y += 34;

  field(labels.company, input.company.legalName);
  field(labels.orgNumber, input.company.orgNumber);
  y += 10;
  field(labels.recipient, input.recipientName);
  if (input.personalNumber) field(labels.personalNumber, input.personalNumber);
  field(labels.date, input.issuedOn);

  heading(labels.issuedEquipment);
  const columns = [0.22, 0.27, 0.28, 0.23].map((part) => part * CONTENT);
  const row = (values: string[], header: boolean) => {
    const wrapped = values.map((value, index) =>
      wrapText(value, columns[index]! - 8, 10, header),
    );
    const height = Math.max(...wrapped.map((lines) => lines.length)) * 13 + 9;
    room(height);
    let x = MARGIN;
    wrapped.forEach((lines, index) => {
      page.cell(x, y, columns[index]!, height, "", 10, {
        fill: header ? HEADER_FILL : undefined,
      });
      lines.forEach((line, number) =>
        page.text(line, x + 4, y + 5 + number * 13, 10, {
          bold: header,
          align: header ? "center" : "left",
          width: columns[index]! - 8,
        }),
      );
      x += columns[index]!;
    });
    y += height;
  };
  row(
    [
      labels.equipment,
      labels.makeModel,
      labels.serialNumber,
      labels.accessories,
    ],
    true,
  );
  for (const line of input.lines)
    row(
      [
        line.equipment,
        line.makeModel,
        line.serialNumber,
        line.accessories || labels.noAccessories,
      ],
      false,
    );

  heading(labels.terms);
  for (const term of labels.termLines) {
    room(14);
    page.text(String.fromCharCode(0xb7), MARGIN + 8, y - 1, 14, {
      bold: true,
    });
    paragraph(term, 22);
    y += 3;
  }

  heading(labels.confirmation);
  paragraph(labels.confirmationText);
  y += 10;
  field(
    labels.placeAndDate,
    input.accepted ? `${input.accepted.date} ${input.accepted.place}` : "",
  );

  heading(labels.recipientHeading);
  field(labels.name, input.recipientName);
  y += 6;
  room(40);
  page.text(`${labels.signature}`, MARGIN, y, 10.5, { bold: true });
  y += 18;
  if (input.accepted && input.signature) {
    const { width, height } = input.signature;
    const scale = Math.min(SIGNATURE_WIDTH / width, SIGNATURE_HEIGHT / height);
    room(height * scale + 30);
    page.image(
      { ...input.signature, color: SIGNATURE_INK },
      MARGIN,
      y,
      width * scale,
      height * scale,
    );
    y += height * scale + 4;
    page.line(MARGIN, y, MARGIN + SIGNATURE_WIDTH, y, { color: MUTED });
    y += 8;
  }
  if (input.accepted) paragraph(labels.signedElectronically);
  else {
    page.text(labels.notYetAccepted, MARGIN, y, 10, { color: MUTED });
    y += 14;
  }

  return pdfDocument(pages);
}
