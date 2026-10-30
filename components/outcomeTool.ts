// The voice agent reports its result through ONE client tool. This file decides what we accept from it.
// Only these four values can come from the agent. "missed" and "failed" are decided by the app, never by the agent.
export const TOOL_NAME = 'report_medicine_outcome';
const FROM_AGENT = ['taken', 'not_taken', 'follow_up', 'unconfirmed'] as const;
export type AgentOutcome = (typeof FROM_AGENT)[number];
export interface Reported { outcome: AgentOutcome; followUp?: number }

/** Keeps the first valid report of a call; later ones are ignored so a result can't be flipped mid-call. */
export function makeOutcomeCollector() {
  let first: Reported | null = null;
  return {
    get: () => first,
    tool: (p: { outcome?: unknown; follow_up_minutes?: unknown } | undefined): string => {
      const o = p?.outcome;
      if (typeof o !== 'string' || !(FROM_AGENT as readonly string[]).includes(o)) return 'Invalid outcome. Use taken, not_taken, follow_up or unconfirmed.';
      if (first) return 'Outcome already recorded.';
      const m = Number(p?.follow_up_minutes);
      first = { outcome: o as AgentOutcome, followUp: o === 'follow_up' && Number.isFinite(m) ? Math.min(Math.max(Math.round(m), 1), 240) : undefined };
      return 'Outcome recorded.';
    },
  };
}
