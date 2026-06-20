import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentSession, completeSession } from "../api/sessions";
import { CalendarPane } from "../components/calendar/CalendarPane";
import { ScenarioPane } from "../components/scenario/ScenarioPane";
import { AgentProposalBlock } from "../components/scenario/AgentProposalBlock";
import { mondayWeek } from "../lib/week";
import { getScenarios, activateScenario } from "../api/scenarios";
import { proposeAgent, submitAnswer, type AgentProposal } from "../api/agent";

type Phase = "placing" | "proposing" | "deciding";

export const Workspace = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: session, isLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });
  const sessionId = session?.id ?? "";

  const { data: scenarios = [] } = useQuery({
    queryKey: ["scenarios", sessionId],
    queryFn: () => getScenarios(sessionId),
    enabled: !!sessionId,
  });

  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userReason, setUserReason] = useState("");
  const [phase, setPhase] = useState<Phase>("placing");
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [decision, setDecision] = useState<"accept" | "critique" | null>(null);
  const [feedback, setFeedback] = useState("");

  const activate = useMutation({
    mutationFn: activateScenario,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", sessionId] });
    },
  });

  const currentScenario = scenarios[currentIndex];
  const activatedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentScenario) return;
    if (activatedRef.current === String(currentScenario.id)) return;
    activatedRef.current = String(currentScenario.id);
    activate.mutate(currentScenario.id);
  }, [currentScenario, activate]);

  const propose = useMutation({
    mutationFn: (vars: { scenarioId: number | string; userReason: string }) =>
      proposeAgent(vars.scenarioId, vars.userReason),
    onSuccess: (p) => {
      setProposal(p);
      setPhase("deciding");
      qc.invalidateQueries({ queryKey: ["events", sessionId] });
      // Jump the calendar to the week of the agent's first proposed event so
      // the user actually sees what was just placed.
      const firstAgentTime =
        p.operations.find((o) => o.op === "create")?.start ??
        p.operations.find((o) => o.op === "move")?.new_start;
      if (firstAgentTime) {
        const d = new Date(firstAgentTime);
        if (!Number.isNaN(d.getTime())) setWeekAnchor(d);
      }
    },
    onError: () => setPhase("placing"),
  });

  const answer = useMutation({
    mutationFn: (vars: Parameters<typeof submitAnswer>) => submitAnswer(...vars),
    onSuccess: async () => {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= scenarios.length) {
        await completeSession(sessionId);
        qc.invalidateQueries({ queryKey: ["session", "current"] });
        navigate("/done");
        return;
      }
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      setCurrentIndex(nextIndex);
      setUserReason("");
      setProposal(null);
      setDecision(null);
      setFeedback("");
      setPhase("placing");
    },
  });

  if (isLoading)
    return (
      <div className="screen-center">
        <div className="skeleton-stack" aria-label="Loading workspace">
          <div className="skeleton-line w-220" />
          <div className="skeleton-line w-360" />
          <div className="skeleton-line w-180" />
        </div>
      </div>
    );
  if (!session) return <Navigate to="/upload" replace />;
  if (session.status === "completed") return <Navigate to="/done" replace />;

  const { start } = mondayWeek(weekAnchor);
  const scenario = currentScenario;

  const submitForProposal = () => {
    if (!scenario) return;
    setPhase("proposing");
    propose.mutate({ scenarioId: scenario.id, userReason: userReason.trim() });
  };

  const goBackToPlacing = () => {
    setPhase("placing");
    setProposal(null);
    setDecision(null);
    setFeedback("");
  };

  const finalize = () => {
    if (!scenario || !proposal || !decision) return;
    answer.mutate([
      scenario.id,
      {
        userReason: userReason.trim(),
        agentSummary: proposal.summary,
        agentActions: proposal.operations,
        decision,
        feedback: feedback.trim() || undefined,
      },
    ]);
  };

  const submitDisabled =
    phase === "placing"
      ? userReason.trim().length === 0
      : phase === "proposing"
        ? true
        : !decision;

  const submitLabel =
    phase === "placing"
      ? "Ask the agent →"
      : phase === "proposing"
        ? "Thinking…"
        : currentIndex + 1 >= scenarios.length
          ? "Save & finish"
          : "Save & next →";

  return (
    <div className="workspace">
      <aside className="workspace-side">
        <ScenarioPane
          sessionId={session.id}
          currentIndex={currentIndex}
          userReason={userReason}
          onReasonChange={setUserReason}
          onSubmit={phase === "placing" ? submitForProposal : finalize}
          submitDisabled={submitDisabled}
          submitLabel={submitLabel}
          belowSlot={
            phase !== "placing" ? (
              <AgentProposalBlock
                proposal={proposal}
                loading={phase === "proposing"}
                decision={decision}
                feedback={feedback}
                onDecision={setDecision}
                onFeedbackChange={setFeedback}
                onEditAnswer={goBackToPlacing}
                onTryAgain={submitForProposal}
              />
            ) : null
          }
        />
      </aside>
      <div className="workspace-calendar">
        <CalendarPane
          sessionId={session.id}
          weekStart={start}
          onWeekChange={setWeekAnchor}
          hideConnectButton
        />
      </div>
    </div>
  );
};
