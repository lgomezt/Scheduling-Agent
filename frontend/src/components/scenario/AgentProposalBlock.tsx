import type { AgentOp, AgentProposal } from "../../api/agent";

type Props = {
  proposal: AgentProposal | null;
  loading: boolean;
  decision: "accept" | "critique" | null;
  feedback: string;
  onDecision: (d: "accept" | "critique") => void;
  onFeedbackChange: (v: string) => void;
  onEditAnswer: () => void;
  onTryAgain: () => void;
};

const fmtRange = (startIso: string, endIso: string): string => {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (sameDay) {
    return `${s.toLocaleDateString(undefined, dateOpts)} · ${s.toLocaleTimeString([], timeOpts)} → ${e.toLocaleTimeString([], timeOpts)}`;
  }
  return `${s.toLocaleDateString(undefined, dateOpts)} ${s.toLocaleTimeString([], timeOpts)} → ${e.toLocaleDateString(undefined, dateOpts)} ${e.toLocaleTimeString([], timeOpts)}`;
};

const titleForContext = (proposal: AgentProposal, contextIndex: number): string =>
  proposal.contextEvents.find((c) => c.context_index === contextIndex)?.title ?? `Context #${contextIndex}`;

const OpCard = ({ op, proposal }: { op: AgentOp; proposal: AgentProposal }) => {
  switch (op.op) {
    case "move": {
      const original = proposal.contextEvents.find((c) => c.context_index === op.context_index);
      const label = op.new_title ?? original?.title ?? "(event)";
      return (
        <div className="agent-op agent-op-move">
          <div className="agent-op-line">
            <span className="agent-op-icon">↔</span>
            <span>
              Move <strong>{original?.title ?? label}</strong> to <em>{fmtRange(op.new_start, op.new_end)}</em>
            </span>
          </div>
          {op.reason ? <div className="agent-op-reason">{op.reason}</div> : null}
        </div>
      );
    }
    case "create":
      return (
        <div className="agent-op agent-op-create">
          <div className="agent-op-line">
            <span className="agent-op-icon">＋</span>
            <span>
              Create <strong>{op.title}</strong> <em>{fmtRange(op.start, op.end)}</em>
            </span>
          </div>
          {op.reason ? <div className="agent-op-reason">{op.reason}</div> : null}
        </div>
      );
    case "delete":
      return (
        <div className="agent-op agent-op-delete">
          <div className="agent-op-line">
            <span className="agent-op-icon">✕</span>
            <span>
              Drop <strong>{titleForContext(proposal, op.context_index)}</strong>
            </span>
          </div>
          {op.reason ? <div className="agent-op-reason">{op.reason}</div> : null}
        </div>
      );
    case "no_change":
      return (
        <div className="agent-op agent-op-nochange">
          <div className="agent-op-line">
            <span className="agent-op-icon">＝</span>
            <span>Keep things as they are</span>
          </div>
          {op.reason ? <div className="agent-op-reason">{op.reason}</div> : null}
        </div>
      );
  }
};

export const AgentProposalBlock = ({
  proposal,
  loading,
  decision,
  feedback,
  onDecision,
  onFeedbackChange,
  onEditAnswer,
  onTryAgain,
}: Props) => {
  if (loading) {
    return <div className="agent-block loading">Gemini is reading your profile…</div>;
  }
  if (!proposal) return null;

  return (
    <div className="agent-block">
      <div className="agent-block-header">Agent proposal</div>
      <p className="agent-block-reason">{proposal.summary}</p>

      <div className="agent-op-list">
        {proposal.operations.map((op, i) => (
          <OpCard key={i} op={op} proposal={proposal} />
        ))}
      </div>

      <div className="agent-revise-row">
        <button className="btn-secondary" onClick={onEditAnswer}>
          ← Edit my answer
        </button>
        <button className="btn-secondary" onClick={onTryAgain}>
          ↻ Try Gemini again
        </button>
      </div>

      <div className="agent-decision-row">
        <button
          className={decision === "accept" ? "btn-accept active" : "btn-accept"}
          onClick={() => onDecision("accept")}
        >
          Accept
        </button>
        <button
          className={decision === "critique" ? "btn-critique active" : "btn-critique"}
          onClick={() => onDecision("critique")}
        >
          Critique
        </button>
      </div>

      <label className="agent-feedback">
        <span>Feedback (optional)</span>
        <textarea
          rows={3}
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          placeholder={
            decision === "critique"
              ? "What would you change about the agent's choice?"
              : "Anything to add about the agent's choice?"
          }
        />
      </label>
    </div>
  );
};
