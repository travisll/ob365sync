import { App, MarkdownView, TFile } from "obsidian";
import type { EventNoteFrontmatter, Office365CalendarSyncSettings } from "./types";

export interface CalendarNoteContext {
  file: TFile;
  frontmatter: Partial<EventNoteFrontmatter>;
  isManagedCalendarNote: boolean;
}

export function getActiveCalendarNoteContext(
  app: App,
  settings: Pick<Office365CalendarSyncSettings, "notesFolder">,
): CalendarNoteContext | null {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  const file = view?.file;
  if (!file) {
    return null;
  }

  const cache = app.metadataCache.getFileCache(file);
  const frontmatter = (cache?.frontmatter ?? {}) as Partial<EventNoteFrontmatter>;

  return {
    file,
    frontmatter,
    isManagedCalendarNote: isManagedCalendarFile(file, frontmatter, settings.notesFolder),
  };
}

export function isManagedCalendarFile(
  file: TFile,
  frontmatter: Partial<EventNoteFrontmatter>,
  notesFolder: string,
): boolean {
  return Boolean(
    frontmatter.office365EventId ||
      file.path.startsWith(`${notesFolder}/`) ||
      file.path === `${notesFolder}.md`,
  );
}
