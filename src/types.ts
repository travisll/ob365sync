export interface Office365CalendarSyncSettings {
  tenantId: string;
  clientId: string;
  calendarId: string;
  notesFolder: string;
  syncDaysPast: number;
  syncDaysFuture: number;
  syncOnStartup: boolean;
  autoSyncIntervalMinutes: number;
  renameNoteOnRemoteTitleChange: boolean;
  remoteDeleteBehavior: "disabled" | "archive-and-delete";
  archiveFolder: string;
  lastSyncAt: string | null;
  tokenCache: string;
  accountHomeId: string | null;
  deltaLink: string | null;
  deltaWindowStart: string | null;
  deltaWindowEnd: string | null;
  syncedNoteIndex: Record<string, string>;
}

export interface GraphDateTime {
  dateTime: string;
  timeZone?: string;
}

export interface GraphAttendee {
  emailAddress?: {
    address?: string;
    name?: string;
  };
}

export interface GraphEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
  start: GraphDateTime;
  end: GraphDateTime;
  location?: {
    displayName?: string;
  };
  attendees?: GraphAttendee[];
  lastModifiedDateTime?: string;
  changeKey?: string;
  webLink?: string;
  isCancelled?: boolean;
  type?: "singleInstance" | "occurrence" | "exception" | "seriesMaster";
  seriesMasterId?: string;
  originalStart?: string;
  iCalUId?: string;
  isAllDay?: boolean;
  recurrence?: GraphRecurrence;
  "@removed"?: {
    reason?: string;
  };
}

export interface GraphCalendar {
  id: string;
  name: string;
}

export interface GraphRecurrence {
  pattern?: {
    type?: string;
    interval?: number;
    month?: number;
    dayOfMonth?: number;
    firstDayOfWeek?: string;
    index?: string;
    daysOfWeek?: string[];
  };
  range?: {
    type?: string;
    startDate?: string;
    endDate?: string;
    recurrenceTimeZone?: string;
    numberOfOccurrences?: number;
  };
}

export interface GraphDeltaResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

export interface EventNoteFrontmatter {
  office365EventId?: string;
  office365CalendarId?: string;
  office365ChangeKey?: string;
  office365LastSyncedAt?: string;
  office365RemoteUpdatedAt?: string;
  office365SyncState?: "synced" | "cancelled" | "local-only" | "conflict";
  office365EventType?: string;
  office365SeriesMasterId?: string;
  office365OriginalStart?: string;
  office365ICalUId?: string;
  office365Recurrence?: string;
  office365IsAllDay?: boolean;
  office365StartTimeZone?: string;
  office365EndTimeZone?: string;
  office365ArchivedFromPath?: string;
  office365DeletedRemotelyAt?: string;
  start?: string;
  end?: string;
  location?: string;
  attendees?: string[];
  webLink?: string;
}

export interface LocalEventNote {
  path: string;
  title: string;
  body: string;
  frontmatter: EventNoteFrontmatter;
  stat: {
    mtime: number;
  };
}
