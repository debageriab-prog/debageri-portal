import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/localization/messages";
import {
  dateRangeLabel,
  timesheetErrorMessage,
  timesheetStatusLabel,
} from "@/lib/localization/timesheets";
import type { TimesheetStatus } from "@/domain/types";

const sv = (key: MessageKey) => translate("sv-SE", key);
const en = (key: MessageKey) => translate("en-SE", key);

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory())
      return name === "attachments" ? [] : routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("time report localization", () => {
  it("translates every error code the routes return", () => {
    const codes = routeFiles("src/app/api/timesheets").flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const mapped = /error:\s+code ===[\s\S]+?,\n/.exec(source)?.[0] ?? "";
      return [
        ...source.matchAll(/error: "(\w+)"/g),
        ...mapped.matchAll(/[?:] "(\w+)"/g),
      ].map((match) => match[1]!);
    });
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) {
      expect(sv(`timesheetError_${code}` as MessageKey)).toBeTruthy();
      expect(en(`timesheetError_${code}` as MessageKey)).toBeTruthy();
    }
  });

  it("falls back when an error code is unknown or missing", () => {
    expect(timesheetErrorMessage(sv, "somethingNew")).toBe(
      "Åtgärden kunde inte slutföras.",
    );
    expect(timesheetErrorMessage(sv, undefined, "timesheetLoadFailed")).toBe(
      "Tidrapporten kunde inte laddas.",
    );
    expect(timesheetErrorMessage(sv, "alreadyReported")).toContain(
      "redan rapporterat",
    );
  });

  it("labels every report status in both languages", () => {
    const statuses: TimesheetStatus[] = [
      "draft",
      "submitted",
      "approved",
      "rejected",
      "reopened",
    ];
    expect(statuses.map((status) => timesheetStatusLabel(sv, status))).toEqual([
      "Utkast",
      "Inskickad",
      "Godkänd",
      "Avvisad",
      "Återöppnad",
    ]);
    expect(timesheetStatusLabel(en, "approved")).toBe("Approved");
    expect(timesheetStatusLabel(en, "unknown")).toBe("unknown");
  });

  it("formats report date ranges per language", () => {
    expect(dateRangeLabel(sv, "2026-10-26", "2026-10-31")).toBe(
      "2026-10-26 till 2026-10-31",
    );
    expect(dateRangeLabel(en, "2026-10-26", "2026-10-31")).toBe(
      "2026-10-26 to 2026-10-31",
    );
  });
});
