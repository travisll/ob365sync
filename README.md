# Office 365 Calendar Sync for Obsidian

Desktop-first Obsidian plugin that syncs Office 365 calendar events to markdown notes and pushes note edits back to Microsoft 365 through Microsoft Graph.

## What this build does

- Sign in with Microsoft using device code flow
- Run incremental sync with Microsoft Graph calendar view delta queries
- Pull events from a chosen Office 365 calendar into a folder in your vault
- Create Office 365 events from new notes
- Push note edits back to the matching Office 365 event
- Rename notes when remote event titles change
- Preserve recurring-event metadata, including series masters, occurrences, and exceptions
- Edit recurrence from Obsidian with a form-based command instead of raw JSON editing
- Open a dedicated Office 365 sidebar with inline editing for title, time, location, attendees, recurrence, and sync/delete controls
- Optionally archive and delete remote events when synced notes are deleted locally
- Store sync metadata in frontmatter so future syncs can reconcile changes
- Build a release bundle under `dist/` for manual installation

## Current behavior

- Desktop only
- Single calendar selected in settings
- Sync window is configurable in days before/after today
- Delta sync is reused only while the calculated window is unchanged
- Remote deletions and cancellations mark notes as cancelled
- Local deletions can optionally archive a snapshot note and delete the Office 365 event
- Local note deletion does not delete remote events automatically
- Conflicts use latest-write-wins based on local file mtime vs remote modification time

## Microsoft app registration

1. Go to Azure Portal > App registrations.
2. Create a new registration for a public client / native application.
3. Under Authentication, enable `Allow public client flows`.
4. Under API permissions, add delegated Microsoft Graph permission `Calendars.ReadWrite`.
5. Copy the Application (client) ID and Tenant ID into the plugin settings.

## Vault note format

Each synced event note stores metadata in frontmatter like:

```yaml
office365EventId: AAMk...
office365CalendarId: AQMk...
office365ChangeKey: DwAA...
office365LastSyncedAt: 2026-04-23T20:10:00.000Z
office365RemoteUpdatedAt: 2026-04-23T20:09:00.000Z
office365SyncState: synced
office365EventType: occurrence
office365SeriesMasterId: AAMkMaster...
office365OriginalStart: 2026-04-24T15:00:00.000Z
office365Recurrence: '{"pattern":{"type":"weekly","interval":1,"daysOfWeek":["thursday"]},"range":{"type":"endDate","startDate":"2026-04-24","endDate":"2026-07-31"}}'
office365IsAllDay: false
office365StartTimeZone: UTC
office365EndTimeZone: UTC
start: 2026-04-24T15:00:00.000Z
end: 2026-04-24T16:00:00.000Z
location: Conference Room
attendees:
  - alice@example.com
  - bob@example.com
---
```

The note body is used as the event description.

## Commands

- `Office 365: Sync Office 365 calendar now`
- `Office 365: List Office 365 calendars`
- `Office 365: Open Office 365 sidebar`
- `Office 365: Edit Office 365 recurrence for current note`
- `Office 365: Reset Office 365 sync state`

The plugin also adds:

- A left-ribbon `calendar` button to open the Office 365 sidebar
- Note-aware file menu actions for opening the sidebar, editing recurrence, and opening the Outlook event link

Inside the sidebar you can now:

- Edit note-backed event title, start/end time, time zones, all-day state, location, and attendees
- Save details without leaving the current note
- Save and sync immediately
- Archive the current note and delete the linked Office 365 event from one control surface

## Testing

```bash
npm test
```

## Development

```bash
npm install
npm run build
npm run release
```

`npm run release` creates:

- `dist/office365-calendar-sync-0.2.0/`
- `dist/office365-calendar-sync-0.2.0.zip`

For manual installation, copy `manifest.json`, `main.js`, and optionally `styles.css` into:

```text
<vault>/.obsidian/plugins/office365-calendar-sync/
```
