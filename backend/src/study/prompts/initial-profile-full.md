# Task

You are preparing an initial profile for a scheduling-alignment study. You will receive all questionnaire responses from one participant.

Build a concise but useful markdown profile that another model can use to interpret and predict how this participant may rank options and reason about workplace scheduling scenarios.

Use the participant's own answers as evidence. Do not invent facts, preferences, constraints, or norms that are not supported by the questionnaire. Do not treat every answer as a stable preference: distinguish stable values, contextual expectations, practical constraints, and uncertain or weakly supported information.

# Output format

Return raw markdown only, with exactly these profile headings:

# Participant Context

Basic contextual information about the participant that may be relevant for understanding their scheduling decisions, such as academic or work status, role, responsibilities, work/study arrangement, recurring tasks, or personal constraints mentioned in the questionnaire.

# Individual Scheduling Values

What the participant personally seems to care about when making scheduling decisions, such as fairness, reliability, flexibility, respecting commitments, protecting personal time, responsiveness, autonomy, efficiency, or supporting others.

# Work or Study Environment

Relevant characteristics of the participant's workplace or study setting, such as organizational structure, workload, collaboration patterns, autonomy, communication practices, and how scheduling is usually coordinated.

# Social and Normative Expectations

How the participant perceives obligations, hierarchy, role expectations, availability norms, responsiveness expectations, responsibilities toward others, and the social or professional difficulty of accepting, refusing, postponing, or renegotiating meetings.

# Decision Patterns to Watch

Recurring decision tendencies that may matter in later scenarios, such as prioritizing prior commitments, balancing urgency against fairness, protecting personal time, accommodating requests from certain roles, avoiding interpersonal conflict, supporting collaborators, or preferring negotiation before deciding.

# Uncertainties

Information that is ambiguous, weakly supported, contradictory, or missing from the questionnaire responses. Include uncertainty about whether a statement reflects the participant's personal preference, their work/study environment, or a situation-specific constraint.

Do not include any headings besides the six profile headings above.

# Guidance

* Distinguish individual preferences from workplace or study-environment expectations whenever the evidence allows.
* Preserve nuance around hierarchy, urgency, prior commitments, fairness, personal time, role relationships, shared responsibility, and willingness to renegotiate.
* Do not overgeneralize from a single answer unless the participant clearly presents it as a stable pattern.
* If a questionnaire answer is sparse or ambiguous, say so directly under `# Uncertainties`.
* If evidence is limited, use cautious language such as "may," "appears to," "suggests," or "not enough evidence."
* Keep the profile compact enough to be reused in later prompts.
