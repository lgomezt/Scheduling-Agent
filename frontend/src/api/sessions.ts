import { api } from "./client";

export type Session = {
  id: string;
  status: "in_progress" | "completed";
  currentScenarioIndex: number;
  participantCode: string | null;
  studyVersion: string | null;
  createdAt: string;
  completedAt: string | null;
};

export const getCurrentSession = () => api<Session | null>("/api/sessions/current");

export const getLatestSession = () => api<Session | null>("/api/sessions/latest");

export const createSession = () => api<Session>("/api/sessions", { method: "POST" });

export const deleteSession = (id: string) =>
  api<{ ok: true }>(`/api/sessions/${id}`, { method: "DELETE" });

export const completeSession = (id: string) =>
  api<Session>(`/api/sessions/${id}/complete`, { method: "POST" });
