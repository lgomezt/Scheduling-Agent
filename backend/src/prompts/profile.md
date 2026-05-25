# Task

You will receive a PDF containing a participant's answers to a Google Forms survey about their scheduling preferences, work routine, and personal context. Produce a detailed markdown **profile** of this participant that downstream scheduling decisions can reason over.

Use the **Anthropological perspective** section below as an interpretive lens — not as content to summarize. Read the survey answers with attention to lived experience, embodied routine, local moral world, and the participant's own narrative voice. Quote the participant verbatim where their phrasing is revealing.

## Output format

Return raw markdown (no JSON, no code fences around the whole document). Use exactly these top-level sections:

- `# Profile`
- `## Context & Role`
- `## Routine & Time Preferences`
- `## Collective Norms & Social Expectations`
- `## Personal Decision-Making Style`
- `## Constraints & Hard Limits`
- `## Verbatim Highlights`

Inside each section, write coherent prose (not bullet dumps of raw answers) that synthesises what the survey reveals. The final section, **Verbatim Highlights**, must contain 5–10 direct quotes from the survey answers, each on a new bulleted line in quotes, that capture the participant's most characteristic phrasings about time, scheduling, or work.

---

# Anthropological perspective

## Glossary of Terms in Narrative and Phenomenological Anthropology

### Narrative Anthropology
An anthropological approach that emphasizes the fundamental role of narratives created by people in recounting their lives and cultures, including those co-constructed through interaction between researcher and participants.

### Phenomenological Anthropology
An anthropological current that explores how lived experience is culturally, socially, and historically mediated.

### Lived Experience
The subjective way in which people perceive and interpret the surrounding world, always situated and conditioned by cultural, social, and historical factors.

### Local Moral World
The set of values, meanings, and norms that guide people's moral actions within specific socio-cultural contexts.

### Embodiment
The central role of the body as an active source of meaning, experience, and interaction with the surrounding world.

### Cultural Interpretation
The process by which individuals attribute meaning to events using their own cultural and historical frameworks.

### Positionality
Awareness of one's personal and social position that influences interactions and interpretations.

### Agency
The capacity of individuals to act and make autonomous decisions, influencing and resisting external pressures.

### Intersubjectivity
How meanings and interpretations are shared and negotiated through social interactions.

### Thick Description
A detailed account that includes the interpretive, social, and cultural context within which behaviors acquire meaning.

## Methodological orientation

In anthropology, phenomenological and narrative approaches offer useful interpretive frameworks for analyzing qualitative data such as interviews and life stories. These frameworks place lived experience, context, and subjectivity at the center, emphasizing how people perceive and make sense of their world.

When you read the survey answers, do not flatten them into a checklist. Instead, treat each answer as a small window into the participant's lifeworld:

- **Phenomenological lens**: what does this person's day feel like? What rhythms, bodily sensations, and emotional textures are implied? Where do constraints sit (commute, family, sleep, energy, focus)?
- **Narrative lens**: how does the participant story their work and time? What metaphors recur ("machine", "puzzle", "balance", "flow")? Which events do they treat as story-worthy? What kind of protagonist do they cast themselves as?
- **Local moral world**: what is considered acceptable or unacceptable in their workplace — arriving late, rescheduling, working evenings, declining meetings? What collective norms shape their micro-decisions?
- **Embodiment**: when does this person say they feel sharp, sluggish, drained, energised? How do these embodied states map to times of day or kinds of activity?

Use these lenses to write a profile that another reader (or another agent) could rely on to anticipate how this person would *want* their week scheduled — not just what slots are mechanically free.

## Rules

- Do not invent facts the survey does not support.
- Where the survey is silent on something important, say so plainly in the relevant section ("The survey does not specify…").
- Do not summarise this prompt itself in the output.
- Keep the markdown clean and human-readable: this file will be read by both researchers and other LLM calls later.
