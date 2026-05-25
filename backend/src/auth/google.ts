import { google } from "googleapis";
import { config } from "../config.js";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const LOGIN_SCOPES = ["openid", "email", "profile"];

export const oauthClient = () =>
  new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);

export const authUrl = (state: string, scopes: string[], options?: { incremental?: boolean }): string =>
  oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: options?.incremental ? "consent" : "consent",
    scope: scopes,
    state,
    include_granted_scopes: options?.incremental ?? true,
  });

export const exchangeCode = async (code: string) => {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  let profile: { sub: string; email: string; name: string } | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    if (data.id && data.email) {
      profile = { sub: data.id, email: data.email, name: data.name ?? data.email };
    }
  } catch {
    // user-info call can fail if the token has no userinfo-related scopes; that's fine
  }
  return { profile, tokens };
};

export const calendarClient = (accessToken: string, refreshToken?: string | null) => {
  const client = oauthClient();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken ?? undefined });
  return google.calendar({ version: "v3", auth: client });
};

export const hasCalendarScope = (scopes: string | null | undefined): boolean =>
  !!scopes && scopes.split(/\s+/).includes(CALENDAR_SCOPE);
