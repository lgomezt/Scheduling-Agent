import type { EventSource } from "../../api/calendar";

type Style = { background: string; border: string; foreground: string };

/**
 * Calendar event palette. Built in OKLCH at three fixed lightness stops:
 *   - background L=92%
 *   - border     L=55%
 *   - foreground L=25%
 * Hue carries semantics; chroma carries emphasis.
 *
 * Hue map:
 *   google           250  blue
 *   outlook          280  indigo
 *   manual           240  blue-gray (low chroma)
 *   scenario_context 120  sage / olive
 *   scenario_user     70  amber
 *   scenario_agent   300  purple
 *
 * scenario_user (70) and scenario_context (120) are >40 hue apart so a
 * user-placed event never reads as a PDF-extracted context event.
 */
const palette: Record<EventSource, Style> = {
  google:           { background: "oklch(92% 0.05 250)", border: "oklch(55% 0.18 250)", foreground: "oklch(25% 0.10 250)" },
  outlook:          { background: "oklch(92% 0.05 280)", border: "oklch(55% 0.18 280)", foreground: "oklch(25% 0.10 280)" },
  manual:           { background: "oklch(94% 0.01 240)", border: "oklch(55% 0.04 240)", foreground: "oklch(28% 0.02 240)" },
  scenario_context: { background: "oklch(93% 0.04 120)", border: "oklch(50% 0.10 120)", foreground: "oklch(25% 0.06 120)" },
  scenario_user:    { background: "oklch(93% 0.06  70)", border: "oklch(58% 0.15  70)", foreground: "oklch(28% 0.10  70)" },
  scenario_agent:   { background: "oklch(93% 0.06 300)", border: "oklch(55% 0.20 300)", foreground: "oklch(25% 0.12 300)" },
};

export const styleFor = (source: EventSource) => palette[source] ?? palette.manual;
