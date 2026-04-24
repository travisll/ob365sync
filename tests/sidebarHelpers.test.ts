import { describe, expect, it } from "vitest";
import {
  attendeesTextToList,
  buildCalendarDetailsState,
  dateTimeLocalToIso,
  isoToDateTimeLocal,
} from "../src/sidebarHelpers";

describe("sidebar helpers", () => {
  it("builds editable detail state from frontmatter", () => {
    const state = buildCalendarDetailsState("Project Kickoff", {
      start: "2026-05-05T14:30:00.000Z",
      end: "2026-05-05T15:30:00.000Z",
      office365StartTimeZone: "UTC",
      office365EndTimeZone: "UTC",
      office365IsAllDay: false,
      location: "Room A",
      attendees: ["alice@example.com", "bob@example.com"],
    });

    expect(state.title).toBe("Project Kickoff");
    expect(state.start).toBe("2026-05-05T14:30");
    expect(state.end).toBe("2026-05-05T15:30");
    expect(state.attendeesText).toBe("alice@example.com\nbob@example.com");
  });

  it("converts attendee text and datetime values for frontmatter writes", () => {
    expect(attendeesTextToList("alice@example.com,\n bob@example.com \n")).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
    expect(dateTimeLocalToIso("2026-05-05T14:30")).toBe("2026-05-05T14:30:00.000Z");
    expect(isoToDateTimeLocal("2026-05-05T14:30:00.000Z")).toBe("2026-05-05T14:30");
  });
});
