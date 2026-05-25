import { api } from "./client";

export type Session = {
  id: string;
  status: "in_progress" | "completed";
  currentScenarioIndex: number;
  calendarConfirmedAt: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type OnboardingState = {
  calendarReady: boolean;
  profileReady: boolean;
  scenariosReady: boolean;
  scenarioCount: number;
  nextStep: "calendar" | "profile" | "scenarios" | "complete";
};

export const getCurrentSession = () => api<Session | null>("/api/sessions/current");

export const createSession = () => api<Session>("/api/sessions", { method: "POST" });

export const completeSession = (id: string) =>
  api<Session>(`/api/sessions/${id}/complete`, { method: "POST" });

export const advanceScenario = (id: string) =>
  api<Session>(`/api/sessions/${id}/advance`, { method: "POST" });

export const confirmCalendar = (id: string) =>
  api<Session>(`/api/sessions/${id}/confirm-calendar`, { method: "POST" });

export const getOnboardingState = (id: string) =>
  api<OnboardingState>(`/api/sessions/${id}/onboarding`);
