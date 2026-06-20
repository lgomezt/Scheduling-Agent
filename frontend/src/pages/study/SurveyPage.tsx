import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { createSession, getCurrentSession } from "../../api/sessions";
import {
  getStudyConfig,
  getSurveyState,
  submitSurvey,
  type StudyQuestion,
  type SurveyResponses,
} from "../../api/study";

type Props = {
  questionnaireId: "demographic" | "preferences_values";
  stepNumber: 2 | 3;
  stepTitle: string;
  nextPath: string;
};

export const SurveyPage = ({ questionnaireId, stepNumber, stepTitle, nextPath }: Props) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<SurveyResponses>({});
  const initializedRef = useRef(false);
  const createTriggeredRef = useRef(false);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });
  const create = useMutation({
    mutationFn: createSession,
    onSuccess: (fresh) => qc.setQueryData(["session", "current"], fresh),
  });

  useEffect(() => {
    if (!sessionLoading && !session && !createTriggeredRef.current) {
      createTriggeredRef.current = true;
      create.mutate();
    }
  }, [sessionLoading, session, create]);

  const sessionId = session?.id ?? "";
  const { data: config } = useQuery({ queryKey: ["study", "config"], queryFn: getStudyConfig });
  const { data: surveyState } = useQuery({
    queryKey: ["survey", sessionId],
    queryFn: () => getSurveyState(sessionId),
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (surveyState && !initializedRef.current) {
      initializedRef.current = true;
      setResponses(surveyState.responses as SurveyResponses);
    }
  }, [surveyState]);

  const questionnaire = useMemo(
    () => config?.questionnaires.find((item) => item.id === questionnaireId),
    [config, questionnaireId],
  );
  const questions = questionnaire?.questions ?? [];
  const current = questions[questionIndex];
  const progress = questions.length ? ((questionIndex + 1) / questions.length) * 100 : 0;

  const saveAndGoNext = useMutation({
    mutationFn: () => submitSurvey(sessionId, responses),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["survey", sessionId] });
      qc.invalidateQueries({ queryKey: ["session", "current"] });
      navigate(nextPath);
    },
  });

  if (!sessionId || !config || !questionnaire || !current) {
    return (
      <div className="study-screen">
        <div className="study-card compact-status">Preparing the study session...</div>
      </div>
    );
  }

  const updateResponse = (questionId: string, value: string | number | string[]) => {
    setResponses((state) => ({ ...state, [questionId]: value }));
  };

  const toggleMulti = (question: StudyQuestion, choiceId: string) => {
    const selected = Array.isArray(responses[question.id]) ? (responses[question.id] as string[]) : [];
    const exists = selected.includes(choiceId);
    const next = exists ? selected.filter((id) => id !== choiceId) : [...selected, choiceId];
    if (!exists && question.maxSelections && next.length > question.maxSelections) return;
    updateResponse(question.id, next);
  };

  const goNext = () => {
    if (questionIndex >= questions.length - 1) {
      saveAndGoNext.mutate();
      return;
    }
    setQuestionIndex((index) => Math.min(index + 1, questions.length - 1));
  };

  return (
    <div className="study-screen">
      <div className="study-card survey-card one-question-card">
        <div className="step-label">
          STEP {stepNumber} OF 5 · {stepTitle}
        </div>
        <div className="quiet-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <SurveyField
          question={current}
          value={responses[current.id]}
          onChange={(value) => updateResponse(current.id, value)}
          onToggleMulti={(choiceId) => toggleMulti(current, choiceId)}
        />

        {saveAndGoNext.isError ? (
          <div className="form-error" role="alert">
            {(saveAndGoNext.error as Error).message}
          </div>
        ) : null}

        <div className="study-actions simple-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setQuestionIndex((index) => Math.max(index - 1, 0))}
            disabled={questionIndex === 0 || saveAndGoNext.isPending}
          >
            Back
          </button>
          <button type="button" className="btn-secondary" onClick={goNext} disabled={saveAndGoNext.isPending}>
            Skip
          </button>
          <button type="button" onClick={goNext} disabled={saveAndGoNext.isPending}>
            {saveAndGoNext.isPending ? (
              <>
                <Loader2 className="spin-icon" size={16} /> Saving...
              </>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const SurveyField = ({
  question,
  value,
  onChange,
  onToggleMulti,
}: {
  question: StudyQuestion;
  value: unknown;
  onChange: (value: string | number | string[]) => void;
  onToggleMulti: (choiceId: string) => void;
}) => {
  return (
    <fieldset className="study-field question-field transparent-field">
      <legend>{question.label}</legend>
      {question.helpText ? <p className="field-help">{question.helpText}</p> : null}

      {question.type === "text" ? (
        <input
          className="text-input"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}

      {question.type === "textarea" ? (
        <textarea
          className="text-input textarea-input"
          rows={7}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}

      {question.type === "single_choice" ? (
        <div className="choice-list">
          {(question.choices ?? []).map((choice) => (
            <label key={choice.id} className="choice-row">
              <input
                type="radio"
                name={question.id}
                checked={value === choice.id}
                onChange={() => onChange(choice.id)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {question.type === "multi_choice" ? (
        <div className="choice-list">
          {question.maxSelections ? (
            <div className="field-help">
              Select up to {question.maxSelections}.
            </div>
          ) : null}
          {(question.choices ?? []).map((choice) => (
            <label key={choice.id} className="choice-row">
              <input
                type="checkbox"
                checked={Array.isArray(value) && value.includes(choice.id)}
                onChange={() => onToggleMulti(choice.id)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {question.type === "scale" ? (
        <div className="scale-field">
          <span>{question.minLabel}</span>
          <div className="scale-options">
            {Array.from({ length: (question.max ?? 5) - (question.min ?? 1) + 1 }, (_, index) => {
              const score = (question.min ?? 1) + index;
              return (
                <label key={score} className="scale-option">
                  <input
                    type="radio"
                    name={question.id}
                    checked={value === score}
                    onChange={() => onChange(score)}
                  />
                  <span>{score}</span>
                </label>
              );
            })}
          </div>
          <span>{question.maxLabel}</span>
        </div>
      ) : null}
    </fieldset>
  );
};
