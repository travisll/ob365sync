import { Notice, normalizePath, TFile, TFolder, Vault } from "obsidian";
import { buildMarkdown, extractFrontmatter, stripFrontmatter } from "./frontmatter";
import { GraphClient } from "./graph";
import type {
  EventNoteFrontmatter,
  GraphEvent,
  GraphRecurrence,
  LocalEventNote,
  Office365CalendarSyncSettings,
} from "./types";

export class SyncEngine {
  constructor(
    private readonly vault: Vault,
    private readonly settings: Office365CalendarSyncSettings,
    private readonly graphClient: GraphClient,
    private readonly onSettingsChange: (updates: Partial<Office365CalendarSyncSettings>) => Promise<void>,
  ) {}

  async run(): Promise<void> {
    ensureConfigured(this.settings);
    await this.ensureNotesFolder();

    const window = buildSyncWindow(this.settings);
    const canReuseDelta = shouldReuseDelta(this.settings, window);
    const initialLocalNotes = await this.loadLocalNotes();

    await this.processDeletedLocalNotes(initialLocalNotes);

    const deltaResult = await this.graphClient.deltaEvents(
      window.start,
      window.end,
      canReuseDelta ? this.settings.deltaLink : null,
    );
    const localNotes = initialLocalNotes;
    const localByEventId = new Map(
      localNotes
        .filter((note) => note.frontmatter.office365EventId)
        .map((note) => [note.frontmatter.office365EventId as string, note]),
    );

    for (const remoteEvent of deltaResult.events) {
      const localNote = localByEventId.get(remoteEvent.id);

      if (isDeletedEvent(remoteEvent) || remoteEvent.isCancelled) {
        if (localNote) {
          await this.markCancelled(localNote.path, remoteEvent);
        }
        continue;
      }

      if (!localNote) {
        await this.createNoteFromRemote(remoteEvent);
        continue;
      }

      await this.reconcileExisting(remoteEvent, localNote);
    }

    for (const note of localNotes) {
      if (note.frontmatter.office365EventId || note.frontmatter.office365SyncState === "cancelled") {
        continue;
      }

      await this.createRemoteFromLocal(note);
    }

    const refreshedNotes = await this.loadLocalNotes();

    await this.onSettingsChange({
      lastSyncAt: new Date().toISOString(),
      deltaLink: deltaResult.deltaLink,
      deltaWindowStart: window.start,
      deltaWindowEnd: window.end,
      syncedNoteIndex: buildSyncedNoteIndex(refreshedNotes),
    });

    new Notice("Office 365 calendar sync completed.");
  }

