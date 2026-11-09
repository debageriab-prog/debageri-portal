import { describe, expect, it } from "vitest";
import { agiIdentity, agiXml } from "@/domain/salary/agi";
import {
  ageEmployerFeeMinor,
  employerFeeRate,
} from "@/domain/salary/employer-fee";
import type { SalaryLine } from "@/domain/salary/articles";
import { repeatedSalaryLines } from "@/domain/salary/slip";

describe("employer contributions by age", () => {
  it("picks the rate from the year of birth and the payment date", () => {
    const group = (personalNumber: string, date = "2026-08-25") =>
      employerFeeRate(personalNumber, date).group;
    expect(group("19820225-2386")).toBe("standard");
    // Turned 66 in 2025, before 2026 began.
    expect(group("19590101-0000")).toBe("senior");
    // Turns 66 during 2026.
    expect(group("19600101-0000")).toBe("standard");
    expect(group("19370601-0000")).toBe("none");
    // Born 2003–2007 in 2026.
    expect(group("20071127-2385")).toBe("youth");
    expect(group("20030101-0000")).toBe("youth");
    expect(group("20020101-0000")).toBe("standard");
    // The youth rate starts in April 2026 and ends after September 2027.
    expect(group("20071127-2385", "2026-03-25")).toBe("standard");
    expect(group("20080101-0000", "2027-09-25")).toBe("youth");
    expect(group("20080101-0000", "2027-10-25")).toBe("standard");
    expect(employerFeeRate("", "2026-08-25").group).toBe("standard");
  });

  it("charges 20.81 % up to 25 000 kr and the standard rate above", () => {
    const youth = employerFeeRate("20071127-2385", "2026-08-25");
    expect(ageEmployerFeeMinor(2_000_000, youth)).toBe(416_200);
    // 25 000 × 20.81 % + 5 000 × 31.42 % = 5 202.50 + 1 571 = 6 773.50
    expect(ageEmployerFeeMinor(3_000_000, youth)).toBe(677_400);
    const senior = employerFeeRate("19500101-0000", "2026-08-25");
    expect(ageEmployerFeeMinor(3_000_000, senior)).toBe(306_300);
    expect(
      ageEmployerFeeMinor(
        3_000_000,
        employerFeeRate("19300101-0000", "2026-08-25"),
      ),
    ).toBe(0);
  });
});

describe("AGI file", () => {
  it("turns organisation and personal numbers into twelve digits", () => {
    expect(agiIdentity("556026-9986")).toBe("165560269986");
    expect(agiIdentity("19820225-2386")).toBe("198202252386");
    expect(agiIdentity("820225-2386")).toBeNull();
    expect(agiIdentity("")).toBeNull();
  });

  it("writes the HU totals, one IU per person and absence days", () => {
    const xml = agiXml({
      employerId: "556026-9986",
      programName: "Debageri Portal",
      contact: { name: "Ann Ek", phone: "08-123 45", email: "ann@example.se" },
      createdAt: "2026-09-02T10:00:00",
      individuals: [
        {
          personalNumber: "19820225-2386",
          period: "2026-08",
          cashMinor: 4_635_840,
          benefitsMinor: 163_700,
          taxMinor: 1_104_200,
          employerFeeMinor: 1_508_000,
        },
        {
          personalNumber: "20071127-2385",
          period: "2026-08",
          cashMinor: 2_580_050,
          benefitsMinor: 0,
          taxMinor: 800_000,
          employerFeeMinor: 543_100,
        },
      ],
      absences: [
        {
          personalNumber: "19820225-2386",
          period: "2026-08",
          date: "2026-07-14",
          type: "careOfChild",
          minutes: 270,
        },
        {
          personalNumber: "19820225-2386",
          period: "2026-08",
          date: "2026-07-03",
          type: "parental",
          minutes: 480,
        },
      ],
    });
    expect(xml).toContain(
      '<agd:AgRegistreradId faltkod="201">165560269986</agd:AgRegistreradId>',
    );
    expect(xml).toContain("<agd:Period>202608</agd:Period>");
    expect(xml).toContain(
      '<agd:SummaArbAvgSlf faltkod="487">20511</agd:SummaArbAvgSlf>',
    );
    expect(xml).toContain(
      '<agd:SummaSkatteavdr faltkod="497">19042</agd:SummaSkatteavdr>',
    );
    // Öre are left out of the amounts.
    expect(xml).toContain(
      '<agd:KontantErsattningUlagAG faltkod="011">46358</agd:KontantErsattningUlagAG>',
    );
    expect(xml).toContain(
      '<agd:SkatteplOvrigaFormanerUlagAG faltkod="012">1637</agd:SkatteplOvrigaFormanerUlagAG>',
    );
    expect(xml.match(/<agd:IU>/g)).toHaveLength(2);
    expect(xml.match(/SkatteplOvrigaFormanerUlagAG faltkod/g)).toHaveLength(1);
    // Absence in date order, numbered per person.
    const absence = xml.slice(xml.indexOf("<agd:Franvarouppgift>"));
    expect(absence.indexOf("2026-07-03")).toBeLessThan(
      absence.indexOf("2026-07-14"),
    );
    expect(absence).toContain(
      '<agd:FranvaroTyp faltkod="823">FORALDRAPENNING</agd:FranvaroTyp>',
    );
    expect(absence).toContain(
      '<agd:FranvaroTimmarFP faltkod="827">8</agd:FranvaroTimmarFP>',
    );
    expect(absence).toContain(
      '<agd:FranvaroTimmarTFP faltkod="825">4.5</agd:FranvaroTimmarTFP>',
    );
    expect(absence).toContain(
      '<agd:FranvaroSpecifikationsnummer faltkod="822">2</agd:FranvaroSpecifikationsnummer>',
    );
  });

  it("refuses an employer without an organisation number", () => {
    expect(() =>
      agiXml({
        employerId: "",
        programName: "Debageri Portal",
        contact: { name: "A", phone: "1", email: "a@b.se" },
        createdAt: "2026-09-02T10:00:00",
        individuals: [],
        absences: [],
      }),
    ).toThrow("agiEmployerInvalid");
  });
});

describe("repeating salary rows", () => {
  const line = (id: string, repeat?: boolean): SalaryLine => ({
    id,
    article: "benefit",
    label: "",
    item: "healthInsurance",
    from: "2026-08-01",
    to: "2026-08-31",
    scopeBps: 10_000,
    quantityHundredths: 100,
    unitPriceMinor: 30_000,
    manual: true,
    repeat,
  });

  it("copies only lines added by hand and marked to repeat", () => {
    const copied = repeatedSalaryLines(
      [
        line("manual-1", true),
        line("manual-2"),
        { ...line("monthlySalary", true), manual: false },
      ],
      7,
    );
    expect(copied).toEqual([
      { ...line("manual-7-0", true), from: null, to: null },
    ]);
  });
});
