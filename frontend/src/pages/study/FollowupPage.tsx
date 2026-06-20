import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getCurrentSession } from "../../api/sessions";
import { getFollowup, submitFollowup } from "../../api/study";

type FollowupChoice = "A" | "B" | "both" | "neither";

export const FollowupPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });
  const sessionId = session?.id ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["followup", sessionId],
    queryFn: () => getFollowup(sessionId),
    enabled: !!sessionId,
    retry: false,
  });
  const [responses, setResponses] = useState<Record<string, { choice: FollowupChoice; reason: string }>>({});

  const submit = useMutation({
    mutationFn: () => submitFollowup(sessionId, responses),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      qc.invalidateQueries({ queryKey: ["session", "latest"] });
      navigate("/done");
    },
  });

  const complete = useMemo(() => {
    if (!data) return false;
    return data.questions.every((question) => {
      const response = responses[question.id];
      return response?.choice && response.reason.trim().length > 0;
    });
  }, [data, responses]);

  if (sessionLoading) {
    return (
      <div className="study-screen">
        <div className="study-card compact-status">Loading follow-up...</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/done" replace />;

  if (isLoading) {
    return (
      <div className="study-screen">
        <div className="study-card compact-status">
          <Loader2 className="spin-icon" size={18} /> Generating final profile sets...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="study-screen">
        <div className="study-card compact-status">
          <p>{(error as Error | undefined)?.message ?? "Follow-up is not ready."}</p>
          <button type="button" onClick={() => navigate("/scenarios")}>
            Return to scenarios
          </button>
        </div>
      </div>
    );
  }

  const update = (questionId: string, key: "choice" | "reason", value: string) => {
    setResponses((current) => ({
      ...current,
      [questionId]: {
        choice: current[questionId]?.choice ?? "both",
        reason: current[questionId]?.reason ?? "",
        [key]: value,
      } as { choice: FollowupChoice; reason: string },
    }));
  };

  return (
    <div className="study-screen">
      <div className="study-card followup-card">
        <div className="step-label">STEP 5 OF 5 · COMPLETE</div>
        <h1>Final profile comparison</h1>
        <p className="study-subtitle">
          Review the anonymized profile sets and answer the comparison questions below.
        </p>

        <div className="profile-set-grid">
          {data.sets.map((set) => (
            <article key={set.label} className="profile-set">
              <div className="model-label">Profile Set {set.label}</div>
              <details open>
                <summary>Final profile</summary>
                <pre>{set.finalProfile}</pre>
              </details>
              <details>
                <summary>Initial profile</summary>
                <pre>{set.initialProfile}</pre>
              </details>
            </article>
          ))}
        </div>

        <div className="form-stack followup-questions">
          {data.questions.map((question) => {
            const response = responses[question.id] ?? { choice: "both" as FollowupChoice, reason: "" };
            return (
              <fieldset key={question.id} className="study-field">
                <legend>
                  {question.label}
                  {question.required ? <span className="required-mark">*</span> : null}
                </legend>
                <div className="segmented-options">
                  {data.choices.map((choice) => (
                    <label key={choice.id} className="segment-choice">
                      <input
                        type="radio"
                        name={question.id}
                        checked={response.choice === choice.id}
                        onChange={() => update(question.id, "choice", choice.id)}
                      />
                      <span>{choice.label}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  className="text-input textarea-input"
                  rows={4}
                  value={response.reason}
                  onChange={(event) => update(question.id, "reason", event.target.value)}
                  placeholder="Briefly explain your choice."
                />
              </fieldset>
            );
          })}
        </div>

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
              "Save follow-up"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
