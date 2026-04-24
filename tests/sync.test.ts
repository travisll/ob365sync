import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildMarkdown } from "../src/frontmatter";
import { DEFAULT_SETTINGS } from "../src/settings";
import { SyncEngine, buildSyncWindow, shouldReuseDelta } from "../src/sync";
import type { GraphEvent, Office365CalendarSyncSettings } from "../src/types";
import { TFile, TFolder, normalizePath } from "obsidian";

class FakeVault {
  private files = new Map<string, { content: string; mtime: number }>();
  private folders = new Set<string>();
  private clock = 1;

  constructor(initialFiles: Record<string, string> = {}, initialFolders: string[] = []) {
    for (const folder of initialFolders) {
      this.folders.add(normalizePath(folder));
    }
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(normalizePath(path), { content, mtime: this.clock++ });
    }
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    const normalized = normalizePath(path);
    const file = this.files.get(normalized);
    if (file) {
      return new TFile(normalized, file.mtime);
    }
    if (this.folders.has(normalized)) {
      return new TFolder(normalized);
    }
    return null;
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.entries()]
      .filter(([path]) => path.endsWith(".md"))
      .map(([path, file]) => new TFile(path, file.mtime));
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.files.get(file.path)?.content ?? "";
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(normalizePath(path));
  }

  async create(path: string, content: string): Promise<void> {
    this.files.set(normalizePath(path), { content, mtime: this.clock++ });
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.files.set(normalizePath(file.path), { content, mtime: this.clock++ });
  }

  async rename(file: TFile, newPath: string): Promise<void> {
    const current = this.files.get(normalizePath(file.path));
    if (!current) {
      throw new Error(`Missing file for rename: ${file.path}`);
    }
    this.files.delete(normalizePath(file.path));
    this.files.set(normalizePath(newPath), { content: current.content, mtime: this.clock++ });
  }

  hasFile(path: string): boolean {
    return this.files.has(normalizePath(path));
  }

  readPath(path: string): string | undefined {
    return this.files.get(normalizePath(path))?.content;
  }

  listPaths(): string[] {
    return [...this.files.keys()].sort();
  }
}

class FakeGraphClient {
  deltaCalls: Array<{ start: string; end: string; deltaLink: string | null | undefined }> = [];
  deletedIds: string[] = [];
  events = new Map<string, GraphEvent>();
  nextDeltaEvents: GraphEvent[] = [];
  nextDeltaLink = "delta-next";

  async deltaEvents(start: string, end: string, deltaLink?: string | null) {
    this.deltaCalls.push({ start, end, deltaLink });
    return {
      events: this.nextDeltaEvents,
      deltaLink: this.nextDeltaLink,
    };
  }

  async createEvent(_payload: Record<string, unknown>): Promise<GraphEvent> {
    throw new Error("not implemented");
  }

  async updateEvent(_eventId: string, _payload: Record<string, unknown>): Promise<GraphEvent> {
    throw new Error("not implemented");
  }

  async getEvent(eventId: string): Promise<GraphEvent> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new Error("Graph request failed (404): missing");
    }
    return event;
  }

  async deleteEvent(eventId: string): Promise<void> {
    this.deletedIds.push(eventId);
    this.events.delete(eventId);
  }
}

function createSettings(overrides: Partial<Office365CalendarSyncSettings> = {}): Office365CalendarSyncSettings {
  return {
    ...DEFAULT_SETTINGS,
    clientId: "client-id",
    calendarId: "calendar-id",
    notesFolder: "Calendar",
    archiveFolder: "Calendar Archive",
    ...overrides,
  };
}

function createRemoteEvent(overrides: Partial<GraphEvent> = {}): GraphEvent {
  return {
    id: "event-1",
    subject: "Weekly Sync",
    start: { dateTime: "2026-05-01T15:00:00.000Z", timeZone: "UTC" },
    end: { dateTime: "2026-05-01T16:00:00.000Z", timeZone: "UTC" },
    body: { contentType: "text", content: "Agenda" },
    lastModifiedDateTime: "2026-05-01T16:05:00.000Z",
    ...overrides,
  };
}

