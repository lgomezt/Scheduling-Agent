import { Link } from "react-router-dom";
import type { ReactNode } from "react";

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
  return (
    <div className="step-shell">
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
      <div className="step-header">
        <h2>{title}</h2>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      <div className="step-body">{children}</div>
      {footer ? <div className="step-footer">{footer}</div> : null}
    </div>
  );
};
