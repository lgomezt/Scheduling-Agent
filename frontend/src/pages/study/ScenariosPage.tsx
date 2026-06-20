import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { completeSession, getCurrentSession } from "../../api/sessions";
import {
  getScenarioState,
  skipScenario as skipScenarioRequest,
  submitScenario,
  submitScenarioFeedback,
  type ModelOutput,
  type RankedOption,
  type ScenarioFeedback,
  type StudyScenario,
} from "../../api/study";
import { RankingList } from "../../components/study/RankingList";

const emptyFeedback: ScenarioFeedback = {
  closerChoice: "both",
  scoreA: 3,
  scoreB: 3,
  commentA: "",
  commentB: "",
  comparisonComment: "",
};

export const ScenariosPage = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });
  const sessionId = session?.id ?? "";
  const { data: state, isLoading: scenariosLoading } = useQuery({
    queryKey: ["scenarios", sessionId],
    queryFn: () => getScenarioState(sessionId),
    enabled: !!sessionId,
  });

  const scenarios = state?.scenarios ?? [];
  const activeIndex = Math.min(state?.currentScenarioIndex ?? 0, Math.max(scenarios.length - 1, 0));
  const scenario = scenarios[activeIndex];
  const [ranking, setRanking] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [otherText, setOtherText] = useState("");
  const [localOutputs, setLocalOutputs] = useState<ModelOutput[] | null>(null);
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [feedback, setFeedback] = useState<ScenarioFeedback>(emptyFeedback);

  useEffect(() => {
    if (!scenario) return;
    setRanking(scenario.userResponse?.ranking.map((item) => item.optionId) ?? scenario.options.map((option) => option.id));
    setReasoning(scenario.userResponse?.reasoning ?? "");
    setOtherText(scenario.userResponse?.otherText ?? "");
    setLocalOutputs(null);
    setEditingAnswer(false);
    setFeedback(
      scenario.feedback
        ? {
            closerChoice: scenario.feedback.closerChoice,
            scoreA: scenario.feedback.scoreA,
            scoreB: scenario.feedback.scoreB,
            commentA: scenario.feedback.commentA,
            commentB: scenario.feedback.commentB,
            comparisonComment: scenario.feedback.comparisonComment,
          }
        : emptyFeedback,
    );
  }, [scenario?.id]);

  useEffect(() => {
    if (state && state.currentScenarioIndex >= state.total) navigate("/complete");
  }, [state, navigate]);

  const submit = useMutation({
    mutationFn: (override?: { ranking: string[]; reasoning: string; otherText?: string }) =>
      submitScenario(sessionId, scenario.id, {
        ranking: override?.ranking ?? ranking,
        reasoning: override?.reasoning ?? reasoning.trim(),
        otherText: override?.otherText ?? (otherText.trim() || undefined),
      }),
    onSuccess: (result) => {
      setLocalOutputs(result.modelOutputs);
      setEditingAnswer(false);
      qc.invalidateQueries({ queryKey: ["scenarios", sessionId] });
    },
  });

  const saveFeedback = useMutation({
    mutationFn: (override?: ScenarioFeedback) => submitScenarioFeedback(sessionId, scenario.id, override ?? feedback),
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: ["scenarios", sessionId] });
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      if (result.scenariosComplete) {
        await completeSession(sessionId);
        qc.invalidateQueries({ queryKey: ["session", "latest"] });
        navigate("/complete");
      }
    },
  });

  const skipCurrentScenario = useMutation({
    mutationFn: () => skipScenarioRequest(sessionId, scenario.id),
    onSuccess: async (updated) => {
      qc.invalidateQueries({ queryKey: ["scenarios", sessionId] });
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      if (updated.scenariosComplete || updated.nextScenarioIndex >= scenarios.length) {
        await completeSession(sessionId);
        qc.invalidateQueries({ queryKey: ["session", "latest"] });
        navigate("/complete");
      }
    },
  });

  if (sessionLoading || scenariosLoading) {
    return (
      <div className="study-screen">
        <div className="study-card compact-status">Loading scenarios...</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/survey" replace />;
  if (!scenario) return <Navigate to="/complete" replace />;

  const modelOutputs = localOutputs ?? scenario.modelOutputs ?? [];
  const inComparison = modelOutputs.length === 2 && !editingAnswer;
  const canSubmitRanking = reasoning.trim().length > 0;
  const canSubmitFeedback =
    feedback.commentA.trim().length > 0 &&
    feedback.commentB.trim().length > 0 &&
    feedback.comparisonComment.trim().length > 0;
  return (
    <div className="study-screen">
      <div className="study-card scenario-card">
        <div className="step-label">STEP 4 OF 5 · SCENARIOS</div>
        <div className="quiet-progress" aria-hidden="true">
          <span style={{ width: `${scenarios.length ? ((activeIndex + 1) / scenarios.length) * 100 : 0}%` }} />
        </div>

        <h1>{scenario.title}</h1>
        <p className="scenario-prompt">{scenario.prompt}</p>

        {!inComparison ? (
          <section className="study-section">
            <h2>Your ranking</h2>
            <p className="study-subtitle">Order every option from most representative to least representative.</p>
            <RankingList
              options={scenario.options}
              ranking={ranking}
              onChange={setRanking}
              disabled={submit.isPending || !!scenario.feedback}
            />

            <label className="study-field flat-field transparent-field">
              <span>
                Your reasoning <span className="required-mark">*</span>
              </span>
              <textarea
                className="text-input textarea-input"
                rows={7}
                value={reasoning}
                onChange={(event) => setReasoning(event.target.value)}
                disabled={submit.isPending || !!scenario.feedback}
                placeholder={scenario.reasoningPrompt}
              />
            </label>

            {submit.isError ? (
              <div className="form-error" role="alert">
                {(submit.error as Error).message}
              </div>
            ) : null}

            {!scenario.feedback ? (
              <div className="study-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => skipCurrentScenario.mutate()}
                  disabled={submit.isPending || skipCurrentScenario.isPending}
                >
                  {skipCurrentScenario.isPending ? "Skipping..." : "Skip"}
                </button>
                <button type="button" onClick={() => submit.mutate(undefined)} disabled={!canSubmitRanking || submit.isPending}>
                  {submit.isPending ? (
                    <>
                      <Loader2 className="spin-icon" size={16} /> Generating responses...
                    </>
                  ) : (
                    "Submit ranking"
                  )}
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <ComparisonPanel
            scenario={scenario}
            outputs={modelOutputs}
            userRanking={scenario.userResponse?.ranking ?? rankingToRankedOptions(scenario, ranking)}
            userReasoning={scenario.userResponse?.reasoning ?? reasoning}
            userOtherText={scenario.userResponse?.otherText ?? otherText}
            feedback={feedback}
            setFeedback={setFeedback}
            disabled={saveFeedback.isPending || !!scenario.feedback}
          />
        )}

        {saveFeedback.isError ? (
          <div className="form-error" role="alert">
            {(saveFeedback.error as Error).message}
          </div>
        ) : null}

        {inComparison && !scenario.feedback ? (
          <div className="study-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditingAnswer(true)}
              disabled={saveFeedback.isPending || skipCurrentScenario.isPending}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => skipCurrentScenario.mutate()}
              disabled={saveFeedback.isPending || skipCurrentScenario.isPending}
            >
              {skipCurrentScenario.isPending ? "Skipping..." : "Skip"}
            </button>
            <button type="button" onClick={() => saveFeedback.mutate(undefined)} disabled={!canSubmitFeedback || saveFeedback.isPending}>
              {saveFeedback.isPending ? (
                <>
                  <Loader2 className="spin-icon" size={16} /> Saving feedback...
                </>
              ) : activeIndex + 1 >= scenarios.length ? (
                "Save and continue"
              ) : (
                "Save and next scenario"
              )}
            </button>
          </div>
        ) : null}

        {scenario.feedback ? (
          <div className="completed-note">This scenario is complete. Move to the next scenario from the saved session state.</div>
        ) : null}
      </div>
    </div>
  );
};

const rankingToRankedOptions = (scenario: StudyScenario, ranking: string[]): RankedOption[] => {
  const labels = new Map(scenario.options.map((option) => [option.id, option.label]));
  return ranking.map((optionId, index) => ({
    rank: index + 1,
    optionId,
    label: labels.get(optionId) ?? optionId,
  }));
};

const ComparisonPanel = ({
  scenario,
  outputs,
  userRanking,
  userReasoning,
  userOtherText,
  feedback,
  setFeedback,
  disabled,
}: {
  scenario: StudyScenario;
  outputs: ModelOutput[];
  userRanking: RankedOption[];
  userReasoning: string;
  userOtherText?: string | null;
  feedback: ScenarioFeedback;
  setFeedback: (feedback: ScenarioFeedback) => void;
  disabled?: boolean;
}) => {
  const sorted = useMemo(() => [...outputs].sort((a, b) => a.displayLabel.localeCompare(b.displayLabel)), [outputs]);
  const update = <K extends keyof ScenarioFeedback>(key: K, value: ScenarioFeedback[K]) =>
    setFeedback({ ...feedback, [key]: value });

  return (
    <section className="study-section comparison-section">
      <div className="comparison-grid">
        <AnswerCard
          title="Your answer"
          ranking={userRanking}
          reasoning={userReasoning}
          otherText={userOtherText}
          tone="user"
        />
        {sorted.map((output) => (
          <AnswerCard
            key={output.displayLabel}
            title={`Response ${output.displayLabel}`}
            ranking={output.ranking}
            reasoning={output.reasoning}
          />
        ))}
      </div>

      <fieldset className="study-field comparison-question">
        <legend>Which proposed action is closer to what you would do?</legend>
        <div className="segmented-options">
          {[
            ["A", "Response A"],
            ["B", "Response B"],
            ["both", "Both equally"],
            ["neither", "Neither"],
          ].map(([value, label]) => (
            <label key={value} className="segment-choice">
              <input
                type="radio"
                name={`${scenario.id}_closer`}
                checked={feedback.closerChoice === value}
                onChange={() => update("closerChoice", value as ScenarioFeedback["closerChoice"])}
                disabled={disabled}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="score-grid">
        <ScoreField label="How well does Response A reasoning reflect your values?" value={feedback.scoreA} onChange={(value) => update("scoreA", value)} disabled={disabled} />
        <ScoreField label="How well does Response B reasoning reflect your values?" value={feedback.scoreB} onChange={(value) => update("scoreB", value)} disabled={disabled} />
      </div>

      <label className="study-field flat-field">
        <span>Why did you score Response A this way? <span className="required-mark">*</span></span>
        <textarea
          className="text-input textarea-input"
          rows={4}
          value={feedback.commentA}
          onChange={(event) => update("commentA", event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="study-field flat-field">
        <span>Why did you score Response B this way? <span className="required-mark">*</span></span>
        <textarea
          className="text-input textarea-input"
          rows={4}
          value={feedback.commentB}
          onChange={(event) => update("commentB", event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="study-field flat-field">
        <span>What do you think about the two LLM answers overall? <span className="required-mark">*</span></span>
        <textarea
          className="text-input textarea-input"
          rows={5}
          value={feedback.comparisonComment}
          onChange={(event) => update("comparisonComment", event.target.value)}
          disabled={disabled}
        />
      </label>
    </section>
  );
};

const AnswerCard = ({
  title,
  ranking,
  reasoning,
  otherText,
  tone,
}: {
  title: string;
  ranking: RankedOption[];
  reasoning: string;
  otherText?: string | null;
  tone?: "user";
}) => (
  <article className={`answer-card${tone === "user" ? " user-answer-card" : ""}`}>
    <div className="model-label">{title}</div>
    <ol className="model-ranking comparison-ranking">
      {ranking.map((item) => (
        <li key={item.optionId}>
          <strong>Option {item.optionId}</strong>
          <span>{item.optionId === "E" && otherText ? otherText : item.label}</span>
        </li>
      ))}
    </ol>
    <div className="answer-reasoning">
      <span>Reasoning</span>
      <p>{reasoning}</p>
    </div>
  </article>
);

const ScoreField = ({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) => (
  <fieldset className="study-field score-field">
    <legend>{label}</legend>
    <div className="score-options">
      {[1, 2, 3, 4, 5].map((score) => (
        <label key={score} className="scale-option">
          <input
            type="radio"
            checked={value === score}
            onChange={() => onChange(score)}
            disabled={disabled}
          />
          <span>{score}</span>
        </label>
      ))}
    </div>
  </fieldset>
);