describe("sync engine", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("does not reuse delta when the saved window changed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
    const vault = new FakeVault({}, ["Calendar"]);
    const graph = new FakeGraphClient();
    const settings = createSettings({
      deltaLink: "delta-old",
      deltaWindowStart: "2026-04-01T00:00:00.000Z",
      deltaWindowEnd: "2026-05-01T23:59:59.999Z",
    });
    const updates: Partial<Office365CalendarSyncSettings>[] = [];

    const engine = new SyncEngine(vault as never, settings, graph as never, async (next) => {
      updates.push(next);
    });

    await engine.run();

    expect(graph.deltaCalls).toHaveLength(1);
    expect(graph.deltaCalls[0]?.deltaLink).toBeNull();
    const window = buildSyncWindow(settings);
    expect(shouldReuseDelta(settings, window)).toBe(false);
    expect(updates.at(-1)?.deltaLink).toBe("delta-next");
  });

  it("renames a local note when the remote title changes", async () => {
    const existing = buildMarkdown(
      {
        office365EventId: "event-1",
        office365LastSyncedAt: "2026-05-01T00:00:00.000Z",
        start: "2026-05-01T15:00:00.000Z",
        end: "2026-05-01T16:00:00.000Z",
      },
      "Agenda",
    );
    const vault = new FakeVault(
      {
        "Calendar/weekly-sync.md": existing,
      },
      ["Calendar"],
    );
    const graph = new FakeGraphClient();
    graph.nextDeltaEvents = [
      createRemoteEvent({
        subject: "Weekly Planning",
        lastModifiedDateTime: "2026-05-03T16:05:00.000Z",
      }),
    ];

    const settings = createSettings({
      syncedNoteIndex: {
        "event-1": "Calendar/weekly-sync.md",
      },
    });

    const engine = new SyncEngine(vault as never, settings, graph as never, async () => {});
    await engine.run();

    expect(vault.hasFile("Calendar/weekly-planning.md")).toBe(true);
    expect(vault.hasFile("Calendar/weekly-sync.md")).toBe(false);
  });

  it("creates occurrence-specific note titles for recurring exceptions", async () => {
    const vault = new FakeVault({}, ["Calendar"]);
    const graph = new FakeGraphClient();
    graph.nextDeltaEvents = [
      createRemoteEvent({
        id: "event-exception",
        subject: "Standup",
        type: "exception",
        originalStart: "2026-05-08T15:00:00.000Z",
        recurrence: {
          pattern: { type: "weekly", interval: 1, daysOfWeek: ["friday"] },
          range: { type: "noEnd", startDate: "2026-05-01", recurrenceTimeZone: "UTC" },
        },
      }),
    ];

    const engine = new SyncEngine(vault as never, createSettings(), graph as never, async () => {});
    await engine.run();

    expect(vault.hasFile("Calendar/standup-2026-05-08-1500z.md")).toBe(true);
    const content = vault.readPath("Calendar/standup-2026-05-08-1500z.md") ?? "";
    expect(content).toContain("office365EventType: exception");
    expect(content).toContain('office365OriginalStart: "2026-05-08T15:00:00.000Z"');
  });

  it("archives before remote delete when a synced note is removed locally", async () => {
    const vault = new FakeVault({}, ["Calendar", "Calendar Archive"]);
    const graph = new FakeGraphClient();
    graph.events.set(
      "event-1",
      createRemoteEvent({
        subject: "Client Call",
      }),
    );

    let finalUpdate: Partial<Office365CalendarSyncSettings> | undefined;
    const engine = new SyncEngine(
      vault as never,
      createSettings({
        remoteDeleteBehavior: "archive-and-delete",
        syncedNoteIndex: {
          "event-1": "Calendar/client-call.md",
        },
      }),
      graph as never,
      async (next) => {
        finalUpdate = next;
      },
    );

    await engine.run();

    expect(graph.deletedIds).toEqual(["event-1"]);
    const archivePath = vault.listPaths().find((path) => path.startsWith("Calendar Archive/client-call-archived"));
    expect(archivePath).toBeTruthy();
    expect(vault.readPath(archivePath ?? "")).toContain("office365ArchivedFromPath: Calendar/client-call.md");
    expect(finalUpdate?.syncedNoteIndex).toEqual({});
  });
});
