import { Notice, Plugin, TFile } from "obsidian";
import { GraphClient } from "./graph";
import { getActiveCalendarNoteContext } from "./noteContext";
import { openRecurrenceEditorForActiveNote } from "./recurrenceModal";
import { DEFAULT_SETTINGS, Office365CalendarSyncSettingTab } from "./settings";
import { OFFICE365_SIDEBAR_VIEW_TYPE, Office365CalendarSidebarView } from "./sidebarView";
import { SyncEngine } from "./sync";
import type { Office365CalendarSyncSettings } from "./types";

export default class Office365CalendarSyncPlugin extends Plugin {
  settings: Office365CalendarSyncSettings = DEFAULT_SETTINGS;
  private autoSyncTimer: number | null = null;
  private syncInFlight: Promise<void> | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new Office365CalendarSyncSettingTab(this.app, this));
    this.registerView(
      OFFICE365_SIDEBAR_VIEW_TYPE,
      (leaf) => new Office365CalendarSidebarView(leaf, this),
    );

    this.addRibbonIcon("calendar", "Open Office 365 calendar sidebar", () => {
      void this.activateSidebarView();
    });

    this.addCommand({
      id: "office365-open-sidebar",
      name: "Open Office 365 sidebar",
      callback: async () => {
        await this.activateSidebarView();
      },
    });

    this.addCommand({
      id: "office365-sign-in",
      name: "Sign in to Microsoft",
      callback: async () => {
        await this.signIn();
      },
    });

    this.addCommand({
      id: "office365-list-calendars",
      name: "List Office 365 calendars",
      callback: async () => {
        await this.listCalendarsNotice();
      },
    });

    this.addCommand({
      id: "office365-sync-now",
      name: "Sync Office 365 calendar now",
      callback: async () => {
        await this.syncNow();
      },
    });

    this.addCommand({
      id: "office365-edit-recurrence",
      name: "Edit Office 365 recurrence for current note",
      callback: async () => {
        await openRecurrenceEditorForActiveNote(this.app, this.settings);
      },
    });

    this.addCommand({
      id: "office365-reset-sync-state",
      name: "Reset Office 365 sync state",
      callback: async () => {
        await this.resetSyncState();
      },
    });

    this.restartAutoSync();
    this.registerWorkspaceHooks();

    if (this.settings.syncOnStartup) {
      window.setTimeout(() => {
        void this.syncNow();
      }, 4000);
    }
  }

  onunload(): void {
    if (this.autoSyncTimer !== null) {
      window.clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }

    this.app.workspace.detachLeavesOfType(OFFICE365_SIDEBAR_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async updateSettings(updates: Partial<Office365CalendarSyncSettings>): Promise<void> {
    this.settings = {
      ...this.settings,
      ...updates,
    };
    await this.saveSettings();
  }

  async signIn(): Promise<void> {
    try {
      const graph = this.createGraphClient();
      await graph.signInInteractively();
      new Notice("Microsoft sign-in complete.");
    } catch (error) {
      handleError(error, "Microsoft sign-in failed");
    }
  }

  async signOut(): Promise<void> {
    try {
      const graph = this.createGraphClient();
      await graph.signOut();
      new Notice("Microsoft account disconnected.");
    } catch (error) {
      handleError(error, "Microsoft sign-out failed");
    }
  }

  async listCalendarsNotice(): Promise<void> {
    try {
      const graph = this.createGraphClient();
      const calendars = await graph.listCalendars();
      if (calendars.length === 0) {
        new Notice("No calendars were returned by Microsoft Graph.");
        return;
      }

      const message = calendars
        .slice(0, 5)
        .map((calendar) => `${calendar.name}: ${calendar.id}`)
        .join("\n");

      new Notice(message, 15000);
    } catch (error) {
      handleError(error, "Could not list calendars");
    }
  }

  async syncNow(): Promise<void> {
    if (this.syncInFlight) {
      new Notice("Office 365 sync is already running.");
      return this.syncInFlight;
    }

    this.syncInFlight = this.runSync();
    try {
      await this.syncInFlight;
      await this.refreshSidebarViews();
    } finally {
      this.syncInFlight = null;
    }
  }

  async resetSyncState(): Promise<void> {
    await this.updateSettings({
      deltaLink: null,
      deltaWindowStart: null,
      deltaWindowEnd: null,
    });
    new Notice("Office 365 delta sync state reset. The next sync will do a full refresh.");
    await this.refreshSidebarViews();
  }

  async archiveAndDeleteRemoteForFile(file: TFile): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = (cache?.frontmatter ?? {}) as {
      office365EventId?: string;
      office365CalendarId?: string;
    };

    if (!frontmatter.office365EventId) {
      throw new Error("This note is not linked to an Office 365 event.");
    }

    const content = await this.app.vault.cachedRead(file);
    const archiveFolder = this.settings.archiveFolder;
    const archivePath = await this.nextArchiveFilePath(file.basename);

    const existingArchiveFolder = this.app.vault.getAbstractFileByPath(archiveFolder);
    if (!existingArchiveFolder) {
      await this.app.vault.createFolder(archiveFolder);
    }

    await this.app.vault.create(archivePath, content);
    await this.createGraphClient().deleteEvent(frontmatter.office365EventId);
    await this.app.vault.delete(file);

    new Notice("Archived the note and deleted the remote Office 365 event.");
    await this.syncNow();
  }

  async activateSidebarView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(OFFICE365_SIDEBAR_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: OFFICE365_SIDEBAR_VIEW_TYPE,
        active: true,
      });
    }

    workspace.revealLeaf(leaf);
    await this.refreshSidebarViews();
  }

  async refreshSidebarViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(OFFICE365_SIDEBAR_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof Office365CalendarSidebarView) {
        await view.refresh();
      }
    }
  }

  private async runSync(): Promise<void> {
    try {
      new Notice("Office 365 sync started...");
      const syncEngine = new SyncEngine(
        this.app.vault,
        this.settings,
        this.createGraphClient(),
        async (updates) => {
          await this.updateSettings(updates);
        },
      );
      await syncEngine.run();
      await this.refreshSidebarViews();
    } catch (error) {
      handleError(error, "Office 365 sync failed");
    }
  }

  restartAutoSync(): void {
    if (this.autoSyncTimer !== null) {
      window.clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }

    if (this.settings.autoSyncIntervalMinutes <= 0) {
      return;
    }

    this.autoSyncTimer = window.setInterval(() => {
      void this.syncNow();
    }, this.settings.autoSyncIntervalMinutes * 60 * 1000);
  }

  private createGraphClient(): GraphClient {
    return new GraphClient(this.settings, async (updates) => {
      await this.updateSettings(updates);
    });
  }

  private async nextArchiveFilePath(basename: string): Promise<string> {
    const basePath = `${this.settings.archiveFolder}/${basename}-deleted.md`;
    if (!this.app.vault.getAbstractFileByPath(basePath)) {
      return basePath;
    }

    let counter = 2;
    while (true) {
      const candidate = `${this.settings.archiveFolder}/${basename}-deleted-${counter}.md`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) {
        return candidate;
      }
      counter += 1;
    }
  }

  private registerWorkspaceHooks(): void {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.refreshSidebarViews();
      }),
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
        void this.refreshSidebarViews();
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", () => {
        void this.refreshSidebarViews();
      }),
    );

    this.registerEvent(
      this.app.vault.on("delete", () => {
        void this.refreshSidebarViews();
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        this.addFileMenuItems(menu, file);
      }),
    );
  }

  private addFileMenuItems(menu: { addItem: (callback: (item: MenuShim) => void) => void }, file: TFile): void {
    const context = getActiveCalendarNoteContext(this.app, this.settings);
    const isActiveFile = context?.file.path === file.path;
    const webLink = isActiveFile ? context.frontmatter.webLink : undefined;

    menu.addItem((item) => {
      item
        .setTitle("Open Office 365 sidebar")
        .setIcon("calendar")
        .onClick(() => {
          void this.activateSidebarView();
        });
    });

    if (!isActiveFile) {
      return;
    }

    menu.addItem((item) => {
      item
        .setTitle("Edit Office 365 recurrence")
        .setIcon("rotate-cw")
        .onClick(() => {
          void openRecurrenceEditorForActiveNote(this.app, this.settings);
        });
    });

    if (webLink) {
      menu.addItem((item) => {
        item
          .setTitle("Open in Outlook")
          .setIcon("external-link")
          .onClick(() => {
            window.open(webLink, "_blank", "noopener,noreferrer");
          });
      });
    }
  }
}

interface MenuShim {
  setTitle(title: string): MenuShim;
  setIcon(icon: string): MenuShim;
  onClick(callback: () => void): MenuShim;
}

function handleError(error: unknown, prefix: string): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  new Notice(`${prefix}: ${message}`, 12000);
}
