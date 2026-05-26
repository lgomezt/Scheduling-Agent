import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSession, deleteSession, getCurrentSession } from "../../api/sessions";

const STEPS = [
  { key: "calendar", label: "Calendar", path: "/onboarding/calendar" },
  { key: "profile", label: "Profile", path: "/onboarding/profile" },
  { key: "scenarios", label: "Scenarios", path: "/onboarding/scenarios" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type Props = {
  step: StepKey;
  title: string;
  subtitle?: string;
  done?: Partial<Record<StepKey, boolean>>;
  children: ReactNode;
  footer?: ReactNode;
};

export const StepShell = ({ step, title, subtitle, done = {}, children, footer }: Props) => {
  const currentIndex = STEPS.findIndex((s) => s.key === step);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: session } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });

  const restart = useMutation({
    mutationFn: async () => {
      if (session?.id) await deleteSession(session.id);
      return createSession();
    },
    onSuccess: (fresh) => {
      qc.setQueryData(["session", "current"], fresh);
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      navigate("/onboarding/calendar");
    },
  });

  const handleRestart = () => {
    const ok = window.confirm(
      "Restart from scratch? Your current calendar setup, profile, scenarios, and any answers will be deleted.",
    );
    if (!ok) return;
    restart.mutate();
  };

  return (
    <div className="step-shell">
      <div className="step-shell-toolbar">
        <ol className="step-breadcrumb">
          {STEPS.map((s, i) => {
            const isPast = i < currentIndex;
            const isCurrent = i === currentIndex;
            const ok = done[s.key];
            const cls = isCurrent
              ? "step-pill current"
              : ok
                ? "step-pill done"
                : isPast
                  ? "step-pill"
                  : "step-pill upcoming";
            return (
              <li key={s.key}>
                <Link to={s.path} className={cls}>
                  <span className="step-num">{i + 1}</span>
                  <span>{s.label}</span>
                  {ok ? <span className="step-check">✓</span> : null}
                </Link>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="btn-secondary step-restart"
          onClick={handleRestart}
          disabled={restart.isPending}
          title="Wipe this session and start a fresh blank one"
        >
          {restart.isPending ? "Restarting…" : "Start fresh ↺"}
        </button>
      </div>
      <div className="step-header">
        <h2>{title}</h2>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      <div className="step-body">{children}</div>
      {footer ? <div className="step-footer">{footer}</div> : null}
    </div>
  );
};
