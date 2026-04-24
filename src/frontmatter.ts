import type { EventNoteFrontmatter } from "./types";

const FRONTMATTER_KEYS = [
  "office365EventId",
  "office365CalendarId",
  "office365ChangeKey",
  "office365LastSyncedAt",
  "office365RemoteUpdatedAt",
  "office365SyncState",
  "office365EventType",
  "office365SeriesMasterId",
  "office365OriginalStart",
  "office365ICalUId",
  "office365Recurrence",
  "office365IsAllDay",
  "office365StartTimeZone",
  "office365EndTimeZone",
  "office365ArchivedFromPath",
  "office365DeletedRemotelyAt",
  "start",
  "end",
  "location",
  "attendees",
  "webLink",
] as const;

export function extractFrontmatter(content: string): EventNoteFrontmatter {
  if (!content.startsWith("---\n")) {
    return {};
  }

  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return {};
  }

  const block = content.slice(4, end);
  const lines = block.split("\n");
  const frontmatter: EventNoteFrontmatter = {};
  let currentArrayKey: keyof EventNoteFrontmatter | null = null;

  for (const rawLine of lines) {
    if (rawLine.startsWith("  - ") && currentArrayKey) {
      const array = frontmatter[currentArrayKey];
      if (Array.isArray(array)) {
        array.push(rawLine.slice(4).trim());
      }
      continue;
    }

    currentArrayKey = null;

    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim() as keyof EventNoteFrontmatter;
    const rawValue = rawLine.slice(separatorIndex + 1).trim();

    if (!isFrontmatterKey(key)) {
      continue;
    }

    if (rawValue === "") {
      if (key === "attendees") {
        frontmatter[key] = [];
        currentArrayKey = key;
      }
      continue;
    }

    frontmatter[key] = parseScalar(rawValue) as never;
  }

  return frontmatter;
}

export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) {
    return content.trim();
  }

  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return content.trim();
  }

  return content.slice(end + 5).trim();
}

export function buildMarkdown(frontmatter: EventNoteFrontmatter, body: string): string {
  const lines: string[] = ["---"];

  for (const key of FRONTMATTER_KEYS) {
    const value = frontmatter[key];
    if (value == null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${escapeYamlScalar(item)}`);
      }
      continue;
    }

    lines.push(`${key}: ${escapeYamlScalar(String(value))}`);
  }

  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

function escapeYamlScalar(value: string): string {
  if (value === "" || /[:#[\]{}]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function isFrontmatterKey(value: string): value is (typeof FRONTMATTER_KEYS)[number] {
  return FRONTMATTER_KEYS.includes(value as (typeof FRONTMATTER_KEYS)[number]);
}

function parseScalar(value: string): string | boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
}
