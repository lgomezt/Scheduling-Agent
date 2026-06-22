import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getCurrentSession } from "../../api/sessions";
import { getReflection, submitReflection } from "../../api/study";

type DiffPart = {
  kind: "same" | "added" | "deleted";
  text: string;
};

type Section = {
  heading: string;
  body: string;
};

const parseSections = (markdown: string): Section[] => {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^#\s+/, "").trim(), body: "" };
      continue;
    }
    if (!current) current = { heading: "Profile", body: "" };
    current.body += `${line}\n`;
  }
  if (current) sections.push({ ...current, body: current.body.trimEnd() });
  return sections;
};

const diffLines = (before: string, after: string): { before: DiffPart[]; after: DiffPart[] } => {
  const oldLines = before ? before.split(/\r?\n/) : [];
  const newLines = after ? after.split(/\r?\n/) : [];
  const dp = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const beforeParts: DiffPart[] = [];
  const afterParts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      beforeParts.push({ kind: "same", text: oldLines[i] });
      afterParts.push({ kind: "same", text: newLines[j] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      beforeParts.push({ kind: "deleted", text: oldLines[i] });
      i += 1;
    } else {
      afterParts.push({ kind: "added", text: newLines[j] });
      j += 1;
    }
  }
  while (i < oldLines.length) {
    beforeParts.push({ kind: "deleted", text: oldLines[i] });
    i += 1;
  }
  while (j < newLines.length) {
    afterParts.push({ kind: "added", text: newLines[j] });
    j += 1;
  }

  return { before: beforeParts, after: afterParts };
};

const renderDiff = (parts: DiffPart[]) => (
  <pre className="profile-diff-pre">
    {parts.map((part, index) => (
      <Fragment key={`${part.kind}-${index}`}>
        {part.kind === "same" ? (
          <span>{part.text || " "}</span>
        ) : (
          <mark className={`diff-${part.kind}`}>{part.text || " "}</mark>
        )}
        {index < parts.length - 1 ? "\n" : null}
      </Fragment>
    ))}
  </pre>
);

export const ReflectionPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });
  const sessionId = session?.id ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["reflection", sessionId],
    queryFn: () => getReflection(sessionId),
    enabled: !!sessionId,
    retry: false,
  });
  const [accuracyScore, setAccuracyScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!data?.reflection) return;
    setAccuracyScore(data.reflection.accuracyScore);
    setComment(data.reflection.comment);
  }, [data?.reflection]);

  const sections = useMemo(() => {
    if (!data) return [];
    const initial = parseSections(data.initialProfile);
    const final = parseSections(data.finalProfile);
    const finalByHeading = new Map(final.map((section) => [section.heading, section]));
    const initialByHeading = new Map(initial.map((section) => [section.heading, section]));
    const headings = [
      ...initial.map((section) => section.heading),
      ...final.map((section) => section.heading).filter((heading) => !initialByHeading.has(heading)),
    ];
    return headings.map((heading) => {
      const initialSection = initialByHeading.get(heading);
      const finalSection = finalByHeading.get(heading);
      const diff = diffLines(initialSection?.body ?? "", finalSection?.body ?? "");
      return {
        heading,
        before: diff.before,
        after: diff.after,
      };
    });
  }, [data]);

  const submit = useMutation({
    mutationFn: () => {
      if (accuracyScore == null) throw new Error("Select a profile accuracy score");
      return submitReflection(sessionId, { accuracyScore, comment: comment.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      qc.invalidateQueries({ queryKey: ["session", "latest"] });
      navigate("/complete");
    },
  });

  if (sessionLoading) {
    return (
      <div className="study-screen">
        <div className="study-card compact-status">Loading reflection...</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/complete" replace />;

  if (isLoading) {
    return (
      <div className="study-screen">
        <div className="study-card compact-status">
          <Loader2 className="spin-icon" size={18} /> Generating final profile...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="study-screen">
        <div className="study-card compact-status">
          <p>{(error as Error | undefined)?.message ?? "Reflection is not ready."}</p>
          <button type="button" onClick={() => navigate("/scenarios")}>
            Return to scenarios
          </button>
        </div>
      </div>
    );
  }

  const complete = accuracyScore != null && comment.trim().length > 0;

  return (
    <div className="study-screen">
      <div className="study-card reflection-card">
        <div className="step-label">STEP 4 OF 5 - FINAL REFLECTION</div>
        <h1>Profile changes</h1>
        <p className="study-subtitle">
          Review the initial profile beside the reconstructed final profile. Deleted text is highlighted on the left; added text is highlighted on the right.
        </p>

        <div className="profile-diff-grid profile-diff-header" aria-hidden="true">
          <div>Initial profile</div>
          <div>Reconstructed final profile</div>
        </div>

        <div className="profile-diff-sections">
          {sections.map((section) => (
            <section key={section.heading} className="profile-diff-section">
              <h2>{section.heading}</h2>
              <div className="profile-diff-grid">
                {renderDiff(section.before)}
                {renderDiff(section.after)}
              </div>
            </section>
          ))}
        </div>

        <fieldset className="study-field score-field">
          <legend>
            {data.scorePrompt} <span className="required-mark">*</span>
          </legend>
          <div className="score-options">
            {[1, 2, 3, 4, 5].map((score) => (
              <label key={score} className="scale-option">
                <input
                  type="radio"
                  checked={accuracyScore === score}
                  onChange={() => setAccuracyScore(score)}
                  disabled={submit.isPending}
                />
                <span>{score}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="study-field flat-field">
          <span>
            {data.commentPrompt} <span className="required-mark">*</span>
          </span>
          <textarea
            className="text-input textarea-input"
            rows={6}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={submit.isPending}
          />
        </label>

        {submit.isError ? (
          <div className="form-error" role="alert">
            {(submit.error as Error).message}
          </div>
        ) : null}

        <div className="study-actions">
          <button type="button" onClick={() => submit.mutate()} disabled={!complete || submit.isPending}>
            {submit.isPending ? (
              <>
                <Loader2 className="spin-icon" size={16} /> Saving...
              </>
            ) : (
              "Save reflection"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
