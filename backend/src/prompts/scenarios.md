# Task

You will receive a PDF containing a set of scheduling scenarios for a research study, plus the participant's **current weekly calendar** (events that already exist for the current week). Extract every distinct scenario and return a JSON array.

## Read the PDF carefully

- Read the entire document end-to-end before emitting anything. Do not stop early.
- Identify scenarios by structure: numbered headings, bullets, "Scenario X:" markers, or clear paragraph breaks describing a new situation.
- If the PDF lists 7 scenarios, you must return 7. Do not skip, merge, or paraphrase multiple scenarios into one.
- If a scenario is split across pages, stitch it. If two paragraphs describe the *same* situation, treat them as one scenario.
- Preserve concrete details: names, durations, deadlines, options, dates if mentioned. They become the context events.

For each scenario, produce:

1. `title` — short 3-8 word label.
2. `description` — the prose, verbatim or near-verbatim.
3. `prompt_summary` — a one-sentence description of *what is being scheduled / decided* (the asked-about thing, not the situation). Example: *"When to hold the meeting with the colleague."*
4. `context_events` — concrete events that should appear on the participant's calendar as the starting state for this scenario. These are the *commitments* the scenario describes (the trip, the existing meeting, the deadline, the lunch with mom, etc.). They are NOT the thing the participant is being asked to schedule.
5. (Optional) `options` — only when the scenario itself lists discrete time slots (e.g. *"Option A: Mon 10am / Option B: Tue 3pm"*).

## Output schema

Return ONLY a JSON object:

```
{
  "scenarios": [
    {
      "title": "<short label>",
      "description": "<prose verbatim>",
      "prompt_summary": "<one short sentence about what is to be decided>",
      "context_events": [
        { "title": "<short, concrete name>",
          "start": "<ISO 8601 with offset>",
          "end":   "<ISO 8601 with offset>" }
      ],
      "options": [
        { "label": "<e.g. Option A>",
          "suggested_start": "<ISO 8601 with offset>",
          "suggested_end":   "<ISO 8601 with offset>" }
      ]
    }
  ]
}
```

## Hard rules on times

These rules are non-negotiable — violating them ruins the study. Read them twice.

- **Use realistic, waking-hour times.** Default to office / personal-life hours appropriate to the event type:
  - Work meetings, tutoring, supervisor 1:1s, project work → between **08:00 and 19:00 local time**, never at night, never at 03:00 or 04:00.
  - Personal events (lunch with mom, gym, errands) → between **07:00 and 22:00 local time**.
  - Travel / trip blocks (weekend trip, conference) → may span multi-day blocks, starting an evening (e.g. 17:00–19:00 Friday) and ending an evening (e.g. 20:00–22:00 Sunday). Never 02:00.
  - Sleep / overnight stay is fine for multi-day trips but NEVER as a standalone "meeting" event.
- **Anchor every time to the upcoming Monday of the CURRENT week** in the participant's local timezone. The "current week" is given to you in the input as `current_week.monday_iso`.
- **Stay inside that week.** All `start` / `end` times must fall between `current_week.monday_iso` (00:00 local) and the following Sunday (23:59 local). If a scenario implies multi-week structure, anchor it within this week anyway.
- **Avoid overlapping the participant's existing calendar events.** You are given `existing_events` for the current week. Place context events in slots that are CURRENTLY FREE, unless the scenario explicitly says the context event conflicts with existing work (e.g. "you've already committed to the trip" while the trip is on the calendar — in which case don't add a duplicate).
- **Default timezone**: use the offset present in `existing_events`. If no events exist, default to `Europe/Rome`.

## Other rules

- `context_events` may be empty when the scenario describes no concrete pre-existing constraints. Be generous though — most narrative scenarios have implied constraints worth surfacing (e.g. *"you've planned a weekend trip"* → emit a Weekend trip event).
- Be CONCRETE in titles. *"Lunch with mom"* beats *"personal commitment"*. Use the scenario's own language.
- Preserve the original wording of each scenario in `description`. Do not moralise or rephrase.
- Return ONLY the JSON object. No markdown fences. No commentary. No extra keys.

## Worked example

Input scenario: *"You've planned a weekend trip, but a colleague asks to schedule a meeting to get help with a last-minute project."*

With `current_week.monday_iso = "2026-06-01T00:00:00+02:00"` and one existing event `{ title: "Team standup", start: 2026-06-01T09:00+02:00, end: 2026-06-01T09:30+02:00 }`, you should produce something like:

```
{
  "title": "Weekend trip vs. colleague's last-minute meeting",
  "description": "You've planned a weekend trip, but a colleague asks to schedule a meeting to get help with a last-minute project. How would you respond, and why?",
  "prompt_summary": "When (or whether) to schedule the meeting with the colleague given the weekend trip.",
  "context_events": [
    { "title": "Weekend trip",
      "start": "2026-06-05T17:00:00+02:00",
      "end":   "2026-06-07T20:00:00+02:00" }
  ]
}
```

The trip starts Friday evening (17:00) and ends Sunday evening (20:00) — realistic hours. It doesn't overlap the existing Monday standup. The participant will later drag a "Schedule the meeting" card or create a new event somewhere outside the trip.