  private async processDeletedLocalNotes(localNotes: LocalEventNote[]): Promise<void> {
    if (this.settings.remoteDeleteBehavior === "disabled") {
      return;
    }

    const indexedEntries = Object.entries(this.settings.syncedNoteIndex);
    if (indexedEntries.length === 0) {
      return;
    }

    const liveEventIds = new Set(
      localNotes
        .map((note) => note.frontmatter.office365EventId)
        .filter((value): value is string => Boolean(value)),
    );

    for (const [eventId, previousPath] of indexedEntries) {
      if (liveEventIds.has(eventId)) {
        continue;
      }

      if (this.vault.getAbstractFileByPath(previousPath)) {
        continue;
      }

      try {
        const remoteEvent = await this.graphClient.getEvent(eventId);
        if (remoteEvent.isCancelled || isDeletedEvent(remoteEvent)) {
          continue;
        }

        await this.archiveDeletedNote(remoteEvent, previousPath);
        await this.graphClient.deleteEvent(eventId);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
    }
  }

  private async ensureNotesFolder(): Promise<void> {
    const normalized = normalizePath(this.settings.notesFolder);
    const existing = this.vault.getAbstractFileByPath(normalized);
    if (!existing) {
      await this.vault.createFolder(normalized);
      return;
    }

    if (!(existing instanceof TFolder)) {
      throw new Error(`Notes folder path exists but is not a folder: ${normalized}`);
    }
  }

  private async ensureArchiveFolder(): Promise<void> {
    const normalized = normalizePath(this.settings.archiveFolder);
    const existing = this.vault.getAbstractFileByPath(normalized);
    if (!existing) {
      await this.vault.createFolder(normalized);
      return;
    }

    if (!(existing instanceof TFolder)) {
      throw new Error(`Archive folder path exists but is not a folder: ${normalized}`);
    }
  }

  private async loadLocalNotes(): Promise<LocalEventNote[]> {
    const folderPath = normalizePath(this.settings.notesFolder);
    const notes: LocalEventNote[] = [];

    for (const file of this.vault.getMarkdownFiles()) {
      if (!isManagedNotePath(file.path, folderPath)) {
        continue;
      }

      const content = await this.vault.cachedRead(file);
      notes.push({
        path: file.path,
        title: file.basename,
        body: stripFrontmatter(content),
        frontmatter: extractFrontmatter(content),
        stat: {
          mtime: file.stat.mtime,
        },
      });
    }

    return notes;
  }

  private async createNoteFromRemote(event: GraphEvent): Promise<void> {
    const filePath = await this.preferredNotePath(event);
    const markdown = buildMarkdown(frontmatterFromGraph(event, this.settings.calendarId), event.body?.content ?? "");
    await this.vault.create(filePath, markdown);
  }

  private async reconcileExisting(remoteEvent: GraphEvent, localNote: LocalEventNote): Promise<void> {
    const remoteUpdatedAt = safeTimestamp(remoteEvent.lastModifiedDateTime ?? remoteEvent.start.dateTime);
    const lastSyncedAt = safeTimestamp(localNote.frontmatter.office365LastSyncedAt);
    const localUpdatedAt = localNote.stat.mtime;
    const remoteChanged = remoteUpdatedAt > lastSyncedAt;
    const localChanged = localUpdatedAt > lastSyncedAt;

    if (remoteChanged && !localChanged) {
      await this.updateLocalFromRemote(localNote.path, remoteEvent);
      return;
    }

    if (!remoteChanged && localChanged) {
      await this.updateRemoteFromLocal(localNote, remoteEvent);
      return;
    }

    if (remoteChanged && localChanged) {
      if (remoteUpdatedAt >= localUpdatedAt) {
        await this.updateLocalFromRemote(localNote.path, remoteEvent, "conflict");
      } else {
        await this.updateRemoteFromLocal(localNote, remoteEvent, "conflict");
      }
    }
  }

  private async createRemoteFromLocal(localNote: LocalEventNote): Promise<void> {
    if (!localNote.frontmatter.start || !localNote.frontmatter.end) {
      return;
    }

    const created = await this.graphClient.createEvent(graphPayloadFromLocal(localNote));
    await this.updateLocalFromRemote(localNote.path, created);
  }

  private async updateRemoteFromLocal(
    localNote: LocalEventNote,
    remoteEvent: GraphEvent,
    syncState: EventNoteFrontmatter["office365SyncState"] = "synced",
  ): Promise<void> {
    const payload = graphPayloadFromLocal(localNote);
    payload.subject = localNote.title || remoteEvent.subject;
    const updated = await this.graphClient.updateEvent(remoteEvent.id, payload);
    await this.updateLocalFromRemote(localNote.path, updated, syncState);
  }

  private async updateLocalFromRemote(
    path: string,
    remoteEvent: GraphEvent,
    syncState: EventNoteFrontmatter["office365SyncState"] = "synced",
  ): Promise<void> {
    let file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return;
    }

    if (this.settings.renameNoteOnRemoteTitleChange) {
      file = await this.renameFileForRemoteEvent(file, remoteEvent);
    }

    const content = await this.vault.cachedRead(file);
    const currentFrontmatter = extractFrontmatter(content);
    const body = stripFrontmatter(content);
    const nextBody = remoteEvent.body?.content ?? body;
    const markdown = buildMarkdown(
      {
        ...currentFrontmatter,
        ...frontmatterFromGraph(remoteEvent, this.settings.calendarId, syncState),
      },
      nextBody,
    );
    await this.vault.modify(file, markdown);
  }

