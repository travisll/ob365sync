import {
  ItemView,
  Notice,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { getActiveCalendarNoteContext } from "./noteContext";
import { defaultRecurrenceFormState, parseRecurrenceFormState, type RecurrenceFormState } from "./recurrence";
import { renderRecurrenceEditor } from "./recurrenceEditor";
import {
  attendeesTextToList,
  buildCalendarDetailsState,
  dateTimeLocalToIso,
  type CalendarDetailsState,
} from "./sidebarHelpers";
import type Office365CalendarSyncPlugin from "./main";

export const OFFICE365_SIDEBAR_VIEW_TYPE = "office365-calendar-sidebar";

export class Office365CalendarSidebarView extends ItemView {
  private recurrenceState: RecurrenceFormState | null = null;
  private detailsState: CalendarDetailsState | null = null;
  private activeFilePath: string | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: Office365CalendarSyncPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return OFFICE365_SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Office 365 Calendar";
  }

  getIcon(): string {
    return "calendar";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("office365-sidebar-view");
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const context = getActiveCalendarNoteContext(this.app, this.plugin.settings);
    this.contentEl.empty();

    const header = this.contentEl.createDiv({ cls: "office365-sidebar-header" });
    header.createEl("h2", { text: "Office 365 Calendar" });
    header.createEl("p", {
      text: context?.file.basename ?? "No active note",
      cls: "office365-sidebar-subtitle",
    });

    this.renderActionRibbon(this.contentEl, context?.file ?? null, context?.frontmatter?.webLink);

    if (!context) {
      this.renderEmptyState("Open a note to edit Office 365 event details.");
      return;
    }

    const summary = this.contentEl.createDiv({ cls: "office365-sidebar-summary" });
    summary.createEl("p", {
      text: context.isManagedCalendarNote
        ? `Sync state: ${context.frontmatter.office365SyncState ?? "local-only"}`
        : "This note is not yet managed by the calendar sync.",
    });
    if (context.frontmatter.office365EventId) {
      summary.createEl("p", {
        text: `Event ID: ${context.frontmatter.office365EventId}`,
      });
    }
    if (context.frontmatter.start || context.frontmatter.end) {
      summary.createEl("p", {
        text: `Time: ${context.frontmatter.start ?? "?"} -> ${context.frontmatter.end ?? "?"}`,
      });
    }

    if (this.activeFilePath !== context.file.path || !this.recurrenceState || !this.detailsState) {
      this.activeFilePath = context.file.path;
      this.detailsState = buildCalendarDetailsState(context.file.basename, context.frontmatter);
      this.recurrenceState = parseRecurrenceFormState(
        context.frontmatter.office365Recurrence,
        context.frontmatter.start,
        context.frontmatter.office365StartTimeZone,
      );
      if (!this.recurrenceState.startDate) {
        this.recurrenceState = defaultRecurrenceFormState(
          context.frontmatter.start,
          context.frontmatter.office365StartTimeZone,
        );
      }
    }

    const detailsContainer = this.contentEl.createDiv({ cls: "office365-sidebar-details" });
    this.renderDetailsEditor(detailsContainer, context.file);

    if (!context.isManagedCalendarNote) {
      this.renderEmptyState("This note can still be edited here. Run sync to create or link the remote event.");
    }

    const recurrenceContainer = this.contentEl.createDiv({ cls: "office365-sidebar-recurrence" });
    renderRecurrenceEditor({
      containerEl: recurrenceContainer,
      title: "Recurrence",
      saveLabel: "Save recurrence",
      state: this.recurrenceState,
      onStateChange: (nextState) => {
        this.recurrenceState = nextState;
        void this.refresh();
      },
      onSave: async (nextRecurrence) => {
        await this.app.fileManager.processFrontMatter(context.file, (mutableFrontmatter) => {
          if (nextRecurrence) {
            mutableFrontmatter.office365Recurrence = nextRecurrence;
          } else {
            delete mutableFrontmatter.office365Recurrence;
          }
        });
        new Notice("Recurrence updated.");
        this.recurrenceState = parseRecurrenceFormState(
          nextRecurrence,
          this.detailsState?.start ? dateTimeLocalToIso(this.detailsState.start) : context.frontmatter.start,
          this.detailsState?.startTimeZone ?? context.frontmatter.office365StartTimeZone,
        );
        await this.refresh();
      },
    });

    const controlsContainer = this.contentEl.createDiv({ cls: "office365-sidebar-controls" });
    this.renderSyncControls(controlsContainer, context.file, Boolean(context.frontmatter.office365EventId));
  }

  private renderDetailsEditor(containerEl: HTMLElement, file: TFile): void {
    const state = this.detailsState;
    if (!state) {
      return;
    }

    containerEl.createEl("h3", { text: "Details" });

    new Setting(containerEl)
      .setName("Title")
      .setDesc("This becomes the Office 365 event subject on sync.")
      .addText((text) =>
        text.setValue(state.title).onChange((value) => {
          this.detailsState = {
            ...state,
            title: value.trim(),
          };
        }),
      );

    new Setting(containerEl)
      .setName("Start")
      .addText((text) =>
        text.setPlaceholder("YYYY-MM-DDTHH:mm").setValue(state.start).onChange((value) => {
          this.detailsState = {
            ...state,
            start: value.trim(),
          };
        }),
      );

    new Setting(containerEl)
      .setName("End")
      .addText((text) =>
        text.setPlaceholder("YYYY-MM-DDTHH:mm").setValue(state.end).onChange((value) => {
          this.detailsState = {
            ...state,
            end: value.trim(),
          };
        }),
      );

    new Setting(containerEl)
      .setName("All day")
      .addToggle((toggle) =>
        toggle.setValue(state.allDay).onChange((value) => {
          this.detailsState = {
            ...state,
            allDay: value,
          };
        }),
      );

    new Setting(containerEl)
      .setName("Start time zone")
      .addText((text) =>
        text.setValue(state.startTimeZone).onChange((value) => {
          this.detailsState = {
            ...state,
            startTimeZone: value.trim() || "UTC",
          };
        }),
      );

    new Setting(containerEl)
      .setName("End time zone")
      .addText((text) =>
        text.setValue(state.endTimeZone).onChange((value) => {
          this.detailsState = {
            ...state,
            endTimeZone: value.trim() || "UTC",
          };
        }),
      );

    new Setting(containerEl)
      .setName("Location")
      .addText((text) =>
        text.setValue(state.location).onChange((value) => {
          this.detailsState = {
            ...state,
            location: value.trim(),
          };
        }),
      );

    const attendeesSetting = new Setting(containerEl);
    attendeesSetting.setName("Attendees").setDesc("One email per line or comma-separated.");
    const textArea = containerEl.createEl("textarea", {
      cls: "office365-sidebar-textarea",
      text: state.attendeesText,
    });
    textArea.rows = 5;
    textArea.addEventListener("input", () => {
      this.detailsState = {
        ...state,
        attendeesText: textArea.value,
      };
    });

    new Setting(containerEl)
      .addButton((button) =>
        button.setButtonText("Save details").setCta().onClick(async () => {
          await this.saveDetails(file);
        }),
      )
      .addButton((button) =>
        button.setButtonText("Reset form").onClick(async () => {
          const context = getActiveCalendarNoteContext(this.app, this.plugin.settings);
          if (!context) {
            return;
          }
          this.detailsState = buildCalendarDetailsState(context.file.basename, context.frontmatter);
          await this.refresh();
        }),
      );
  }

  private renderSyncControls(containerEl: HTMLElement, file: TFile, hasRemoteEvent: boolean): void {
    containerEl.createEl("h3", { text: "Sync Controls" });

    const controls = containerEl.createDiv({ cls: "office365-note-ribbon" });
    createRibbonButton(controls, "Sync now", async () => {
      await this.plugin.syncNow();
      await this.refresh();
    });

    createRibbonButton(controls, "Save and sync", async () => {
      await this.saveDetails(file);
      await this.plugin.syncNow();
      await this.refresh();
    });

    createRibbonButton(
      controls,
      "Archive + delete remote",
      async () => {
        const confirmed = window.confirm(
          "Archive this note locally and delete the linked Office 365 event?",
        );
        if (!confirmed) {
          return;
        }
        await this.plugin.archiveAndDeleteRemoteForFile(file);
      },
      !hasRemoteEvent,
    );
  }

  private async saveDetails(file: TFile): Promise<void> {
    const state = this.detailsState;
    if (!state) {
      return;
    }

    if (!state.title || !state.start || !state.end) {
      new Notice("Title, start, and end are required.");
      return;
    }

    const nextTitle = state.title.trim();
    if (nextTitle !== file.basename) {
      const parentPath = file.parent?.path;
      const nextPath = parentPath ? `${parentPath}/${nextTitle}.md` : `${nextTitle}.md`;
      await this.app.fileManager.renameFile(file, nextPath);
    }

    const activeFile = this.app.workspace.getActiveFile() ?? file;
    await this.app.fileManager.processFrontMatter(activeFile, (mutableFrontmatter) => {
      mutableFrontmatter.start = dateTimeLocalToIso(state.start);
      mutableFrontmatter.end = dateTimeLocalToIso(state.end);
      mutableFrontmatter.office365StartTimeZone = state.startTimeZone || "UTC";
      mutableFrontmatter.office365EndTimeZone = state.endTimeZone || "UTC";
      mutableFrontmatter.office365IsAllDay = state.allDay;

      if (state.location) {
        mutableFrontmatter.location = state.location;
      } else {
        delete mutableFrontmatter.location;
      }

      const attendees = attendeesTextToList(state.attendeesText);
      if (attendees.length > 0) {
        mutableFrontmatter.attendees = attendees;
      } else {
        delete mutableFrontmatter.attendees;
      }
    });

    this.detailsState = {
      ...state,
      title: nextTitle,
    };
    new Notice("Calendar details updated.");
    await this.plugin.refreshSidebarViews();
  }

  private renderActionRibbon(containerEl: HTMLElement, file: TFile | null, webLink?: string): void {
    const ribbon = containerEl.createDiv({ cls: "office365-note-ribbon" });

    createRibbonButton(ribbon, "Sync now", async () => {
      await this.plugin.syncNow();
      await this.refresh();
    });

    createRibbonButton(ribbon, "Open settings", async () => {
      // @ts-expect-error Obsidian API exposes openTabById at runtime
      this.app.setting?.open();
      // @ts-expect-error Obsidian API exposes openTabById at runtime
      this.app.setting?.openTabById?.(this.plugin.manifest.id);
    });

    createRibbonButton(
      ribbon,
      "Open note",
      async () => {
        if (file) {
          await this.app.workspace.getLeaf(true).openFile(file);
        }
      },
      !file,
    );

    createRibbonButton(
      ribbon,
      "Open in Outlook",
      async () => {
        if (webLink) {
          window.open(webLink, "_blank", "noopener,noreferrer");
        }
      },
      !webLink,
    );
  }

  private renderEmptyState(message: string): void {
    const emptyState = this.contentEl.createDiv({ cls: "office365-sidebar-empty" });
    emptyState.createEl("p", { text: message });
  }
}

function createRibbonButton(
  containerEl: HTMLElement,
  label: string,
  onClick: () => void | Promise<void>,
  disabled = false,
): void {
  const button = containerEl.createEl("button", {
    text: label,
    cls: "office365-note-ribbon-button",
  });
  button.disabled = disabled;
  button.addEventListener("click", () => {
    void onClick();
  });
}
