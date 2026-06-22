# Task

You are preparing a final updated profile for a scheduling-alignment study.

You will receive:

1. the participant's initial profile generated from the questionnaire;
2. the participant's ranked options and written explanations for all scheduling scenarios;
3. optionally, the participant's comments on what information they would have wanted to ask for or clarify before deciding.

Build a concise but useful final markdown profile that another model can use to interpret this participant's scheduling values, contextual expectations, decision patterns, and possible information needs in future workplace scheduling scenarios.

Use the participant's scenario responses as evidence to refine, correct, or qualify the initial profile. Do not invent facts, preferences, constraints, or norms that are not supported by the questionnaire, the initial profile, or the scenario responses.

Do not treat every scenario response as a stable preference. Distinguish between:

* stable individual scheduling values;
* workplace or study-environment expectations;
* practical constraints;
* recurring decision patterns;
* scenario-specific reasoning;
* unresolved uncertainty.

# Output format

Return raw markdown only, with exactly these profile headings:

# Participant Context

Basic contextual information about the participant that remains relevant for understanding their scheduling decisions, such as academic or work status, role, responsibilities, work/study arrangement, recurring tasks, or personal constraints. Preserve information from the initial profile unless the scenario evidence clearly qualifies or contradicts it.

# Individual Scheduling Values

What the participant personally seems to care about when making scheduling decisions, refined using the scenario evidence. Include values such as fairness, reliability, flexibility, respecting commitments, protecting personal time, responsiveness, autonomy, efficiency, supporting others, or maintaining contribution quality when supported by evidence.

# Work or Study Environment

Relevant characteristics of the participant's workplace or study setting, refined using questionnaire and scenario evidence. Include organizational structure, workload, collaboration patterns, autonomy, communication practices, and how scheduling is usually coordinated when supported by evidence.

# Social and Normative Expectations

How the participant perceives obligations, hierarchy, role expectations, availability norms, responsiveness expectations, responsibilities toward others, and the social or professional difficulty of accepting, refusing, postponing, or renegotiating meetings. Clearly distinguish personal preferences from perceived workplace or study-environment expectations whenever possible.

# Decision Patterns to Watch

Recurring decision tendencies that emerged across the scenarios. Include patterns such as prioritizing prior commitments, balancing urgency against fairness, protecting personal time, accommodating requests from certain roles, avoiding interpersonal conflict, supporting collaborators, maintaining contribution quality, preferring limited compromise, or seeking additional information before deciding.

# Contextual Sensitivities and Information Needs

Types of contextual information that appear especially relevant to the participant's scheduling decisions. Include information the participant explicitly wanted to clarify, but do not treat clarification requests as stable preferences unless they recur across scenarios. Focus on what kinds of missing or ambiguous information would likely affect this participant's reasoning, such as urgency, consequences, role expectations, availability of alternatives, task dependencies, whether someone's input is essential, or how much preparation or contribution is required.

# Profile Changes from Initial Version

Summarize the most important changes from the initial profile. For each change, briefly state what scenario evidence motivated it. Include cases where the scenario evidence confirmed, refined, contradicted, or qualified the initial profile.

# Uncertainties

Information that remains ambiguous, weakly supported, contradictory, or missing after both the questionnaire and scenario responses. Include uncertainty about whether a pattern reflects a stable individual value, a workplace or study-environment expectation, or a scenario-specific consideration.

Do not include any headings besides the eight profile headings above.

# Guidance

* Use the initial profile as the starting point, not as ground truth.
* Use scenario responses as evidence, not as isolated labels.
* Do not overgeneralize from a single scenario unless the participant explicitly frames the reasoning as general.
* Distinguish individual preferences from workplace or study-environment expectations whenever the evidence allows.
* Preserve nuance around hierarchy, urgency, prior commitments, fairness, personal time, role relationships, shared responsibility, contribution quality, and willingness to renegotiate.
* Track information needs as contextual sensitivities, not automatically as stable preferences for clarification.
* If scenario evidence contradicts the initial profile, revise cautiously and mention the contradiction under `# Profile Changes from Initial Version` or `# Uncertainties`.
* If evidence is limited, use cautious language such as "may," "appears to," "suggests," or "not enough evidence."
* Keep the final profile compact enough to be reused in later prompts.
