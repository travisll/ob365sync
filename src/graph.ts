import { Notice, requestUrl } from "obsidian";
import { PublicClientApplication } from "@azure/msal-node";
import type {
  GraphCalendar,
  GraphDeltaResponse,
  GraphEvent,
  Office365CalendarSyncSettings,
} from "./types";

const GRAPH_SCOPE = ["https://graph.microsoft.com/Calendars.ReadWrite"];

export class GraphClient {
  private readonly settings: Office365CalendarSyncSettings;
  private readonly onSettingsChange: (updates: Partial<Office365CalendarSyncSettings>) => Promise<void>;

  constructor(
    settings: Office365CalendarSyncSettings,
    onSettingsChange: (updates: Partial<Office365CalendarSyncSettings>) => Promise<void>,
  ) {
    this.settings = settings;
    this.onSettingsChange = onSettingsChange;
  }

  async signInInteractively(): Promise<void> {
    const app = this.createMsalApp();

    const result = await app.acquireTokenByDeviceCode({
      scopes: GRAPH_SCOPE,
      deviceCodeCallback: (response) => {
        new Notice(response.message, 0);
      },
    });

    if (!result?.account) {
      throw new Error("Microsoft authentication did not return an account.");
    }

    const tokenCache = app.getTokenCache();
    await this.onSettingsChange({
      tokenCache: tokenCache.serialize(),
      accountHomeId: result.account.homeAccountId,
    });
  }

  async signOut(): Promise<void> {
    await this.onSettingsChange({
      tokenCache: "",
      accountHomeId: null,
    });
  }

  async listCalendars(): Promise<GraphCalendar[]> {
    const response = await this.request<{ value: GraphCalendar[] }>("/me/calendars");
    return response.value;
  }

  async listEvents(startIso: string, endIso: string): Promise<GraphEvent[]> {
    const url = `/me/calendars/${encodeURIComponent(this.settings.calendarId)}/calendarView` +
      `?startDateTime=${encodeURIComponent(startIso)}` +
      `&endDateTime=${encodeURIComponent(endIso)}` +
      `&$top=200`;
    const response = await this.request<{ value: GraphEvent[] }>(url, {
      Prefer: 'outlook.body-content-type="text"',
    });
    return response.value;
  }

  async deltaEvents(
    startIso: string,
    endIso: string,
    deltaLink?: string | null,
  ): Promise<{ events: GraphEvent[]; deltaLink: string | null }> {
    const events: GraphEvent[] = [];
    let nextUrl =
      deltaLink ??
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.settings.calendarId)}` +
        `/calendarView/delta?startDateTime=${encodeURIComponent(startIso)}` +
        `&endDateTime=${encodeURIComponent(endIso)}` +
        "&$top=200";
    let resolvedDeltaLink: string | null = null;

    while (nextUrl) {
      const response = await this.requestAbsolute<GraphDeltaResponse<GraphEvent>>(nextUrl, {
        Prefer: 'outlook.body-content-type="text", odata.maxpagesize=200',
      });
      events.push(...response.value);
      resolvedDeltaLink = response["@odata.deltaLink"] ?? resolvedDeltaLink;
      nextUrl = response["@odata.nextLink"] ?? "";
    }

    return {
      events,
      deltaLink: resolvedDeltaLink,
    };
  }

  async createEvent(payload: Record<string, unknown>): Promise<GraphEvent> {
    return this.request<GraphEvent>(`/me/calendars/${encodeURIComponent(this.settings.calendarId)}/events`, {}, "POST", payload);
  }

  async getEvent(eventId: string): Promise<GraphEvent> {
    return this.request<GraphEvent>(
      `/me/calendars/${encodeURIComponent(this.settings.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        Prefer: 'outlook.body-content-type="text"',
      },
    );
  }

  async updateEvent(eventId: string, payload: Record<string, unknown>): Promise<GraphEvent> {
    return this.request<GraphEvent>(
      `/me/calendars/${encodeURIComponent(this.settings.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {},
      "PATCH",
      payload,
    );
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.request(
      `/me/calendars/${encodeURIComponent(this.settings.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {},
      "DELETE",
    );
  }

  private createMsalApp(): PublicClientApplication {
    const tenantId = this.settings.tenantId || "common";
    const app = new PublicClientApplication({
      auth: {
        clientId: this.settings.clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    });

    if (this.settings.tokenCache) {
      void app.getTokenCache().deserialize(this.settings.tokenCache);
    }

    return app;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.settings.clientId) {
      throw new Error("Client ID is required before connecting to Microsoft Graph.");
    }

    const app = this.createMsalApp();
    const accounts = await app.getTokenCache().getAllAccounts();
    const account =
      accounts.find((candidate) => candidate.homeAccountId === this.settings.accountHomeId) ??
      accounts[0];

    if (!account) {
      throw new Error("Not signed in. Use the plugin settings to authenticate with Microsoft.");
    }

    const result = await app.acquireTokenSilent({
      account,
      scopes: GRAPH_SCOPE,
    });

    if (!result?.accessToken) {
      throw new Error("Could not acquire a Microsoft Graph access token.");
    }

    await this.onSettingsChange({
      tokenCache: app.getTokenCache().serialize(),
      accountHomeId: result.account?.homeAccountId ?? this.settings.accountHomeId,
    });

    return result.accessToken;
  }

  private async request<T>(
    path: string,
    extraHeaders: Record<string, string> = {},
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    return this.requestAbsolute(`https://graph.microsoft.com/v1.0${path}`, extraHeaders, method, body);
  }

  private async requestAbsolute<T>(
    url: string,
    extraHeaders: Record<string, string> = {},
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const accessToken = await this.getAccessToken();

    const response = await requestUrl({
      url,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status >= 400) {
      throw new Error(`Graph request failed (${response.status}): ${response.text}`);
    }

    return response.json as T;
  }
}
