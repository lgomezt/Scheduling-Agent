import { api } from "./client";
import type { CalendarEvent } from "./calendar";

export type AgentOp =
  | {
      op: "move";
      context_index: number;
      new_title?: string;
      new_start: string;
      new_end: string;
      reason: string;
    }
  | { op: "create"; title: string; start: string; end: string; reason: string }
  | { op: "delete"; context_index: number; reason: string }
  | { op: "no_change"; reason: string };

export type AgentProposal = {
  summary: string;
  operations: AgentOp[];
  agentEvents: CalendarEvent[];
  contextEvents: { context_index: number; title: string; start: string; end: string }[];
};

export const proposeAgent = (scenarioId: number, userReason?: string) =>
  api<AgentProposal>(`/api/agent/propose/${scenarioId}`, {
    method: "POST",
    body: JSON.stringify({ userReason: userReason ?? "" }),
  });

export type AnswerInput = {
  userReason: string;
  agentSummary: string;
  agentActions: AgentOp[];
  decision: "accept" | "critique";
  feedback?: string;
};

export const submitAnswer = (scenarioId: number, input: AnswerInput) =>
  api<{ ok: true; userActions: unknown[] }>(`/api/agent/answer/${scenarioId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
