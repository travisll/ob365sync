import type { EventNoteFrontmatter } from "./types";

export interface CalendarDetailsState {
  title: string;
  start: string;
  end: string;
  startTimeZone: string;
  endTimeZone: string;
  allDay: boolean;
  location: string;
  attendeesText: string;
}

export function buildCalendarDetailsState(
  fileBasename: string,
  frontmatter: Partial<EventNoteFrontmatter>,
): CalendarDetailsState {
  return {
    title: fileBasename,
    start: isoToDateTimeLocal(frontmatter.start),
    end: isoToDateTimeLocal(frontmatter.end),
    startTimeZone: frontmatter.office365StartTimeZone ?? "UTC",
    endTimeZone: frontmatter.office365EndTimeZone ?? "UTC",
    allDay: Boolean(frontmatter.office365IsAllDay),
    location: frontmatter.location ?? "",
    attendeesText: (frontmatter.attendees ?? []).join("\n"),
  };
}

export function attendeesTextToList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function dateTimeLocalToIso(value: string): string {
  if (!value) {
    return "";
  }

  if (value.endsWith("Z")) {
    return value;
  }

  const normalized = value.length === 16 ? `${value}:00` : value;
  return `${normalized}.000Z`;
}

export function isoToDateTimeLocal(value?: string): string {
  if (!value) {
    return "";
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) {
    return `${match[1]}T${match[2]}`;
  }

  return value;
}