  private async markCancelled(path: string, remoteEvent?: GraphEvent): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await this.vault.cachedRead(file);
    const frontmatter = {
      ...extractFrontmatter(content),
      ...(remoteEvent ? frontmatterFromGraph(remoteEvent, this.settings.calendarId, "cancelled") : {}),
      office365SyncState: "cancelled" as const,
      office365LastSyncedAt: new Date().toISOString(),
    };
    const markdown = buildMarkdown(frontmatter, stripFrontmatter(content));
    await this.vault.modify(file, markdown);
  }

  private async archiveDeletedNote(remoteEvent: GraphEvent, previousPath: string): Promise<void> {
    await this.ensureArchiveFolder();
    const archivePath = await this.nextArchivePath(remoteEvent, previousPath);
    const markdown = buildMarkdown(
      {
        ...frontmatterFromGraph(remoteEvent, this.settings.calendarId, "cancelled"),
        office365ArchivedFromPath: previousPath,
        office365DeletedRemotelyAt: new Date().toISOString(),
      },
      remoteEvent.body?.content ?? "",
    );
    await this.vault.create(archivePath, markdown);
  }

  private async renameFileForRemoteEvent(file: TFile, remoteEvent: GraphEvent): Promise<TFile> {
    const preferredPath = await this.preferredNotePath(remoteEvent, file.path);
    if (preferredPath === file.path) {
      return file;
    }

    await this.vault.rename(file, preferredPath);
    const renamed = this.vault.getAbstractFileByPath(preferredPath);
    return renamed instanceof TFile ? renamed : file;
  }

  private async preferredNotePath(event: GraphEvent, currentPath?: string): Promise<string> {
    const baseName = buildNoteTitle(event);
    const basePath = normalizePath(`${this.settings.notesFolder}/${sanitizeFilename(baseName)}.md`);

    if (currentPath && basePath === currentPath) {
      return currentPath;
    }

    const existing = this.vault.getAbstractFileByPath(basePath);
    if (!existing || (currentPath && existing instanceof TFile && existing.path === currentPath)) {
      return basePath;
    }

    let counter = 2;
    while (true) {
      const candidate = normalizePath(
        `${this.settings.notesFolder}/${sanitizeFilename(baseName)}-${counter}.md`,
      );
      const match = this.vault.getAbstractFileByPath(candidate);
      if (!match || (currentPath && match instanceof TFile && match.path === currentPath)) {
        return candidate;
      }
      counter += 1;
    }
  }

  private async nextArchivePath(event: GraphEvent, previousPath: string): Promise<string> {
    const baseName = `${buildNoteTitle(event)} archived`;
    const basePath = normalizePath(`${this.settings.archiveFolder}/${sanitizeFilename(baseName)}.md`);
    if (!this.vault.getAbstractFileByPath(basePath)) {
      return basePath;
    }

    let counter = 2;
    while (true) {
      const candidate = normalizePath(
        `${this.settings.archiveFolder}/${sanitizeFilename(baseName)}-${counter}.md`,
      );
      if (!this.vault.getAbstractFileByPath(candidate) && candidate !== previousPath) {
        return candidate;
      }
      counter += 1;
    }
  }
}

function ensureConfigured(settings: Office365CalendarSyncSettings): void {
  if (!settings.clientId || !settings.calendarId) {
    throw new Error("Client ID and Calendar ID must be configured in plugin settings.");
  }
}

