import { useEffect, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { api, hhmm12, Medicine, Member } from './api';
import { useNav } from './nav';
import { Err, Field, Header, Row, Demo } from './ui';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function RemindersList() {
  const nav = useNav();
  const [list, setList] = useState<any[]>([]);
  const load = () => api('/reminders').then(setList);
  useEffect(() => { load(); }, [nav.tick]);
  const desc = (r: any) => r.repeat === 'once' ? `Once · ${r.date}` : r.repeat === 'daily' ? 'Every day' : r.weekdays.map((d: number) => DAYS[d]).join(' ');
  return (
    <div className="px-5 pb-10"><Header title="Reminders" onBack={nav.pop} right={<button className="text-sm text-plum font-medium min-h-[48px] px-2" onClick={() => nav.push({ name: 'reminder-form' })}>New</button>} />
      <div className="space-y-2.5 mt-4">{list.length === 0 && <div className="text-sm text-mute py-8 text-center">No reminders yet.</div>}
        {list.map(r => <Row key={r.id}>
          <div className="flex-1"><div className="text-sm font-medium">{r.medicine_name} {r.strength}{r.is_demo ? <Demo /> : null}</div><div className="text-xs text-mute">{r.member_name} · {hhmm12(r.time)} · {desc(r)}{r.status === 'paused' ? ' · paused' : ''}</div></div>
          <button aria-label={r.status === 'paused' ? 'Resume' : 'Pause'} className="w-11 h-11 flex items-center justify-center text-plum" onClick={() => api(`/reminders/${r.id}`, 'PATCH', { status: r.status === 'paused' ? 'active' : 'paused' }).then(load)}>{r.status === 'paused' ? <Play size={18} /> : <Pause size={18} />}</button>
          <button aria-label="Cancel reminder" className="w-11 h-11 flex items-center justify-center text-danger" onClick={() => api(`/reminders/${r.id}`, 'PATCH', { status: 'cancelled' }).then(load)}><Trash2 size={18} /></button>
        </Row>)}</div></div>);
}

export function ReminderForm({ medicineId }: { medicineId?: string }) {
  const nav = useNav();
  const [fam, setFam] = useState<Member[]>([]); const [meds, setMeds] = useState<Medicine[]>([]);
  const [medId, setMedId] = useState(medicineId ?? ''); const [memId, setMemId] = useState('');
  const [time, setTime] = useState('08:00'); const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekdays'>('daily');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [voice, setVoice] = useState(true); const [conv, setConv] = useState(true); const [err, setErr] = useState('');
  useEffect(() => { api<Member[]>('/family').then(setFam); api<Medicine[]>('/medicines').then(l => { setMeds(l); const m = l.find(x => x.id === medicineId); if (m) setMemId(m.member_id); }); }, [medicineId]);
  useEffect(() => { if (!memId && fam[0]) setMemId(fam[0].id); }, [fam, memId]);
  const mine = meds.filter(m => m.member_id === memId && m.status === 'active');
  useEffect(() => { if (!mine.find(m => m.id === medId)) setMedId(mine[0]?.id ?? ''); }, [memId, meds]); // eslint-disable-line
  const member = fam.find(f => f.id === memId);
  const save = async () => {
    try { await api('/reminders', 'POST', { medicine_id: medId, member_id: memId, time, repeat, date: repeat === 'once' ? date : undefined, weekdays: repeat === 'weekdays' ? days : [], voice_enabled: voice, conversation_enabled: conv && !!member?.has_voice }); nav.bump(); nav.pop(); }
    catch { setErr('Please pick a medicine, a time and (if needed) days.'); }
  };
  return (
    <div className="px-5 pb-10"><Header title="Set reminder" onBack={nav.pop} />
      <div className="space-y-3.5 mt-5">
        <Field label="Family member"><div className="flex flex-wrap gap-2">{fam.map(f => <button key={f.id} className={`chip ${memId === f.id ? 'on' : ''}`} onClick={() => setMemId(f.id)}>{f.name}</button>)}</div></Field>
        <Field label="Medicine">{mine.length === 0 ? <div className="text-sm text-mute">No active medicines for this person yet.</div> : <select className="inp" value={medId} onChange={e => setMedId(e.target.value)}>{mine.map(m => <option key={m.id} value={m.id}>{m.name} {m.strength}</option>)}</select>}</Field>
        <Field label="Time (India time)"><input type="time" className="inp" value={time} onChange={e => setTime(e.target.value)} /></Field>
        <Field label="Repeat"><div className="flex gap-2">{([['once', 'One time'], ['daily', 'Daily'], ['weekdays', 'Select days']] as const).map(([k, l]) => <button key={k} className={`chip ${repeat === k ? 'on' : ''}`} onClick={() => setRepeat(k)}>{l}</button>)}</div></Field>
        {repeat === 'once' && <Field label="Date"><input type="date" className="inp" value={date} onChange={e => setDate(e.target.value)} /></Field>}
        {repeat === 'weekdays' && <div className="flex gap-1.5">{DAYS.map((d, i) => <button key={i} aria-label={`Day ${i}`} className={`w-11 h-11 rounded-full text-sm font-medium border ${days.includes(i) ? 'bg-plum text-white border-plum' : 'bg-white border-line text-mute'}`} onClick={() => setDays(days.includes(i) ? days.filter(x => x !== i) : [...days, i])}>{d}</button>)}</div>}
        <label className="flex items-center justify-between min-h-[48px] text-sm"><span>Voice reminder (incoming call screen)</span><input type="checkbox" className="w-5 h-5 accent-[#39264B]" checked={voice} onChange={e => setVoice(e.target.checked)} /></label>
        <label className="flex items-center justify-between min-h-[48px] text-sm"><span>Conversation with Sathi {member && !member.has_voice && <span className="text-xs text-mute">(no voice agent for {member.name})</span>}</span><input type="checkbox" disabled={!member?.has_voice} className="w-5 h-5 accent-[#39264B]" checked={conv && !!member?.has_voice} onChange={e => setConv(e.target.checked)} /></label>
        <Err msg={err} />
      </div><div className="mt-6"><button className="btn-p" disabled={!medId} onClick={save}>Save reminder</button></div></div>);
}
