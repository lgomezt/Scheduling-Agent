import { api } from "./client";

export type CalendarStatus = {
  connected: boolean;
  syncEvents: boolean;
  syncTitles: boolean;
};

export const getCalendarStatus = () =>
  api<CalendarStatus>("/api/auth/google/calendar/status");

export const putCalendarPrefs = (syncEvents: boolean, syncTitles: boolean) =>
  api<{ ok: true; syncEvents: boolean; syncTitles: boolean }>(
    "/api/auth/google/calendar/prefs",
    { method: "PUT", body: JSON.stringify({ syncEvents, syncTitles }) },
  );
