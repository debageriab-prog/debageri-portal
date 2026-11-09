/**
 * Arbetsgivardeklaration på individnivå (AGI): the monthly file uploaded in
 * Skatteverket's e-service, following its XML schema 1.1. It holds a
 * huvuduppgift (HU) with the employer's totals for each period and an
 * individuppgift (IU) for each person paid, plus absence (frånvarouppgift)
 * for parental leave and care of a sick child, which Försäkringskassan uses.
 * Amounts are whole kronor.
 */

export interface AgiContact {
  name: string;
  phone: string;
  email: string;
}

export interface AgiIndividual {
  /** `YYYYMMDD-XXXX` or twelve digits. */
  personalNumber: string;
  /** Redovisningsperiod, the month the salary is paid: `YYYY-MM`. */
  period: string;
  /** Cash pay subject to employer contributions (fält 011), in öre. */
  cashMinor: number;
  /**
   * All taxable benefits, in öre: the car and fuel benefits below go in
   * fält 013 and 018 and the rest in fält 012.
   */
  benefitsMinor: number;
  /** Bilförmån (fält 013), in öre; part of `benefitsMinor`. */
  carBenefitMinor?: number;
  /** Drivmedel vid bilförmån (fält 018), in öre; part of `benefitsMinor`. */
  fuelBenefitMinor?: number;
  /** Withheld preliminary tax (fält 001), in öre. */
  taxMinor: number;
  /** Employer contributions for the person, in öre; summed into the HU. */
  employerFeeMinor: number;
}

export type AgiAbsenceType = "parental" | "careOfChild";

export interface AgiAbsence {
  personalNumber: string;
  period: string;
  date: string;
  type: AgiAbsenceType;
  /** Hours of absence on the day, up to 24. */
  minutes: number;
}

export interface AgiInput {
  /** The employer's organisationsnummer or personnummer. */
  employerId: string;
  programName: string;
  contact: AgiContact;
  /** When the file was made, `YYYY-MM-DDTHH:MM:SS`. */
  createdAt: string;
  individuals: AgiIndividual[];
  absences: AgiAbsence[];
}

/**
 * The twelve-digit id Skatteverket uses: an organisationsnummer gets the
 * prefix 16, a personnummer keeps its century. Null when it is neither.
 */
export function agiIdentity(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12) return digits;
  // The third digit of an organisationsnummer is 2 or more.
  if (digits.length === 10 && Number(digits[2]) >= 2) return `16${digits}`;
  return null;
}

/** Whole kronor; öre are left out. */
const kronor = (minor: number) => String(Math.trunc(Math.max(0, minor) / 100));
const agiPeriod = (period: string) => period.replace("-", "");

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const field = (name: string, code: string, value: string) =>
  `<agd:${name} faltkod="${code}">${escape(value)}</agd:${name}>`;

const tag = (name: string, value: string) =>
  `<agd:${name}>${escape(value)}</agd:${name}>`;

