import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getScenarios, type Scenario, type ScenarioOption, type ContextEvent } from "../../api/scenarios";

type Props = {
  sessionId: string;
  currentIndex: number;
  userReason: string;
  onReasonChange: (v: string) => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  submitLabel: string;
  belowSlot?: React.ReactNode;
};

const fmtTimeRange = (startIso: string, endIso: string): string => {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (sameDay) {
    return `${s.toLocaleDateString(undefined, dateOpts)} · ${s.toLocaleTimeString([], timeOpts)} → ${e.toLocaleTimeString([], timeOpts)}`;
  }
  return `${s.toLocaleDateString(undefined, dateOpts)} ${s.toLocaleTimeString([], timeOpts)} → ${e.toLocaleDateString(undefined, dateOpts)} ${e.toLocaleTimeString([], timeOpts)}`;
};

export const ScenarioPane = ({
  sessionId,
  currentIndex,
  userReason,
  onReasonChange,
  onSubmit,
  submitDisabled,
  submitLabel,
  belowSlot,
}: Props) => {
  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ["scenarios", sessionId],
    queryFn: () => getScenarios(sessionId),
  });

  if (isLoading) return <div className="muted">Loading scenarios…</div>;

  const scenario = scenarios[currentIndex];

  if (!scenario) {
    return (
      <div className="scenario-pane empty">
        <h3>All scenarios complete</h3>
        <p className="muted">Head to the Done page to download your log.</p>
        <Link to="/done" className="btn-primary">
          Go to results →
        </Link>
      </div>
    );
  }

  const context: ContextEvent[] = scenario.contextEvents ?? [];

  return (
    <div className="scenario-pane">
      <div className="scenario-progress">
        <div className="progress-dots" aria-hidden="true">
          {scenarios.map((_, i) => {
            const state = i < currentIndex ? "past" : i === currentIndex ? "current" : "upcoming";
            return <span key={i} className={`progress-dot ${state}`} />;
          })}
        </div>
        <span className="progress-label muted">
          Scenario {currentIndex + 1} / {scenarios.length}
        </span>
      </div>
      <h3>{scenario.title}</h3>
      <p className="scenario-description">{scenario.description}</p>
      {scenario.promptSummary ? (
        <div className="scenario-prompt-summary">
          <strong>What you're deciding:</strong> {scenario.promptSummary}
        </div>
      ) : null}

      {context.length > 0 ? (
        <div className="scenario-context-list">
          <div className="scenario-context-header">What's on your calendar for this scenario</div>
          <ul>
            {context.map((c, i) => (
              <li key={i}>
                <span className="ctx-title">{c.title}</span>
                <span className="muted">{fmtTimeRange(c.start, c.end)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="scenario-instruction">
        Edit the calendar to reflect how you'd respond: <strong>move</strong>, <strong>delete</strong>, or{" "}
        <strong>add</strong> events. New events you create are linked to this scenario automatically. Then write
        why below.
      </div>

      <label className="scenario-reason">
        <span>Your reasoning</span>
        <textarea
          value={userReason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Briefly explain the choices you made."
          rows={8}
        />
      </label>

      {belowSlot}

      <div className="scenario-actions">
        <button onClick={onSubmit} disabled={submitDisabled}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

export type { Scenario, ScenarioOption };
