import type { GraphRecurrence } from "./types";

export type RecurrencePatternType =
  | "daily"
  | "weekly"
  | "absoluteMonthly"
  | "relativeMonthly"
  | "absoluteYearly"
  | "relativeYearly";

export type RecurrenceRangeType = "noEnd" | "endDate" | "numbered";

export interface RecurrenceFormState {
  enabled: boolean;
  patternType: RecurrencePatternType;
  interval: number;
  daysOfWeek: string[];
  firstDayOfWeek: string;
  dayOfMonth: number;
  month: number;
  index: string;
  rangeType: RecurrenceRangeType;
  startDate: string;
  endDate: string;
  numberOfOccurrences: number;
  recurrenceTimeZone: string;
}

export const DAYS_OF_WEEK = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export const RECURRENCE_INDEXES = ["first", "second", "third", "fourth", "last"] as const;

const DEFAULT_STATE: RecurrenceFormState = {
  enabled: false,
  patternType: "weekly",
  interval: 1,
  daysOfWeek: ["monday"],
  firstDayOfWeek: "sunday",
  dayOfMonth: 1,
  month: 1,
  index: "first",
  rangeType: "noEnd",
  startDate: "",
  endDate: "",
  numberOfOccurrences: 10,
  recurrenceTimeZone: "UTC",
};

export function defaultRecurrenceFormState(startIso?: string, timeZone?: string): RecurrenceFormState {
  const startDate = toDateOnly(startIso) ?? "";
  return {
    ...DEFAULT_STATE,
    startDate,
    recurrenceTimeZone: timeZone || "UTC",
  };
}

export function parseRecurrenceFormState(
  recurrenceValue?: string,
  startIso?: string,
  timeZone?: string,
): RecurrenceFormState {
  const base = defaultRecurrenceFormState(startIso, timeZone);
  if (!recurrenceValue) {
    return base;
  }

  try {
    const recurrence = JSON.parse(recurrenceValue) as GraphRecurrence;
    const pattern = recurrence.pattern ?? {};
    const range = recurrence.range ?? {};
    return {
      enabled: true,
      patternType: isPatternType(pattern.type) ? pattern.type : base.patternType,
      interval: Math.max(1, pattern.interval ?? base.interval),
      daysOfWeek: pattern.daysOfWeek?.length ? pattern.daysOfWeek : base.daysOfWeek,
      firstDayOfWeek: pattern.firstDayOfWeek ?? base.firstDayOfWeek,
      dayOfMonth: clamp(pattern.dayOfMonth ?? base.dayOfMonth, 1, 31),
      month: clamp(pattern.month ?? base.month, 1, 12),
      index: pattern.index ?? base.index,
      rangeType: isRangeType(range.type) ? range.type : base.rangeType,
      startDate: range.startDate ?? base.startDate,
      endDate: range.endDate ?? "",
      numberOfOccurrences: Math.max(1, range.numberOfOccurrences ?? base.numberOfOccurrences),
      recurrenceTimeZone: range.recurrenceTimeZone ?? timeZone ?? base.recurrenceTimeZone,
    };
  } catch {
    return base;
  }
}

export function buildRecurrenceFromForm(state: RecurrenceFormState): GraphRecurrence | null {
  if (!state.enabled) {
    return null;
  }

  const pattern: NonNullable<GraphRecurrence["pattern"]> = {
    type: state.patternType,
    interval: Math.max(1, state.interval),
  };

  if (requiresDaysOfWeek(state.patternType)) {
    pattern.daysOfWeek = state.daysOfWeek.length ? state.daysOfWeek : ["monday"];
    pattern.firstDayOfWeek = state.firstDayOfWeek;
  }

  if (requiresDayOfMonth(state.patternType)) {
    pattern.dayOfMonth = clamp(state.dayOfMonth, 1, 31);
  }

  if (requiresMonth(state.patternType)) {
    pattern.month = clamp(state.month, 1, 12);
  }

  if (requiresIndex(state.patternType)) {
    pattern.index = state.index;
  }

  const range: NonNullable<GraphRecurrence["range"]> = {
    type: state.rangeType,
    startDate: state.startDate,
    recurrenceTimeZone: state.recurrenceTimeZone || "UTC",
  };

  if (state.rangeType === "endDate") {
    range.endDate = state.endDate;
  }

  if (state.rangeType === "numbered") {
    range.numberOfOccurrences = Math.max(1, state.numberOfOccurrences);
  }

  return { pattern, range };
}

export function serializeRecurrence(state: RecurrenceFormState): string {
  const recurrence = buildRecurrenceFromForm(state);
  return recurrence ? JSON.stringify(recurrence) : "";
}

export function recurrenceSummary(recurrenceValue?: string): string {
  const state = parseRecurrenceFormState(recurrenceValue);
  if (!state.enabled) {
    return "Does not repeat";
  }

  const parts = [`${capitalize(state.patternType)} every ${state.interval}`];
  if (requiresDaysOfWeek(state.patternType)) {
    parts.push(`on ${state.daysOfWeek.join(", ")}`);
  }
  if (requiresDayOfMonth(state.patternType)) {
    parts.push(`day ${state.dayOfMonth}`);
  }
  if (requiresMonth(state.patternType)) {
    parts.push(`month ${state.month}`);
  }
  if (state.rangeType === "endDate" && state.endDate) {
    parts.push(`until ${state.endDate}`);
  } else if (state.rangeType === "numbered") {
    parts.push(`for ${state.numberOfOccurrences} occurrences`);
  }
  return parts.join(" ");
}

export function requiresDaysOfWeek(patternType: RecurrencePatternType): boolean {
  return patternType === "weekly" || patternType === "relativeMonthly" || patternType === "relativeYearly";
}

export function requiresDayOfMonth(patternType: RecurrencePatternType): boolean {
  return patternType === "absoluteMonthly" || patternType === "absoluteYearly";
}

export function requiresMonth(patternType: RecurrencePatternType): boolean {
  return patternType === "absoluteYearly" || patternType === "relativeYearly";
}

export function requiresIndex(patternType: RecurrencePatternType): boolean {
  return patternType === "relativeMonthly" || patternType === "relativeYearly";
}

function isPatternType(value?: string): value is RecurrencePatternType {
  return Boolean(
    value &&
      [
        "daily",
        "weekly",
        "absoluteMonthly",
        "relativeMonthly",
        "absoluteYearly",
        "relativeYearly",
      ].includes(value),
  );
}

function isRangeType(value?: string): value is RecurrenceRangeType {
  return value === "noEnd" || value === "endDate" || value === "numbered";
}

function toDateOnly(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
