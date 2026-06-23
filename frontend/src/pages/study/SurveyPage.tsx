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
  type SurveyResponseValue,
  type SurveyResponses,
} from "../../api/study";

type Props = {
  questionnaireId: "preferences_values";
  stepNumber: 2;
  stepTitle: string;
  nextPath: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const selectedSingleChoiceId = (value: unknown) => {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.choiceId === "string") return value.choiceId;
  return "";
};

const selectedMultiChoiceIds = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (isRecord(value) && Array.isArray(value.choices)) {
    return value.choices.filter((item): item is string => typeof item === "string");
  }
  return [];
};

const responseOtherText = (value: unknown) =>
  isRecord(value) && typeof value.otherText === "string" ? value.otherText : "";

const otherChoiceFor = (question: StudyQuestion) => question.choices?.find((choice) => choice.isOther);

const isOtherChoice = (question: StudyQuestion, choiceId: string) =>
  Boolean(question.choices?.some((choice) => choice.id === choiceId && choice.isOther));

const singleChoiceResponse = (
  question: StudyQuestion,
  choiceId: string,
  otherText: string,
): SurveyResponseValue =>
  isOtherChoice(question, choiceId) ? { choiceId, otherText } : choiceId;

const multiChoiceResponse = (
  question: StudyQuestion,
  choices: string[],
  otherText: string,
): SurveyResponseValue => {
  const otherChoice = otherChoiceFor(question);
  return otherChoice && choices.includes(otherChoice.id) ? { choices, otherText } : choices;
};

const hasQuestionAnswer = (question: StudyQuestion, value: unknown) => {
  if (question.type === "text" || question.type === "textarea") {
    return typeof value === "string" && value.trim().length > 0;
  }
  if (question.type === "single_choice") {
    const choiceId = selectedSingleChoiceId(value);
    return Boolean(choiceId && (!isOtherChoice(question, choiceId) || responseOtherText(value).trim().length > 0));
  }
  if (question.type === "multi_choice") {
    const choices = selectedMultiChoiceIds(value);
    const otherChoice = otherChoiceFor(question);
    return Boolean(
      choices.length > 0 &&
        (!otherChoice || !choices.includes(otherChoice.id) || responseOtherText(value).trim().length > 0),
    );
  }
  if (question.type === "scale") {
    return typeof value === "number";
  }
  return false;
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

  const updateResponse = (questionId: string, value: SurveyResponseValue) => {
    setResponses((state) => ({ ...state, [questionId]: value }));
  };

  const toggleMulti = (question: StudyQuestion, choiceId: string) => {
    const existing = responses[question.id];
    const selected = selectedMultiChoiceIds(existing);
    const exists = selected.includes(choiceId);
    const next = exists ? selected.filter((id) => id !== choiceId) : [...selected, choiceId];
    if (!exists && question.maxSelections && next.length > question.maxSelections) return;
    updateResponse(question.id, multiChoiceResponse(question, next, responseOtherText(existing)));
  };

  const goNext = () => {
    if (questionIndex >= questions.length - 1) {
      saveAndGoNext.mutate();
      return;
    }
    setQuestionIndex((index) => Math.min(index + 1, questions.length - 1));
  };

  const skipQuestion = () => {
    if (questionIndex >= questions.length - 1) {
      saveAndGoNext.mutate();
      return;
    }
    setQuestionIndex((index) => Math.min(index + 1, questions.length - 1));
  };

  const canGoNext = hasQuestionAnswer(current, responses[current.id]);

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
          <button type="button" className="btn-secondary" onClick={skipQuestion} disabled={saveAndGoNext.isPending}>
            Skip
          </button>
          <button type="button" onClick={goNext} disabled={!canGoNext || saveAndGoNext.isPending}>
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
  onChange: (value: SurveyResponseValue) => void;
  onToggleMulti: (choiceId: string) => void;
}) => {
  const otherChoice = otherChoiceFor(question);
  const selectedSingle = selectedSingleChoiceId(value);
  const selectedMulti = selectedMultiChoiceIds(value);
  const otherText = responseOtherText(value);

  const updateSingleOtherText = (text: string) => {
    if (!otherChoice) return;
    onChange({ choiceId: otherChoice.id, otherText: text });
  };

  const updateMultiOtherText = (text: string) => {
    if (!otherChoice) return;
    const nextChoices = selectedMulti.includes(otherChoice.id) ? selectedMulti : [...selectedMulti, otherChoice.id];
    if (question.maxSelections && nextChoices.length > question.maxSelections) return;
    onChange({ choices: nextChoices, otherText: text });
  };

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
          {(question.choices ?? []).map((choice) =>
            choice.isOther ? (
              <div key={choice.id} className="choice-row other-choice-row">
                <label className="choice-control">
                  <input
                    type="radio"
                    name={question.id}
                    checked={selectedSingle === choice.id}
                    onChange={() => onChange(singleChoiceResponse(question, choice.id, otherText))}
                  />
                  <span>Other:</span>
                </label>
                <input
                  className="text-input other-choice-input"
                  value={selectedSingle === choice.id ? otherText : ""}
                  onFocus={() => onChange(singleChoiceResponse(question, choice.id, otherText))}
                  onChange={(event) => updateSingleOtherText(event.target.value)}
                  placeholder="Please specify"
                />
              </div>
            ) : (
              <label key={choice.id} className="choice-row">
                <input
                  type="radio"
                  name={question.id}
                  checked={selectedSingle === choice.id}
                  onChange={() => onChange(choice.id)}
                />
                <span>{choice.label}</span>
              </label>
            ),
          )}
        </div>
      ) : null}

      {question.type === "multi_choice" ? (
        <div className="choice-list">
          {question.maxSelections ? (
            <div className="field-help">
              Select up to {question.maxSelections}.
            </div>
          ) : null}
          {(question.choices ?? []).map((choice) =>
            choice.isOther ? (
              <div key={choice.id} className="choice-row other-choice-row">
                <label className="choice-control">
                  <input
                    type="checkbox"
                    checked={selectedMulti.includes(choice.id)}
                    onChange={() => onToggleMulti(choice.id)}
                  />
                  <span>Other:</span>
                </label>
                <input
                  className="text-input other-choice-input"
                  value={selectedMulti.includes(choice.id) ? otherText : ""}
                  onFocus={() => {
                    if (!selectedMulti.includes(choice.id)) onToggleMulti(choice.id);
                  }}
                  onChange={(event) => updateMultiOtherText(event.target.value)}
                  placeholder="Please specify"
                  disabled={
                    Boolean(question.maxSelections && selectedMulti.length >= question.maxSelections) &&
                    !selectedMulti.includes(choice.id)
                  }
                />
              </div>
            ) : (
              <label key={choice.id} className="choice-row">
                <input
                  type="checkbox"
                  checked={selectedMulti.includes(choice.id)}
                  onChange={() => onToggleMulti(choice.id)}
                />
                <span>{choice.label}</span>
              </label>
            ),
          )}
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
