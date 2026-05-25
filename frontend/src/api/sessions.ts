import { api } from "./client";

export type Session = {
  id: string;
  status: "in_progress" | "completed";
  currentScenarioIndex: number;
  createdAt: string;
  completedAt: string | null;
};

export const getCurrentSession = () => api<Session | null>("/api/sessions/current");

export const createSession = () => api<Session>("/api/sessions", { method: "POST" });

export const completeSession = (id: string) =>
  api<Session>(`/api/sessions/${id}/complete`, { method: "POST" });

export const advanceScenario = (id: string) =>
  api<Session>(`/api/sessions/${id}/advance`, { method: "POST" });