function hours(minutes: number) {
  const value = Math.min(24, Math.round((minutes / 60) * 100) / 100);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function form(employer: string, period: string, content: string[]) {
  return [
    "  <agd:Blankett>",
    "    <agd:Arendeinformation>",
    `      ${tag("Arendeagare", employer)}`,
    `      ${tag("Period", agiPeriod(period))}`,
    "    </agd:Arendeinformation>",
    "    <agd:Blankettinnehall>",
    ...content.map((line) => `      ${line}`),
    "    </agd:Blankettinnehall>",
    "  </agd:Blankett>",
  ];
}

/** The AGI file; throws when the employer id or a personnummer is invalid. */
export function agiXml(input: AgiInput): string {
  const employer = agiIdentity(input.employerId);
  if (!employer) throw new Error("agiEmployerInvalid");
  const person = (value: string) => {
    const id = agiIdentity(value);
    if (!id || id.startsWith("16")) throw new Error("agiPersonInvalid");
    return id;
  };
  const periods = [
    ...new Set(input.individuals.map((item) => item.period)),
  ].sort();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<Skatteverket omrade="Arbetsgivardeklaration" xmlns="http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1" xmlns:agd="http://xmls.skatteverket.se/se/skatteverket/da/komponent/schema/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1 http://xmls.skatteverket.se/se/skatteverket/da/arbetsgivardeklaration/arbetsgivardeklaration_1.1.xsd">',
    "  <agd:Avsandare>",
    `    ${tag("Programnamn", input.programName)}`,
    `    ${tag("Organisationsnummer", employer)}`,
    "    <agd:TekniskKontaktperson>",
    `      ${tag("Namn", input.contact.name)}`,
    `      ${tag("Telefon", input.contact.phone)}`,
    `      ${tag("Epostadress", input.contact.email)}`,
    "    </agd:TekniskKontaktperson>",
    `    ${tag("Skapad", input.createdAt)}`,
    "  </agd:Avsandare>",
    "  <agd:Blankettgemensamt>",
    "    <agd:Arbetsgivare>",
    `      ${tag("AgRegistreradId", employer)}`,
    "      <agd:Kontaktperson>",
    `        ${tag("Namn", input.contact.name)}`,
    `        ${tag("Telefon", input.contact.phone)}`,
    `        ${tag("Epostadress", input.contact.email)}`,
    "      </agd:Kontaktperson>",
    "    </agd:Arbetsgivare>",
    "  </agd:Blankettgemensamt>",
  ];
  for (const period of periods) {
    const people = input.individuals.filter((item) => item.period === period);
    // The HU totals are the sums of the whole-krona amounts in the IUs.
    const fee = people.reduce(
      (sum, item) => sum + Number(kronor(item.employerFeeMinor)),
      0,
    );
    const tax = people.reduce(
      (sum, item) => sum + Number(kronor(item.taxMinor)),
      0,
    );
    lines.push(
      ...form(employer, period, [
        "<agd:HU>",
        "  <agd:ArbetsgivareHUGROUP>",
        `    ${field("AgRegistreradId", "201", employer)}`,
        "  </agd:ArbetsgivareHUGROUP>",
        `  ${field("RedovisningsPeriod", "006", agiPeriod(period))}`,
        `  ${field("SummaArbAvgSlf", "487", String(fee))}`,
        `  ${field("SummaSkatteavdr", "497", String(tax))}`,
        "</agd:HU>",
      ]),
    );
    for (const item of people) {
      const car = item.carBenefitMinor ?? 0;
      const fuel = item.fuelBenefitMinor ?? 0;
      const otherBenefits = item.benefitsMinor - car - fuel;
      const amounts = [
        item.cashMinor >= 100 &&
          field("KontantErsattningUlagAG", "011", kronor(item.cashMinor)),
        otherBenefits >= 100 &&
          field("SkatteplOvrigaFormanerUlagAG", "012", kronor(otherBenefits)),
        car >= 100 && field("SkatteplBilformanUlagAG", "013", kronor(car)),
        fuel >= 100 && field("DrivmVidBilformanUlagAG", "018", kronor(fuel)),
        field("AvdrPrelSkatt", "001", kronor(item.taxMinor)),
      ].filter((line): line is string => Boolean(line));
      lines.push(
        ...form(employer, period, [
          "<agd:IU>",
          "  <agd:ArbetsgivareIUGROUP>",
          `    ${field("AgRegistreradId", "201", employer)}`,
          "  </agd:ArbetsgivareIUGROUP>",
          "  <agd:BetalningsmottagareIUGROUP>",
          "    <agd:BetalningsmottagareIDChoice>",
          `      ${field("BetalningsmottagarId", "215", person(item.personalNumber))}`,
          "    </agd:BetalningsmottagareIDChoice>",
          "  </agd:BetalningsmottagareIUGROUP>",
          `  ${field("RedovisningsPeriod", "006", agiPeriod(period))}`,
          // One individuppgift per person and month, so always number 1.
          `  ${field("Specifikationsnummer", "570", "1")}`,
          ...amounts.map((line) => `  ${line}`),
          "</agd:IU>",
        ]),
      );
    }
  }
  const numbers = new Map<string, number>();
  const absences = [...input.absences].sort((a, b) =>
    a.date === b.date ? a.type.localeCompare(b.type) : a.date < b.date ? -1 : 1,
  );
  for (const absence of absences) {
    if (absence.minutes <= 0) continue;
    const id = person(absence.personalNumber);
    const key = `${id}_${absence.period}`;
    const number = (numbers.get(key) ?? 0) + 1;
    numbers.set(key, number);
    const parental = absence.type === "parental";
    lines.push(
      "  <agd:Franvarouppgift>",
      `    ${field("AgRegistreradId", "201", employer)}`,
      `    ${field("RedovisningsPeriod", "006", agiPeriod(absence.period))}`,
      `    ${field("FranvaroDatum", "821", absence.date)}`,
      `    ${field("BetalningsmottagarId", "215", id)}`,
      `    ${field("FranvaroSpecifikationsnummer", "822", String(number))}`,
      `    ${field("FranvaroTyp", "823", parental ? "FORALDRAPENNING" : "TILLFALLIG_FORALDRAPENNING")}`,
      `    ${
        parental
          ? field("FranvaroTimmarFP", "827", hours(absence.minutes))
          : field("FranvaroTimmarTFP", "825", hours(absence.minutes))
      }`,
      "  </agd:Franvarouppgift>",
    );
  }
  lines.push("</Skatteverket>", "");
  return lines.join("\n");
}
