import { useEffect, useState } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { api, Appt, fmtDate, fmtTime, Member } from './api';
import { useNav } from './nav';
import { Demo, Err, Field, Header, Row } from './ui';

export function AppointmentList() {
  const nav = useNav(); const [list, setList] = useState<Appt[]>([]); const [tab, setTab] = useState<'up' | 'past'>('up');
  useEffect(() => { api<Appt[]>('/appointments').then(setList); }, [nav.tick]);
  const now = Date.now();
  const rows = list.filter(a => tab === 'up' ? a.status === 'scheduled' && +new Date(a.starts_at) >= now : a.status === 'cancelled' || +new Date(a.starts_at) < now);
  if (tab === 'past') rows.reverse();
  return (
    <div className="px-5 pb-10"><Header title="Appointments" onBack={nav.pop} right={<button aria-label="Add appointment" onClick={() => nav.push({ name: 'appointment-form' })} className="w-11 h-11 rounded-full bg-plum flex items-center justify-center"><Plus size={20} color="#fff" /></button>} />
      <div className="flex gap-2 mt-4">{([['up', 'Upcoming'], ['past', 'Past']] as const).map(([k, l]) => <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="space-y-2.5 mt-4">{rows.length === 0 && <div className="text-sm text-mute py-8 text-center">No appointments.</div>}
        {rows.map(a => <Row key={a.id} onClick={() => nav.push({ name: 'appointment-detail', id: a.id })}><div className="w-10 h-10 rounded-xl bg-plum-l flex items-center justify-center"><Calendar size={18} color="#39264B" /></div>
          <div className="flex-1"><div className="text-sm font-medium">{a.doctor}{a.is_demo ? <Demo /> : null}</div><div className="text-xs text-mute">{a.member_name} · {fmtDate(a.starts_at)} {fmtTime(a.starts_at)}{a.status === 'cancelled' ? ' · cancelled' : ''}</div></div></Row>)}</div></div>);
}

export function AppointmentDetail({ id }: { id: string }) {
  const nav = useNav(); const [a, setA] = useState<Appt>();
  const load = () => api<Appt[]>('/appointments').then(l => setA(l.find(x => x.id === id)));
  useEffect(() => { load(); }, [id]);
  if (!a) return null;
  return (
    <div className="px-5 pb-10"><Header onBack={nav.pop} right={<button className="text-sm text-plum font-medium min-h-[48px] px-2" onClick={() => nav.push({ name: 'appointment-form', id })}>Edit</button>} />
      <h1 className="hd text-2xl font-bold mt-3">{a.doctor}{a.is_demo ? <Demo /> : null}</h1><div className="text-sm text-mute">{a.clinic}</div>
      <div className="crd mt-5 space-y-2.5 text-sm">{[['For', a.member_name], ['Date', fmtDate(a.starts_at)], ['Time', fmtTime(a.starts_at)], ['Voice reminder', a.voice_enabled ? 'On' : 'Off'], ['Status', a.status], ['Notes', a.notes || '—']].map(([k, v]) => <div key={k} className="flex justify-between gap-4"><span className="text-mute">{k}</span><span className="font-medium text-right">{v}</span></div>)}</div>
      {a.status === 'scheduled' && <div className="mt-6"><button className="btn-d" onClick={() => api(`/appointments/${id}`, 'PATCH', { status: 'cancelled' }).then(() => { nav.bump(); nav.pop(); })}>Cancel appointment</button></div>}</div>);
}

export function AppointmentForm({ id }: { id?: string }) {
  const nav = useNav(); const [fam, setFam] = useState<Member[]>([]); const [err, setErr] = useState('');
  const [f, setF] = useState({ member_id: '', doctor: '', clinic: '', date: '', time: '10:00', notes: '', voice: true });
  useEffect(() => { api<Member[]>('/family').then(l => { setFam(l); setF(p => ({ ...p, member_id: p.member_id || l[0]?.id || '' })); });
    if (id) api<Appt[]>('/appointments').then(l => { const a = l.find(x => x.id === id); if (a) { const d = new Date(a.starts_at); const s = new Date(d.getTime() + 330 * 60000).toISOString(); setF({ member_id: a.member_id, doctor: a.doctor, clinic: a.clinic ?? '', date: s.slice(0, 10), time: s.slice(11, 16), notes: a.notes ?? '', voice: !!a.voice_enabled }); } }); }, [id]);
  const save = async () => {
    const starts_at = new Date(`${f.date}T${f.time}:00+05:30`);
    if (!f.doctor.trim() || isNaN(+starts_at)) return setErr('Please enter the doctor and a date.');
    const body = { doctor: f.doctor, clinic: f.clinic || undefined, starts_at: starts_at.toISOString(), notes: f.notes || undefined, voice_enabled: f.voice };
    try { id ? await api(`/appointments/${id}`, 'PATCH', body) : await api('/appointments', 'POST', { ...body, member_id: f.member_id }); nav.bump(); nav.pop(); } catch { setErr('Could not save the appointment.'); }
  };
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="px-5 pb-10"><Header title={id ? 'Edit appointment' : 'Add appointment'} onBack={nav.pop} />
      <div className="space-y-3.5 mt-5">
        {!id && <Field label="Family member"><div className="flex flex-wrap gap-2">{fam.map(m => <button key={m.id} className={`chip ${f.member_id === m.id ? 'on' : ''}`} onClick={() => setF({ ...f, member_id: m.id })}>{m.name}</button>)}</div></Field>}
        <Field label="Doctor name"><input className="inp" value={f.doctor} onChange={s('doctor')} /></Field>
        <Field label="Clinic or hospital"><input className="inp" value={f.clinic} onChange={s('clinic')} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Date"><input type="date" className="inp" value={f.date} onChange={s('date')} /></Field><Field label="Time"><input type="time" className="inp" value={f.time} onChange={s('time')} /></Field></div>
        <Field label="Notes"><textarea className="inp h-24 py-3" value={f.notes} onChange={s('notes')} /></Field>
        <label className="flex items-center justify-between min-h-[48px] text-sm"><span>Voice reminder</span><input type="checkbox" className="w-5 h-5 accent-[#39264B]" checked={f.voice} onChange={e => setF({ ...f, voice: e.target.checked })} /></label>
        <Err msg={err} /></div>
      <div className="mt-6"><button className="btn-p" onClick={save}>Save appointment</button></div></div>);
}
