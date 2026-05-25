import type { EventSource } from "../../api/calendar";

type Style = { background: string; border: string; foreground: string };

const palette: Record<EventSource, Style> = {
  google: { background: "#dce6f7", border: "#4285f4", foreground: "#1a3a73" },
  outlook: { background: "#e2dcf7", border: "#7b83eb", foreground: "#332872" },
  manual: { background: "#e9ecf2", border: "#6c8ebf", foreground: "#2d3e5b" },
  scenario_context: { background: "#f3f0e8", border: "#8a7a4f", foreground: "#3f3618" },
  scenario_user: { background: "#fbecd1", border: "#e0a458", foreground: "#6a4915" },
  scenario_agent: { background: "#ecdfff", border: "#8a4fff", foreground: "#3d1d75" },
};

export const styleFor = (source: EventSource) => palette[source] ?? palette.manual;
