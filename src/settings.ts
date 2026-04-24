import { App, PluginSettingTab, Setting } from "obsidian";
import type Office365CalendarSyncPlugin from "./main";
import type { Office365CalendarSyncSettings } from "./types";

export const DEFAULT_SETTINGS: Office365CalendarSyncSettings = {
  tenantId: "",
  clientId: "",
  calendarId: "",
  notesFolder: "Calendar",
  syncDaysPast: 30,
  syncDaysFuture: 90,
  syncOnStartup: false,
  autoSyncIntervalMinutes: 0,
  renameNoteOnRemoteTitleChange: true,
  remoteDeleteBehavior: "disabled",
  archiveFolder: "Calendar Archive",
  lastSyncAt: null,
  tokenCache: "",
  accountHomeId: null,
  deltaLink: null,
  deltaWindowStart: null,
  deltaWindowEnd: null,
  syncedNoteIndex: {},
};

export class Office365CalendarSyncSettingTab extends PluginSettingTab {
  plugin: Office365CalendarSyncPlugin;

  constructor(app: App, plugin: Office365CalendarSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Office 365 Calendar Sync" });

    new Setting(containerEl)
      .setName("Tenant ID")
      .setDesc("Azure AD tenant ID, or `common` for multi-tenant sign-in.")
      .addText((text) =>
        text
          .setPlaceholder("common")
          .setValue(this.plugin.settings.tenantId)
          .onChange(async (value) => {
            this.plugin.settings.tenantId = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Client ID")
      .setDesc("Application (client) ID from your Azure app registration.")
      .addText((text) =>
        text
          .setPlaceholder("00000000-0000-0000-0000-000000000000")
          .setValue(this.plugin.settings.clientId)
          .onChange(async (value) => {
            this.plugin.settings.clientId = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Calendar ID")
      .setDesc("Microsoft Graph calendar ID. Use the command palette action to list calendars.")
      .addText((text) =>
        text
          .setPlaceholder("AQMk...")
          .setValue(this.plugin.settings.calendarId)
          .onChange(async (value) => {
            this.plugin.settings.calendarId = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Notes folder")
      .setDesc("Folder where event notes are created and managed.")
      .addText((text) =>
        text.setValue(this.plugin.settings.notesFolder).onChange(async (value) => {
          this.plugin.settings.notesFolder = value.trim() || DEFAULT_SETTINGS.notesFolder;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Days in the past")
      .setDesc("How far back to fetch events during sync.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.syncDaysPast)).onChange(async (value) => {
          this.plugin.settings.syncDaysPast = sanitizeNumber(value, DEFAULT_SETTINGS.syncDaysPast);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Days in the future")
      .setDesc("How far ahead to fetch events during sync.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.syncDaysFuture)).onChange(async (value) => {
          this.plugin.settings.syncDaysFuture = sanitizeNumber(value, DEFAULT_SETTINGS.syncDaysFuture);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Sync on startup")
      .setDesc("Run a sync automatically when Obsidian launches.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
          this.plugin.settings.syncOnStartup = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Auto-sync interval")
      .setDesc("Minutes between background sync runs. Set to 0 to disable.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.autoSyncIntervalMinutes))
          .onChange(async (value) => {
            this.plugin.settings.autoSyncIntervalMinutes = sanitizeNumber(value, 0);
            await this.plugin.saveSettings();
            this.plugin.restartAutoSync();
          }),
      );

    new Setting(containerEl)
      .setName("Rename notes on remote title change")
      .setDesc("Keep filenames aligned with Office 365 event titles when the remote title changes.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.renameNoteOnRemoteTitleChange).onChange(async (value) => {
          this.plugin.settings.renameNoteOnRemoteTitleChange = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Remote delete behavior")
      .setDesc("Choose what happens in Office 365 when a synced note is deleted locally.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("disabled", "Do nothing")
          .addOption("archive-and-delete", "Archive locally and delete remote event")
          .setValue(this.plugin.settings.remoteDeleteBehavior)
          .onChange(async (value: "disabled" | "archive-and-delete") => {
            this.plugin.settings.remoteDeleteBehavior = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Archive folder")
      .setDesc("Folder used to store archived snapshots before remote delete actions.")
      .addText((text) =>
        text.setValue(this.plugin.settings.archiveFolder).onChange(async (value) => {
          this.plugin.settings.archiveFolder = value.trim() || DEFAULT_SETTINGS.archiveFolder;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Authentication")
      .setDesc("Sign in with Microsoft after tenant and client ID are configured.")
      .addButton((button) =>
        button.setButtonText("Sign in").onClick(async () => {
          await this.plugin.signIn();
        }),
      )
      .addButton((button) =>
        button.setButtonText("Sign out").setWarning().onClick(async () => {
          await this.plugin.signOut();
        }),
      );

    new Setting(containerEl)
      .setName("Calendars")
      .setDesc("Discover your calendars and copy the ID you want to sync.")
      .addButton((button) =>
        button.setButtonText("List calendars").onClick(async () => {
          await this.plugin.listCalendarsNotice();
        }),
      );

    new Setting(containerEl)
      .setName("Sync state")
      .setDesc("Clear the saved delta token and force the next sync to do a full reconciliation.")
      .addButton((button) =>
        button.setButtonText("Reset delta state").setWarning().onClick(async () => {
          await this.plugin.resetSyncState();
        }),
      );

    const syncStatus = this.plugin.settings.lastSyncAt
      ? `Last synced at ${this.plugin.settings.lastSyncAt}`
      : "No sync has run yet";

    containerEl.createEl("p", {
      text: syncStatus,
      cls: "office365-sync-status",
    });
  }
}

function sanitizeNumber(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
