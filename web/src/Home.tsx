import { useEffect, useState } from 'react';
import { Calendar, Clock, Heart, Plus, Settings as Cog, Pill, AlertCircle, AlertTriangle, AudioLines } from 'lucide-react';
import { api, fmtTime, Medicine, Member, Occ } from './api';
import { useNav } from './nav';
import { Avatar, Demo, Row, Section } from './ui';

export function HomeScreen({ name, incomingCall }: { name: string; incomingCall: (o: Occ) => void | Promise<void> }) {
  const nav = useNav();
  const [data, setData] = useState<{ stats: any; occurrences: Occ[] } | null>(null);
  const [family, setFamily] = useState<Member[]>([]);
  const [meds, setMeds] = useState<Medicine[]>([]);
  useEffect(() => { api('/today').then(setData); api('/family').then(setFamily); api('/medicines').then(setMeds); }, [nav.tick]);
  if (!data) return <div className="p-5 text-mute">Loading…</div>;

  const hour = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  const occ = data.occurrences;
  const bad = occ.filter(o => ['missed', 'declined', 'failed'].includes(o.state));
  const low = meds.filter(m => m.low_stock && m.status === 'active');
  const upcoming = occ.filter(o => o.state === 'scheduled' || o.state === 'due');
  const empty = family.length === 0 || meds.length === 0;

  return (
    <div className="px-5 pt-4 pb-24">
      <div className="flex justify-between items-center">
        <div><h1 className="hd text-[22px] font-bold">{greet}, {name.split(' ')[0]}</h1><div className="text-[13px] text-mute mt-0.5">{today}</div></div>
        <button aria-label="Settings" onClick={() => nav.push({ name: 'settings' })} className="relative w-11 h-11 rounded-full bg-gradient-to-br from-plum to-[#5A3D6E] flex items-center justify-center"><Cog size={18} color="#fff" />{bad.length > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-danger border-2 border-cream" />}</button>
      </div>

      {empty ? (
        <div className="mt-12 flex flex-col items-center text-center px-5">
          <div className="w-20 h-20 rounded-3xl bg-plum-l flex items-center justify-center"><Pill size={36} color="#39264B" /></div>
          <h2 className="hd text-xl font-bold mt-5">No medicines added yet</h2>
          <p className="text-sm text-mute mt-2">Start by adding medicines for your family members and scheduling reminders.</p>
          <div className="mt-6 w-full space-y-3"><button className="btn-p" onClick={() => nav.push({ name: 'medicine-form' })}>Add first medicine</button>
            <button className="btn-s" onClick={() => nav.push({ name: 'reminder-form' })}>Set up a reminder</button>
            <button className="btn-o" onClick={() => api('/demo/load', 'POST').then(nav.bump)}>Try with demo data</button></div>
        </div>
      ) : <>
        {bad.slice(0, 2).map(o => <div key={o.id} className="mt-3.5 rounded-2xl border-[1.5px] border-danger/20 bg-danger/5 px-4 py-3.5">
          <div className="flex items-center gap-2.5"><AlertCircle size={20} color="#C65B58" /><div><div className="text-[15px] font-medium text-danger">{o.member_name} {o.state === 'missed' ? 'missed' : 'has not taken'} {o.medicine_name} {fmtTime(o.scheduled_for)}</div><div className="text-xs text-mute mt-0.5">{o.state === 'missed' ? 'Voice reminder was not answered' : o.state === 'declined' ? 'Reminder was declined' : 'Reminder call failed'}</div></div></div>
          <div className="flex gap-2 mt-3"><button className="flex-1 h-12 bg-white border border-danger rounded-xl text-[13px] font-medium text-danger" onClick={() => api(`/occurrences/${o.id}/outcome`, 'POST', { outcome: 'taken', source: 'manual' }).then(nav.bump)}>Mark taken</button>
            {o.has_voice ? <button className="h-12 px-4 bg-white border border-line rounded-xl text-[13px] text-mute" onClick={() => incomingCall(o)}>Retry</button> : null}</div></div>)}
        {low.slice(0, 2).map(m => <div key={m.id} className="mt-2.5 rounded-2xl border border-warn/20 bg-warn/5 px-4 py-3 flex items-center gap-2.5"><AlertTriangle size={18} color="#D79A46" />
          <div><div className="text-sm font-medium text-warn">{family.find(f => f.id === m.member_id)?.name}'s {m.name} running low</div><div className="text-xs text-mute">{m.stock_qty} {m.stock_unit} remaining</div></div></div>)}

        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {family.map(f => { const mine = occ.filter(o => o.member_id === f.id && o.kind === 'primary'); const done = mine.filter(o => o.state === 'completed').length; const miss = mine.filter(o => o.state === 'missed').length;
            return <button key={f.id} onClick={() => nav.push({ name: 'family-profile', id: f.id })} className="min-w-[140px] text-left bg-white border border-line rounded-[20px] p-3.5 shrink-0">
              <div className="flex items-center gap-2"><Avatar name={f.name} size={36} /><div><div className="hd text-sm font-semibold">{f.name}</div><div className="text-[11px] text-mute">{f.relationship}</div></div></div>
              <div className="mt-2.5 h-1 bg-line rounded overflow-hidden"><div className={`h-full rounded ${miss ? 'bg-danger' : 'bg-sage'}`} style={{ width: mine.length ? `${done / mine.length * 100}%` : 0 }} /></div>
              <div className={`text-[11px] mt-1.5 ${miss ? 'text-danger' : 'text-sage'}`}>{mine.length ? `${done}/${mine.length} taken${miss ? ` · ${miss} missed` : ''}` : 'No reminders'}</div></button>; })}
        </div>

        <div className="flex gap-2.5 mt-4">{[['Completed', data.stats.completed, 'text-sage'], ['Upcoming', data.stats.upcoming, 'text-plum'], ['Pending', data.stats.pending, 'text-warn']].map(([l, n, c]) =>
          <div key={l as string} className="flex-1 bg-white border border-line rounded-2xl p-3.5 text-center"><div className={`text-2xl font-bold ${c}`}>{n}</div><div className="text-[11px] text-mute mt-0.5">{l}</div></div>)}</div>

        <Section title="Upcoming reminders" action={<button className="text-[13px] text-plum font-medium min-h-[44px]" onClick={() => nav.push({ name: 'reminders' })}>See all</button>}>
          <div className="space-y-2.5">{upcoming.length === 0 && <div className="text-sm text-mute">Nothing more scheduled today.</div>}
            {upcoming.map(o => <Row key={o.id} onClick={o.state === 'due' ? () => incomingCall(o) : undefined}>
              <Avatar name={o.member_name} size={40} /><div className="flex-1"><div className="text-sm font-medium">{o.medicine_name}{o.strength ? ` ${o.strength}` : ''}{o.is_demo ? <Demo /> : null}</div><div className="text-xs text-mute mt-px">{o.member_name} · {fmtTime(o.scheduled_for)}{o.kind !== 'primary' ? ' · follow-up' : ''}</div></div>
              {o.state === 'due' ? <span className="text-xs text-warn font-medium">Due now</span> : o.has_voice ? <span className="flex items-center gap-1 text-[11px] text-plum font-medium"><AudioLines size={14} />Voice</span> : null}</Row>)}</div>
        </Section>

        <Section title="Quick actions"><div className="grid grid-cols-2 gap-2.5">
          {([['Add medicine', Plus, 'bg-plum-l', '#39264B', { name: 'medicine-form' }], ['Set reminder', Clock, 'bg-sage/10', '#718C72', { name: 'reminder-form' }], ['Health reading', Heart, 'bg-peach/30', '#D79A46', { name: 'reading-form' }], ['Appointment', Calendar, 'bg-plum/5', '#39264B', { name: 'appointments' }]] as const).map(([l, Ic, bg, c, r]) =>
            <button key={l} onClick={() => nav.push(r as any)} className="bg-white border border-line rounded-2xl p-4 min-h-[88px] flex flex-col items-center gap-2"><span className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}><Ic size={20} color={c} /></span><span className="text-[13px] font-medium">{l}</span></button>)}</div></Section>
      </>}
    </div>);
}
