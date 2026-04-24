import { App, Modal, Notice } from "obsidian";
import { getActiveCalendarNoteContext } from "./noteContext";
import { defaultRecurrenceFormState, parseRecurrenceFormState, type RecurrenceFormState } from "./recurrence";
import { renderRecurrenceEditor } from "./recurrenceEditor";
import type { Office365CalendarSyncSettings } from "./types";

export class RecurrenceEditorModal extends Modal {
  private state: RecurrenceFormState;
  private readonly fileName: string;
  private readonly onSave: (nextRecurrence: string) => Promise<void>;

  constructor(
    app: App,
    fileName: string,
    initialState: RecurrenceFormState,
    onSave: (nextRecurrence: string) => Promise<void>,
  ) {
    super(app);
    this.fileName = fileName;
    this.state = initialState;
    this.onSave = onSave;
  }

  onOpen(): void {
    this.setTitle(`Edit recurrence: ${this.fileName}`);
    this.render();
  }

  private render(): void {
    renderRecurrenceEditor({
      containerEl: this.contentEl,
      title: "Recurrence",
      state: this.state,
      onStateChange: (nextState) => {
        this.state = nextState;
        this.render();
      },
      onSave: async (nextRecurrence) => {
        await this.onSave(nextRecurrence);
        this.close();
      },
      onCancel: () => {
        this.close();
      },
    });
  }
}

export async function openRecurrenceEditorForActiveNote(
  app: App,
  settings?: Pick<Office365CalendarSyncSettings, "notesFolder">,
): Promise<void> {
  const context = getActiveCalendarNoteContext(app, settings ?? { notesFolder: "Calendar" });
  if (!context) {
    new Notice("Open a calendar note to edit recurrence.");
    return;
  }

  const initialState =
    parseRecurrenceFormState(
      context.frontmatter.office365Recurrence,
      context.frontmatter.start,
      context.frontmatter.office365StartTimeZone,
    ) ||
    defaultRecurrenceFormState(
      context.frontmatter.start,
      context.frontmatter.office365StartTimeZone,
    );

  const modal = new RecurrenceEditorModal(app, context.file.basename, initialState, async (nextRecurrence) => {
    await app.fileManager.processFrontMatter(context.file, (mutableFrontmatter) => {
      if (nextRecurrence) {
        mutableFrontmatter.office365Recurrence = nextRecurrence;
      } else {
        delete mutableFrontmatter.office365Recurrence;
      }
    });
    new Notice("Recurrence updated.");
  });
  modal.open();
}
