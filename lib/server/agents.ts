// Maps a family member to one of the two EXISTING ElevenLabs agents.
// Agent IDs and the API key come only from server environment variables.
export type AgentKey = 'mummy' | 'papa';

export interface AgentConfig {
  apiKey?: string;
  mummyAgentId?: string;
  papaAgentId?: string;
}

const trim = (v?: string) => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function agentConfigFromEnv(env = process.env): AgentConfig {
  return {
    apiKey: trim(env.ELEVENLABS_API_KEY),
    mummyAgentId: trim(env.MUMMY_ELEVENLABS_AGENT_ID),
    papaAgentId: trim(env.PAPA_ELEVENLABS_AGENT_ID),
  };
}

/** Picked once, automatically, when a member is created. Dadi and Durgesh get none. */
export function agentKeyFor(name: string): AgentKey | null {
  const n = name.trim().toLowerCase();
  if (n === 'mummy') return 'mummy';
  if (n === 'papa') return 'papa';
  return null;
}

export class AgentError extends Error {
  constructor(public code: 'no_agent' | 'not_configured' | 'upstream', message: string) {
    super(message);
  }
}

type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/**
 * Asks ElevenLabs for a short-lived signed conversation URL.
 * Documented endpoint: GET /v1/convai/conversation/get-signed-url?agent_id=...  (header xi-api-key)
 */
export async function getSignedUrl(
  agentKey: AgentKey | null,
  cfg: AgentConfig,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<string> {
  if (!agentKey) throw new AgentError('no_agent', 'No voice agent is configured for this family member.');
  const agentId = agentKey === 'mummy' ? cfg.mummyAgentId : cfg.papaAgentId;
  if (!cfg.apiKey || !agentId) throw new AgentError('not_configured', 'The voice agent is not configured on the server.');
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
  let res;
  try {
    res = await fetchFn(url, { headers: { 'xi-api-key': cfg.apiKey } });
  } catch {
    throw new AgentError('upstream', 'Could not reach the voice service.');
  }
  let body: any;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) throw new AgentError('upstream', describeUpstreamRefusal(res.status, body));
  if (!body?.signed_url) throw new AgentError('upstream', 'Voice service returned no session.');
  return body.signed_url as string;
}

function describeUpstreamRefusal(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | undefined)?.detail;
  const obj = detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : undefined;
  const code = typeof obj?.code === 'string' ? obj.code : typeof obj?.status === 'string' ? obj.status : undefined;
  const message = typeof obj?.message === 'string' ? obj.message : typeof detail === 'string' ? detail : undefined;
  const summary = [code, message].filter(Boolean).join(': ');
  if (code === 'api_key_id_used_as_api_key' || /API key ID used as API key/i.test(message ?? '')) {
    return (
      `Voice service refused the request (${status}): ${summary}. ` +
      `ELEVENLABS_API_KEY must be the secret that starts with sk_, not the key ID from the keys list.`
    );
  }
  return summary
    ? `Voice service refused the request (${status}): ${summary}`
    : `Voice service refused the request (${status}).`;
}
