import { calendarClient, hasCalendarScope } from "../auth/google.js";
import { db } from "../db/client.js";

type TokenRow = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string | null;
  sync_events: number;
  sync_titles: number;
};

export type SyncedEvent = {
  externalId: string;
  title: string;
  startIso: string;
  endIso: string;
};

const getTokens = (userId: number): TokenRow | undefined =>
  db
    .prepare(
      "SELECT access_token, refresh_token, expires_at, scopes, sync_events, sync_titles FROM google_tokens WHERE user_id = ?",
    )
    .get(userId) as TokenRow | undefined;

export const listGoogleEvents = async (
  userId: number,
  weekStartIso: string,
  weekEndIso: string,
): Promise<SyncedEvent[]> => {
  const tokens = getTokens(userId);
  if (!tokens || !hasCalendarScope(tokens.scopes)) return [];
  if (!tokens.sync_events) return [];

  const calendar = calendarClient(tokens.access_token, tokens.refresh_token);
  const auth = calendar.context._options.auth as {
    on: (event: string, cb: (creds: { access_token?: string; expiry_date?: number }) => void) => void;
  };
  auth.on("tokens", (creds) => {
    if (creds.access_token) {
      db.prepare(
        "UPDATE google_tokens SET access_token = ?, expires_at = ? WHERE user_id = ?",
      ).run(
        creds.access_token,
        creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
        userId,
      );
    }
  });

  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: weekStartIso,
    timeMax: weekEndIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const anonymize = !tokens.sync_titles;
  return (data.items ?? [])
    .filter((e) => (e.start?.dateTime || e.start?.date) && (e.end?.dateTime || e.end?.date))
    .map((e) => ({
      externalId: e.id ?? "",
      title: anonymize ? "Busy" : (e.summary ?? "(untitled)"),
      startIso: (e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`) as string,
      endIso: (e.end?.dateTime ?? `${e.end?.date}T00:00:00Z`) as string,
    }));
};
