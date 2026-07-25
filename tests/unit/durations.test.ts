import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "@/lib/durations/duration";

describe("durations", () => {
  it("parses hours and minutes as integer minutes", () =>
    expect(parseDuration(7, 30)).toBe(450));
  it("rejects zero and invalid minute components", () => {
    expect(() => parseDuration(0, 0)).toThrow();
    expect(() => parseDuration(1, 60)).toThrow();
  });
  it("formats durations", () => {
    expect(formatDuration(480)).toBe("8 h");
    expect(formatDuration(75)).toBe("1 h 15 min");
    expect(formatDuration(-30)).toBe("−30 min");
  });
});