export function buildSyncWindow(settings: Office365CalendarSyncSettings): { start: string; end: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - settings.syncDaysPast);

  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  end.setUTCDate(end.getUTCDate() + settings.syncDaysFuture);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function shouldReuseDelta(
  settings: Pick<Office365CalendarSyncSettings, "deltaLink" | "deltaWindowStart" | "deltaWindowEnd">,
  window: { start: string; end: string },
): boolean {
  return Boolean(
    settings.deltaLink &&
      settings.deltaWindowStart === window.start &&
      settings.deltaWindowEnd === window.end,
  );
}

function isDeletedEvent(event: GraphEvent): boolean {
  return Boolean(event["@removed"]);
}

function isManagedNotePath(path: string, folderPath: string): boolean {
  return path.startsWith(`${folderPath}/`) || path === `${folderPath}.md`;
}

export function buildNoteTitle(event: GraphEvent): string {
  const subject = event.subject || "Untitled Event";
  if (event.type === "occurrence" || event.type === "exception") {
    const stamp = formatNoteDate(event.originalStart ?? event.start.dateTime);
    return `${subject} ${stamp}`;
  }
  return subject;
}

function formatNoteDate(value?: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}${minute}Z`.trim();
}

export function frontmatterFromGraph(
  event: GraphEvent,
  calendarId: string,
  syncState: EventNoteFrontmatter["office365SyncState"] = "synced",
): EventNoteFrontmatter {
  return {
    office365EventId: event.id,
    office365CalendarId: calendarId,
    office365ChangeKey: event.changeKey ?? "",
    office365LastSyncedAt: new Date().toISOString(),
    office365RemoteUpdatedAt: event.lastModifiedDateTime ?? event.start.dateTime,
    office365SyncState: syncState,
    office365EventType: event.type ?? "",
    office365SeriesMasterId: event.seriesMasterId ?? "",
    office365OriginalStart: event.originalStart ?? "",
    office365ICalUId: event.iCalUId ?? "",
    office365Recurrence: event.recurrence ? JSON.stringify(event.recurrence) : "",
    office365IsAllDay: Boolean(event.isAllDay),
    office365StartTimeZone: event.start.timeZone ?? "",
    office365EndTimeZone: event.end.timeZone ?? "",
    start: event.start.dateTime,
    end: event.end.dateTime,
    location: event.location?.displayName ?? "",
    attendees: (event.attendees ?? [])
      .map((attendee) => attendee.emailAddress?.address)
      .filter((value): value is string => Boolean(value)),
    webLink: event.webLink ?? "",
  };
}

function graphPayloadFromLocal(localNote: LocalEventNote): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    subject: localNote.title,
    body: {
      contentType: "text",
      content: localNote.body,
    },
    start: {
      dateTime: localNote.frontmatter.start,
      timeZone: localNote.frontmatter.office365StartTimeZone || "UTC",
    },
    end: {
      dateTime: localNote.frontmatter.end,
      timeZone: localNote.frontmatter.office365EndTimeZone || "UTC",
    },
    location: {
      displayName: localNote.frontmatter.location ?? "",
    },
    attendees: (localNote.frontmatter.attendees ?? []).map((address) => ({
      emailAddress: {
        address,
      },
      type: "required",
    })),
    isAllDay: Boolean(localNote.frontmatter.office365IsAllDay),
  };

  const recurrence = parseRecurrence(localNote.frontmatter.office365Recurrence);
  if (recurrence) {
    payload.recurrence = recurrence;
  }

  return payload;
}

function parseRecurrence(value?: string): GraphRecurrence | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as GraphRecurrence;
  } catch {
    return null;
  }
}

function safeTimestamp(value?: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSyncedNoteIndex(localNotes: LocalEventNote[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const note of localNotes) {
    const eventId = note.frontmatter.office365EventId;
    if (!eventId || note.frontmatter.office365SyncState === "cancelled") {
      continue;
    }
    index[eventId] = note.path;
  }
  return index;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Graph request failed (404)");
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "event";
}
