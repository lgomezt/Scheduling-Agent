import { api } from "./client";

export type EventSource =
  | "google"
  | "outlook"
  | "manual"
  | "scenario_context"
  | "scenario_user"
  | "scenario_agent";

export type CalendarEvent = {
  id: number;
  source: EventSource;
  externalId: string | null;
  title: string;
  start: string;
  end: string;
  scenarioId: number | null;
  metadata: Record<string, unknown> | null;
};

export const getEvents = (sessionId: string, weekStart: Date, weekEnd: Date) =>
  api<CalendarEvent[]>(
    `/api/events/${sessionId}?weekStart=${encodeURIComponent(
      weekStart.toISOString(),
    )}&weekEnd=${encodeURIComponent(weekEnd.toISOString())}`,
  );

export const createEvent = (sessionId: string, title: string, start: Date, end: Date) =>
  api<CalendarEvent>(`/api/events/${sessionId}`, {
    method: "POST",
    body: JSON.stringify({ title, start: start.toISOString(), end: end.toISOString() }),
  });

export const deleteEvent = (sessionId: string, eventId: number) =>
  api<void>(`/api/events/${sessionId}/${eventId}`, { method: "DELETE" });

export const updateEventTime = (sessionId: string, eventId: number, start: Date, end: Date) =>
  api<CalendarEvent>(`/api/events/${sessionId}/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ start: start.toISOString(), end: end.toISOString() }),
  });

export const updateEventTitle = (sessionId: string, eventId: number, title: string) =>
  api<CalendarEvent>(`/api/events/${sessionId}/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const purgeGoogleEvents = (sessionId: string) =>
  api<{ ok: true; deleted: number }>(`/api/events/${sessionId}/source/google`, {
    method: "DELETE",
  });
