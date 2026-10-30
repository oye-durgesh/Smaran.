import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Check, MicOff, Phone, Volume2, X } from 'lucide-react';
import { api, ApiError, fmtTime, Occ } from './api';
import { makeOutcomeCollector, TOOL_NAME } from './outcomeTool';

type Phase = 'incoming' | 'connecting' | 'active' | 'processing' | 'outcome' | 'failed' | 'declined' | 'no_agent';
const OUTCOME_LABEL: Record<string, string> = { taken: 'Medicine taken', not_taken: 'Not taken yet', follow_up: 'Follow-up set', unconfirmed: 'Not confirmed', missed: 'Missed', failed: 'Call failed' };

const Orb = ({ size = 130, rings = true }: { size?: number; rings?: boolean }) => (
  <div className="rounded-full bg-gradient-to-br from-peach to-warn flex items-center justify-center relative orb" style={{ width: size, height: size }}>
    {rings && [16, 32].map((o, i) => <div key={o} className="absolute rounded-full border border-peach/20 pulse" style={{ inset: -o, animationDelay: `${i * .4}s` }} />)}
    <svg width={size * .4} height={size * .4} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" /></svg>
  </div>
);

export function CallFlow({ occ, onDone }: { occ: Occ; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('incoming');
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<{ outcome: string; followUp?: number } | null>(null);
  const collector = useRef(makeOutcomeCollector());
  const started = useRef(0);
  const ended = useRef(false);
  const [muted, setMuted] = useState(false);

  // NOTE: no onMessage handler on purpose. Spoken text is never read, shown or stored.
  const convo = useConversation({
    micMuted: muted,
    // Only works if the existing agent already has a client tool with this exact name configured.
    clientTools: { [TOOL_NAME]: (p: any) => collector.current.tool(p) },
    onConnect: () => { started.current = Date.now(); setPhase('active'); api(`/occurrences/${occ.id}/connected`, 'POST').catch(() => {}); },
    onDisconnect: () => finish(),
    onError: () => { if (!ended.current) fail('The connection dropped.'); },
  } as any);

  const fail = useCallback((m: string) => {
    ended.current = true; setMsg(m); setPhase('failed');
    api(`/occurrences/${occ.id}/failed`, 'POST').catch(() => {});
  }, [occ.id]);

  const finish = useCallback(async () => {
    if (ended.current) return; ended.current = true;
    setPhase('processing');
    const durationSec = started.current ? Math.round((Date.now() - started.current) / 1000) : 0;
    setSecs(durationSec);
    await api(`/occurrences/${occ.id}/processing`, 'POST').catch(() => {});
    const r = collector.current.get();
    if (r) {
      await api(`/occurrences/${occ.id}/outcome`, 'POST', { outcome: r.outcome, source: 'agent', durationSec, followUpMinutes: r.followUp }).catch(() => {});
      setResult(r);
    } else {
      // The agent gave no structured result, so nothing is assumed. The administrator confirms below.
      setResult({ outcome: 'unconfirmed' });
      await api(`/occurrences/${occ.id}/outcome`, 'POST', { outcome: 'unconfirmed', source: 'agent', durationSec }).catch(() => {});
    }
    setPhase('outcome');
  }, [occ.id]);

  useEffect(() => { if (phase !== 'active') return; const t = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(t); }, [phase]);
  useEffect(() => () => { convo.endSession?.().catch?.(() => {}); }, []); // eslint-disable-line

  const answer = async () => {
    setPhase('connecting');
    try {
      const { signedUrl } = await api<{ signedUrl: string }>(`/occurrences/${occ.id}/answer`, 'POST');
      await convo.startSession({ signedUrl } as any); // opens the microphone only now
    } catch (e) {
      if (e instanceof ApiError && e.body?.error === 'no_agent') { setMsg(e.message); setPhase('no_agent'); return; }
      if (!ended.current) fail(e instanceof ApiError ? e.message : 'Could not start the voice call. Check microphone permission.');
    }
  };
  const decline = async () => { await api(`/occurrences/${occ.id}/decline`, 'POST').catch(() => {}); setPhase('declined'); };
  const end = async () => { try { await convo.endSession(); } catch { /* ignore */ } finish(); };
  const confirmManual = async (outcome: string) => {
    await api(`/occurrences/${occ.id}/outcome`, 'POST', { outcome, source: 'manual', followUpMinutes: outcome === 'follow_up' ? 15 : undefined }).catch(() => {});
    setResult({ outcome }); 
  };

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const speaking = convo.isSpeaking;
  const pill = `${occ.medicine_name}${occ.strength ? ' ' + occ.strength : ''} · ${fmtTime(occ.scheduled_for)}`;

  if (phase === 'outcome' || phase === 'declined' || phase === 'failed' || phase === 'no_agent') {
    const decided = result && result.outcome !== 'unconfirmed';
    const title = phase === 'declined' ? 'Reminder declined' : phase === 'failed' ? 'Connection failed' : phase === 'no_agent' ? 'No voice agent' : OUTCOME_LABEL[result?.outcome ?? 'unconfirmed'];
    const sub = phase === 'declined' ? 'The medicine stays pending. We will remind again shortly.' : phase === 'failed' ? msg : phase === 'no_agent' ? msg : decided ? `${occ.member_name} · ${occ.medicine_name}` : `The call ended without a clear answer. Did ${occ.member_name} take ${occ.medicine_name}?`;
    const good = result?.outcome === 'taken';
    return (
      <div className="fixed inset-0 z-50 bg-cream overflow-y-auto"><div className="max-w-[430px] mx-auto px-6 pt-16 pb-10">
        <div className="text-center">
          <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${good ? 'bg-sage/10' : 'bg-warn/10'}`} style={{ animation: 'check-pop .5s ease-out' }}>
            {good ? <Check size={28} color="#718C72" strokeWidth={2} /> : <X size={28} color="#D79A46" />}</div>
          <h2 className="hd text-xl font-bold mt-3.5">{title}</h2>
          <p className="text-sm text-mute mt-1">{sub}</p>
        </div>
        {phase === 'outcome' && <div className="mt-6 space-y-2.5">
          <div className="crd flex justify-between"><span className="text-[13px] text-mute">Outcome</span><span className="text-sm font-medium">{OUTCOME_LABEL[result?.outcome ?? 'unconfirmed']}</span></div>
          <div className="crd flex justify-between"><span className="text-[13px] text-mute">Duration</span><span className="text-sm font-medium">{mmss}</span></div>
        </div>}
        {phase === 'outcome' && !decided && <div className="mt-6 space-y-2.5">
          <button className="btn-p" onClick={() => confirmManual('taken').then(onDone)}>Yes, medicine taken</button>
          <button className="btn-s" onClick={() => confirmManual('follow_up').then(onDone)}>Remind again in 15 minutes</button>
          <button className="btn-o" onClick={() => confirmManual('not_taken').then(onDone)}>Not taken</button>
        </div>}
        {(decided || phase !== 'outcome') && <div className="mt-6"><button className="btn-p" onClick={onDone}>Done</button></div>}
      </div></div>);
  }

  return (
    <div className="fixed inset-0 z-50 call-bg text-white">
      <div className="max-w-[430px] mx-auto h-full flex flex-col items-center px-7 py-10">
        {phase === 'active' && <div className="flex items-center gap-2 mt-4"><span className="w-1.5 h-1.5 rounded-full bg-sage" /><span className="text-sm tracking-widest text-cream/50">{mmss}</span><span className="text-xs text-cream/40 ml-2">Connected</span></div>}
        <div className="flex-1 flex flex-col items-center justify-center">
          {phase === 'incoming' && <div className="text-xs tracking-[.1em] font-medium text-cream/50 mb-7">INCOMING VOICE REMINDER</div>}
          <Orb size={phase === 'active' ? 140 : 130} rings={phase !== 'connecting'} />
          <div className="hd text-[28px] font-bold mt-6">Sathi</div>
          {phase === 'incoming' && <><div className="text-sm text-cream/60 mt-2">Voice reminder for {occ.member_name}</div>
            <div className="mt-1.5 px-4 py-1.5 bg-white/10 rounded-full text-sm text-cream/80 font-medium">{pill}</div></>}
          {phase === 'connecting' && <><div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white mt-3" style={{ animation: 'spin 1s linear infinite' }} /><div className="text-base text-cream/80 mt-3">Connecting…</div><div className="text-[13px] text-cream/50 mt-1.5">{occ.member_name} · {occ.medicine_name}</div></>}
          {phase === 'active' && <>
            <div className="text-sm text-cream/70 mt-1.5">{occ.member_name} · {occ.medicine_name}</div>
            <div className="text-sm text-cream/70 mt-3" aria-live="polite">{speaking ? 'Speaking…' : 'Listening…'}</div>
            <div className="flex gap-1 items-center mt-4 h-7">{[0, .08, .16, .24, .32, .4].map(d => <span key={d} className="bar" style={{ animationDelay: `${d}s`, animationPlayState: speaking ? 'running' : 'paused', height: speaking ? undefined : 8, opacity: speaking ? 1 : .5 }} />)}</div></>}
          {phase === 'processing' && <div className="text-base text-cream/80 mt-4">Processing outcome…</div>}
        </div>
        {phase === 'incoming' && <div className="flex gap-12 mb-6">
          <button onClick={decline} className="flex flex-col items-center gap-2"><span className="w-16 h-16 rounded-full bg-danger flex items-center justify-center"><Phone size={28} className="rotate-[135deg]" /></span><span className="text-[13px] text-cream/70">Decline</span></button>
          <button onClick={answer} className="flex flex-col items-center gap-2"><span className="w-16 h-16 rounded-full bg-sage flex items-center justify-center"><Phone size={28} /></span><span className="text-[13px] text-cream/70">Answer</span></button>
        </div>}
        {phase === 'active' && <div className="flex gap-8 pb-7">
          <button onClick={() => setMuted(m => !m)} className="flex flex-col items-center gap-1.5"><span className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? 'bg-white text-plum' : 'bg-white/10'}`}><MicOff size={22} /></span><span className="text-[11px] text-cream/60">Mute</span></button>
          <button onClick={() => convo.setVolume?.({ volume: 1 })} className="flex flex-col items-center gap-1.5"><span className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"><Volume2 size={22} /></span><span className="text-[11px] text-cream/60">Speaker</span></button>
          <button onClick={end} className="flex flex-col items-center gap-1.5"><span className="w-14 h-14 rounded-full bg-danger flex items-center justify-center"><Phone size={22} className="rotate-[135deg]" /></span><span className="text-[11px] text-cream/60">End</span></button>
        </div>}
      </div>
    </div>);
}
