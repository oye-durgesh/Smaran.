// Run:  npm run check:voice            (checks that the three values are filled in; makes NO network call)
//       npm run check:voice -- --live  (also asks ElevenLabs for a signed link for each agent; starts NO call)
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentConfigFromEnv, agentKeyFor, getSignedUrl } from '../lib/server/agents.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local') });
const cfg = agentConfigFromEnv();
const live = process.argv.includes('--live');
let bad = 0;
const line = (ok: boolean, msg: string) => { if (!ok) bad++; console.log(`${ok ? 'OK     ' : 'MISSING'}  ${msg}`); };

line(!!cfg.apiKey, 'ELEVENLABS_API_KEY');
if (cfg.apiKey && !cfg.apiKey.startsWith('sk_')) {
  line(false, 'ELEVENLABS_API_KEY looks like a key ID. Use the secret shown once at create/rotate time (starts with sk_).');
}
line(!!cfg.mummyAgentId, 'MUMMY_ELEVENLABS_AGENT_ID');
line(!!cfg.papaAgentId, 'PAPA_ELEVENLABS_AGENT_ID');
if (cfg.mummyAgentId && cfg.mummyAgentId === cfg.papaAgentId) line(false, 'Mummy and Papa must use DIFFERENT agent IDs');

console.log('\nWho gets which agent:');
for (const n of ['Mummy', 'Papa', 'Dadi', 'Durgesh']) console.log(`  ${n.padEnd(8)} -> ${agentKeyFor(n) ?? 'no agent'}`);

if (live && bad === 0) {
  console.log('\nLive check (no call is started):');
  for (const key of ['mummy', 'papa'] as const) {
    try { await getSignedUrl(key, cfg); console.log(`OK       ${key}: ElevenLabs accepted the key and agent ID`); }
    catch (e) { bad++; console.log(`FAILED   ${key}: ${(e as Error).message}`); }
  }
} else if (live) console.log('\nFix the missing values above first, then run the live check again.');
else console.log('\nNext: run  npm run check:voice -- --live  to test the key and agent IDs against ElevenLabs.');
process.exit(bad ? 1 : 0);
