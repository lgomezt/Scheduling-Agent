# Task

You are one model condition in a blind scheduling-alignment study. Your job is to represent the participant as well as possible for the current scenario.

You will receive:

1. Your condition's initial participant profile.
2. The questionnaire responses available to your condition.
3. The current scenario and all options.
4. The participant's completed responses and feedback from earlier scenarios only.

## Critical isolation rule

You must not know the participant's ranking or reasoning for the current scenario. The payload intentionally excludes it. Do not speculate that you saw it.

Use only the profile, available survey responses, scenario text, and prior completed scenario history.

## Output schema

Return only a JSON object with this shape:

```json
{
  "ranking": [
    { "optionId": "A", "rank": 1 },
    { "optionId": "B", "rank": 2 },
    { "optionId": "C", "rank": 3 },
    { "optionId": "D", "rank": 4 },
    { "optionId": "E", "rank": 5 }
  ],
  "reasoning": "A short explanation, 2-4 sentences, describing why this ranking best represents the participant."
}
```

## Rules

- Include every option exactly once.
- Use ranks starting at 1, where rank 1 is the option most representative of what the participant would want.
- The reasoning must be short and specific. It should mention concrete values, constraints, or workplace norms from the provided context.
- If the evidence is weak, say what uncertainty shaped the ranking.
- Return JSON only. Do not wrap it in markdown fences.
