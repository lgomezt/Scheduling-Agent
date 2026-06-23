import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { getCurrentSession } from "../../api/sessions";
import {
  getScenarioState,
  skipScenario as skipScenarioRequest,
  submitScenario,
  submitScenarioFeedback,
  type AgentOutput,
  type RankedOption,
  type ScenarioFeedback,
  type StudyScenario,
} from "../../api/study";
import { RankingList } from "../../components/study/RankingList";

type FeedbackDraft = {
  reasoningAlignmentScore: number | null;
  comment: string;
};

const emptyFeedbackDraft: FeedbackDraft = {
  reasoningAlignmentScore: null,
  comment: "",
};

const toScenarioFeedback = (draft: FeedbackDraft): ScenarioFeedback => {
  if (draft.reasoningAlignmentScore == null || !draft.comment.trim()) {
    throw new Error("Complete the agent feedback before continuing");
  }
  return {
    reasoningAlignmentScore: draft.reasoningAlignmentScore,
    comment: draft.comment.trim(),
  };
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
  const [informationNeeds, setInformationNeeds] = useState("");
  const [conditionalChange, setConditionalChange] = useState("");
  const [otherText, setOtherText] = useState("");
  const [localOutput, setLocalOutput] = useState<AgentOutput | null>(null);
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackDraft>(emptyFeedbackDraft);

  useEffect(() => {
    if (!scenario) return;
    setRanking(scenario.userResponse?.ranking.map((item) => item.optionId) ?? scenario.options.map((option) => option.id));
    setReasoning(scenario.userResponse?.reasoning ?? "");
    setInformationNeeds(scenario.userResponse?.informationNeeds ?? "");
    setConditionalChange(scenario.userResponse?.conditionalChange ?? "");
    setOtherText(scenario.userResponse?.otherText ?? "");
    setLocalOutput(null);
    setEditingAnswer(false);
    setFeedback(
      scenario.feedback
        ? {
            reasoningAlignmentScore: scenario.feedback.reasoningAlignmentScore,
            comment: scenario.feedback.comment,
          }
        : emptyFeedbackDraft,
    );
  }, [scenario?.id]);

  useEffect(() => {
    if (state && state.currentScenarioIndex >= state.total) navigate("/reflection");
  }, [state, navigate]);

  const submit = useMutation({
    mutationFn: (override?: {
      ranking: string[];
      reasoning: string;
      informationNeeds: string;
      conditionalChange: string;
      otherText?: string;
    }) =>
      submitScenario(sessionId, scenario.id, {
        ranking: override?.ranking ?? ranking,
        reasoning: override?.reasoning ?? reasoning.trim(),
        informationNeeds: override?.informationNeeds ?? informationNeeds.trim(),
        conditionalChange: override?.conditionalChange ?? conditionalChange.trim(),
        otherText: override?.otherText ?? (otherText.trim() || undefined),
      }),
    onSuccess: (result) => {
      setLocalOutput(result.agentOutput);
      setEditingAnswer(false);
      qc.invalidateQueries({ queryKey: ["scenarios", sessionId] });
    },
  });

  const saveFeedback = useMutation({
    mutationFn: (override?: ScenarioFeedback) =>
      submitScenarioFeedback(sessionId, scenario.id, override ?? toScenarioFeedback(feedback)),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["scenarios", sessionId] });
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      if (result.scenariosComplete) {
        navigate("/reflection");
      }
    },
  });

  const skipCurrentScenario = useMutation({
    mutationFn: () => skipScenarioRequest(sessionId, scenario.id),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["scenarios", sessionId] });
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      if (updated.scenariosComplete || updated.nextScenarioIndex >= scenarios.length) {
        navigate("/reflection");
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
  if (!scenario) return <Navigate to="/reflection" replace />;

  const agentOutput = localOutput ?? scenario.agentOutput ?? null;
  const inReview = Boolean(agentOutput && !editingAnswer);
  const otherOption = scenario.options.find((option) => option.isOther);
  const otherIndex = otherOption ? ranking.indexOf(otherOption.id) : -1;
  const otherNeedsDetail = Boolean(otherOption && otherIndex >= 0 && otherIndex !== ranking.length - 1);
  const rankingIsComplete =
    ranking.length === scenario.options.length &&
    new Set(ranking).size === ranking.length &&
    scenario.options.every((option) => ranking.includes(option.id));
  const canSubmitRanking =
    rankingIsComplete &&
    reasoning.trim().length > 0 &&
    informationNeeds.trim().length > 0 &&
    conditionalChange.trim().length > 0 &&
    (!otherNeedsDetail || otherText.trim().length > 0);
  const canSubmitFeedback =
    feedback.reasoningAlignmentScore != null && feedback.comment.trim().length > 0;

  return (
    <div className="study-screen">
      <div className="study-card scenario-card">
        <div className="step-label">STEP 3 OF 5 - SCENARIOS</div>
        <div className="quiet-progress" aria-hidden="true">
          <span style={{ width: `${scenarios.length ? ((activeIndex + 1) / scenarios.length) * 100 : 0}%` }} />
        </div>

        <h1>{scenario.title}</h1>
        <p className="scenario-prompt">{scenario.prompt}</p>

        {!inReview ? (
          <section className="study-section">
            <h2>Your ranking</h2>
            <p className="study-subtitle">Order every option from most acceptable to least acceptable.</p>
            <RankingList
              options={scenario.options}
              ranking={ranking}
              onChange={setRanking}
              disabled={submit.isPending || !!scenario.feedback}
            />

            {otherOption ? (
              <label className="study-field flat-field transparent-field">
                <span>
                  Other: {otherNeedsDetail ? <span className="required-mark">*</span> : null}
                </span>
                <p className="inline-field-note">Only required when Other is not ranked last.</p>
                <input
                  className="text-input"
                  value={otherText}
                  onChange={(event) => setOtherText(event.target.value)}
                  disabled={submit.isPending || !!scenario.feedback}
                  placeholder="Explain what Other means, e.g., a different scheduling action you would take."
                />
              </label>
            ) : null}

            <label className="study-field flat-field transparent-field">
              <span>
                Your reasoning <span className="required-mark">*</span>
              </span>
              <textarea
                className="text-input textarea-input"
                rows={6}
                value={reasoning}
                onChange={(event) => setReasoning(event.target.value)}
                disabled={submit.isPending || !!scenario.feedback}
                placeholder={scenario.reasoningPrompt}
              />
            </label>

            <label className="study-field flat-field transparent-field">
              <span>
                Information you would want to clarify <span className="required-mark">*</span>
              </span>
              <textarea
                className="text-input textarea-input"
                rows={5}
                value={informationNeeds}
                onChange={(event) => setInformationNeeds(event.target.value)}
                disabled={submit.isPending || !!scenario.feedback}
                placeholder={scenario.informationNeedsPrompt}
              />
            </label>

            <label className="study-field flat-field transparent-field">
              <span>
                Changes that would affect your ranking <span className="required-mark">*</span>
              </span>
              <textarea
                className="text-input textarea-input"
                rows={5}
                value={conditionalChange}
                onChange={(event) => setConditionalChange(event.target.value)}
                disabled={submit.isPending || !!scenario.feedback}
                placeholder={scenario.conditionalChangePrompt}
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
                      <Loader2 className="spin-icon" size={16} /> Generating response...
                    </>
                  ) : (
                    "Submit ranking"
                  )}
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <AgentReviewPanel
            scenario={scenario}
            output={agentOutput!}
            userRanking={scenario.userResponse?.ranking ?? rankingToRankedOptions(scenario, ranking)}
            userReasoning={scenario.userResponse?.reasoning ?? reasoning}
            userInformationNeeds={scenario.userResponse?.informationNeeds ?? informationNeeds}
            userConditionalChange={scenario.userResponse?.conditionalChange ?? conditionalChange}
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

        {inReview && !scenario.feedback ? (
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

const AgentReviewPanel = ({
  output,
  userRanking,
  userReasoning,
  userInformationNeeds,
  userConditionalChange,
  userOtherText,
  feedback,
  setFeedback,
  disabled,
}: {
  scenario: StudyScenario;
  output: AgentOutput;
  userRanking: RankedOption[];
  userReasoning: string;
  userInformationNeeds: string;
  userConditionalChange: string;
  userOtherText?: string | null;
  feedback: FeedbackDraft;
  setFeedback: (feedback: FeedbackDraft) => void;
  disabled?: boolean;
}) => {
  const update = <K extends keyof FeedbackDraft>(key: K, value: FeedbackDraft[K]) =>
    setFeedback({ ...feedback, [key]: value });

  return (
    <section className="study-section comparison-section">
      <div className="single-agent-grid">
        <AnswerCard
          title="Your answer"
          ranking={userRanking}
          reasoning={userReasoning}
          informationNeeds={userInformationNeeds}
          conditionalChange={userConditionalChange}
          otherText={userOtherText}
          tone="user"
        />
        <AnswerCard
          title="Agent response"
          ranking={output.ranking}
          reasoning={output.reasoning}
        />
      </div>

      <ScoreField
        label="How well does the agent’s explanation reflect your own?"
        value={feedback.reasoningAlignmentScore}
        onChange={(value) => update("reasoningAlignmentScore", value)}
        disabled={disabled}
      />

      <label className="study-field flat-field agent-feedback-field">
        <span>
          What do you think about the agent's reasoning? <span className="required-mark">*</span>
        </span>
        <textarea
          className="text-input textarea-input feedback-textarea"
          rows={3}
          value={feedback.comment}
          onChange={(event) => update("comment", event.target.value)}
          disabled={disabled}
          placeholder="Mention what felt aligned, misaligned, missing, or uncertain."
        />
      </label>
    </section>
  );
};

const AnswerCard = ({
  title,
  ranking,
  reasoning,
  informationNeeds,
  conditionalChange,
  otherText,
  tone,
}: {
  title: string;
  ranking: RankedOption[];
  reasoning: string;
  informationNeeds?: string;
  conditionalChange?: string;
  otherText?: string | null;
  tone?: "user";
}) => (
  <article className={`answer-card${tone === "user" ? " user-answer-card" : ""}`}>
    <div className="model-label">{title}</div>
    <ol className="model-ranking comparison-ranking">
      {ranking.map((item) => (
        <li key={item.optionId}>
          <strong>Option {item.optionId}</strong>
          <span>{item.optionId === "E" && otherText ? `Other: ${otherText}` : item.label}</span>
        </li>
      ))}
    </ol>
    <div className="answer-reasoning">
      <span>Reasoning</span>
      <p>{reasoning}</p>
    </div>
    {informationNeeds ? (
      <div className="answer-reasoning compact">
        <span>Information needs</span>
        <p>{informationNeeds}</p>
      </div>
    ) : null}
    {conditionalChange ? (
      <div className="answer-reasoning compact">
        <span>Conditional changes</span>
        <p>{conditionalChange}</p>
      </div>
    ) : null}
  </article>
);

const ScoreField = ({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
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
