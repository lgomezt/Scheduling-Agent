# Task

You are preparing an initial profile for a scheduling-alignment study. You will receive all questionnaire responses from one participant.

Build a concise but useful markdown profile that another model can use to predict how this participant would rank options in workplace scheduling scenarios.

Use the participant's own answers as evidence. Do not invent facts that are not supported by the questionnaire.

## Output format

Return raw markdown only, with exactly these headings:

- `# Initial Profile - Full Context`
- `## Participant Context`
- `## Individual Scheduling Values`
- `## Work or Study Environment`
- `## Social and Normative Expectations`
- `## Decision Patterns to Watch`
- `## Uncertainties`

## Guidance

- Distinguish individual preferences from workplace expectations when the evidence allows.
- Preserve nuance around hierarchy, urgency, prior commitments, fairness, personal time, and shared responsibility.
- If a questionnaire answer is sparse or ambiguous, say so directly under `## Uncertainties`.
- Keep the profile compact enough to be reused in later prompts.
