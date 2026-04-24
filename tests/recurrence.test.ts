import { describe, expect, it } from "vitest";
import {
  buildRecurrenceFromForm,
  parseRecurrenceFormState,
  recurrenceSummary,
  serializeRecurrence,
} from "../src/recurrence";

describe("recurrence helpers", () => {
  it("round-trips a weekly recurrence form", () => {
    const serialized = serializeRecurrence({
      enabled: true,
      patternType: "weekly",
      interval: 2,
      daysOfWeek: ["monday", "wednesday"],
      firstDayOfWeek: "sunday",
      dayOfMonth: 1,
      month: 1,
      index: "first",
      rangeType: "endDate",
      startDate: "2026-05-01",
      endDate: "2026-06-01",
      numberOfOccurrences: 10,
      recurrenceTimeZone: "UTC",
    });

    const parsed = parseRecurrenceFormState(serialized);
    expect(parsed.enabled).toBe(true);
    expect(parsed.patternType).toBe("weekly");
    expect(parsed.daysOfWeek).toEqual(["monday", "wednesday"]);
    expect(buildRecurrenceFromForm(parsed)).toEqual({
      pattern: {
        type: "weekly",
        interval: 2,
        daysOfWeek: ["monday", "wednesday"],
        firstDayOfWeek: "sunday",
      },
      range: {
        type: "endDate",
        startDate: "2026-05-01",
        endDate: "2026-06-01",
        recurrenceTimeZone: "UTC",
      },
    });
  });

  it("produces a readable summary", () => {
    const summary = recurrenceSummary(
      JSON.stringify({
        pattern: {
          type: "relativeMonthly",
          interval: 1,
          daysOfWeek: ["thursday"],
          firstDayOfWeek: "sunday",
          index: "first",
        },
        range: {
          type: "numbered",
          startDate: "2026-05-01",
          numberOfOccurrences: 6,
          recurrenceTimeZone: "UTC",
        },
      }),
    );

    expect(summary).toContain("RelativeMonthly every 1");
    expect(summary).toContain("thursday");
    expect(summary).toContain("6 occurrences");
  });
});
