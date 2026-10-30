import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, hhmm12, Medicine, Member } from './api';
import { useNav } from './nav';
import { Avatar, Demo, Err, Field, Header, Row, Section } from './ui';

const FREQ: Record<string, [string, number]> = { once_daily: ['Once daily', 1], twice_daily: ['Twice daily', 2], three_daily: ['Three times daily', 3], custom: ['Custom', 1] };
const SLOTS: [string, string][] = [['Morning', '08:00'], ['Afternoon', '14:00'], ['Evening', '18:00'], ['Night', '21:00']];
const FOOD: Record<string, string> = { before: 'Before food', after: 'After food', with: 'With food', not_specified: 'Not specified' };

export function MedicinesTab() {
  const nav = useNav();
  const [meds, setMeds] = useState<Medicine[]>([]); const [fam, setFam] = useState<Member[]>([]);
  const [who, setWho] = useState('all'); const [tab, setTab] = useState<'active' | 'discontinued'>('active'); const [q, setQ] = useState('');
  useEffect(() => { api('/medicines').then(setMeds); api('/family').then(setFam); }, [nav.tick]);
  const list = meds.filter(m => m.status === tab && (who === 'all' || m.member_id === who) && m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="px-5 pt-4 pb-24">
      <div className="flex justify-between items-center"><h1 className="hd text-[22px] font-bold">Medicines</h1>
        <button aria-label="Add medicine" onClick={() => nav.push({ name: 'medicine-form' })} className="w-11 h-11 rounded-full bg-plum flex items-center justify-center"><Plus size={20} color="#fff" /></button></div>
      <div className="relative mt-4"><Search size={16} className="absolute left-4 top-[18px] text-mute" /><input className="inp pl-10" placeholder="Search medicines" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">{[{ id: 'all', name: 'All' }, ...fam].map(f => <button key={f.id} className={`chip shrink-0 ${who === f.id ? 'on' : ''}`} onClick={() => setWho(f.id)}>{f.name}</button>)}</div>
      <div className="flex gap-2 mt-2">{(['active', 'discontinued'] as const).map(t => <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t === 'active' ? 'Active' : 'Discontinued'}</button>)}</div>
      <div className="space-y-2.5 mt-4">{list.length === 0 && <div className="text-sm text-mute py-8 text-center">No medicines here yet.</div>}
        {list.map(m => <Row key={m.id} onClick={() => nav.push({ name: 'medicine-detail', id: m.id })}>
          <Avatar name={fam.find(f => f.id === m.member_id)?.name ?? '?'} size={40} />
          <div className="flex-1"><div className="text-sm font-medium">{m.name} {m.strength}{m.is_demo ? <Demo /> : null}</div><div className="text-xs text-mute">{fam.find(f => f.id === m.member_id)?.name} · {m.times.map(hhmm12).join(', ') || FREQ[m.frequency][0]}</div></div>
          <span className={`text-xs font-medium ${m.low_stock ? 'text-warn' : 'text-mute'}`}>{m.stock_qty} left</span></Row>)}</div>
    </div>);
}

export function MedicineDetail({ id }: { id: string }) {
  const nav = useNav();
  const [m, setM] = useState<Medicine>(); const [fam, setFam] = useState<Member[]>([]); const [qty, setQty] = useState('');
  const load = () => api<Medicine[]>('/medicines').then(l => setM(l.find(x => x.id === id)));
  useEffect(() => { load(); api('/family').then(setFam); }, [id, nav.tick]);
  if (!m) return null;
  const adjust = async (n: number) => { await api(`/medicines/${id}`, 'PATCH', { stock_qty: Math.max(0, m.stock_qty + n) }); load(); };
  return (
    <div className="px-5 pb-10"><Header onBack={nav.pop} right={<button className="text-sm text-plum font-medium min-h-[48px] px-2" onClick={() => nav.push({ name: 'medicine-form', id })}>Edit</button>} />
      <h1 className="hd text-2xl font-bold mt-3">{m.name} {m.strength}{m.is_demo ? <Demo /> : null}</h1>
      <div className="text-sm text-mute">{fam.find(f => f.id === m.member_id)?.name} · {m.status}</div>
      <div className="crd mt-5 divide-y divide-line [&>div]:py-2.5 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
        {[['Dosage', m.dosage || '—'], ['Frequency', FREQ[m.frequency][0]], ['Times', m.times.map(hhmm12).join(', ') || '—'], ['Food', FOOD[m.food]], ['Start', m.start_date || '—'], ['End', m.end_date || '—']].map(([k, v]) =>
          <div key={k} className="flex justify-between text-sm"><span className="text-mute">{k}</span><span className="font-medium">{v}</span></div>)}</div>
      <Section title="Stock">
        <div className={`crd ${m.low_stock ? 'border-warn/40' : ''}`}>
          <div className="flex justify-between items-end"><div><div className="hd text-3xl font-bold">{m.stock_qty}</div><div className="text-xs text-mute">{m.stock_unit} remaining</div></div>{m.low_stock && <span className="text-xs font-medium text-warn bg-warn/10 rounded-full px-2.5 py-1">Running low</span>}</div>
          <div className="text-xs text-mute mt-1">Alert at {m.low_stock_threshold} {m.stock_unit}. Stock reduces only when a dose is confirmed taken.</div>
          <div className="flex gap-2 mt-3"><button className="btn-o" onClick={() => adjust(-1)}>−1</button><button className="btn-o" onClick={() => adjust(1)}>+1</button></div>
          <div className="flex gap-2 mt-2"><input className="inp" inputMode="numeric" placeholder="Add refill (e.g. 30)" value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, ''))} />
            <button className="btn-s !w-28" onClick={() => { if (qty) adjust(Number(qty)); setQty(''); }}>Add</button></div></div></Section>
      <div className="mt-6 space-y-3"><button className="btn-p" onClick={() => nav.push({ name: 'reminder-form', medicineId: id })}>Set reminder</button>
        <button className="btn-o" onClick={() => api(`/medicines/${id}`, 'PATCH', { status: m.status === 'active' ? 'discontinued' : 'active' }).then(load)}>{m.status === 'active' ? 'Mark as discontinued' : 'Reactivate'}</button></div>
    </div>);
}

export function MedicineForm({ id, memberId }: { id?: string; memberId?: string }) {
  const nav = useNav();
  const [fam, setFam] = useState<Member[]>([]); const [err, setErr] = useState(''); const [auto, setAuto] = useState(true);
  const [f, setF] = useState<any>({ member_id: memberId ?? '', name: '', strength: '', dosage: '1 tablet', frequency: 'once_daily', times: ['08:00'], food: 'after', start_date: '', end_date: '', stock_qty: 30, stock_unit: 'tablets', low_stock_threshold: 5 });
  useEffect(() => { api<Member[]>('/family').then(l => { setFam(l); setF((p: any) => ({ ...p, member_id: p.member_id || l[0]?.id || '' })); });
    if (id) api<Medicine[]>('/medicines').then(l => { const m = l.find(x => x.id === id); if (m) setF({ ...m, start_date: m.start_date ?? '', end_date: m.end_date ?? '' }); }); }, [id]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const setFreq = (k: string) => { const n = FREQ[k][1]; const defaults = ['08:00', '14:00', '21:00']; setF((p: any) => ({ ...p, frequency: k, times: k === 'custom' ? p.times : defaults.slice(0, n) })); };
  const save = async () => {
    const body: any = { name: f.name, strength: f.strength || undefined, dosage: f.dosage || undefined, dose_units: Number(f.dose_units) || 1, frequency: f.frequency, times: f.times, food: f.food, start_date: f.start_date || undefined, end_date: f.end_date || undefined, stock_qty: Number(f.stock_qty), stock_unit: f.stock_unit, low_stock_threshold: Number(f.low_stock_threshold) };
    try { if (id) await api(`/medicines/${id}`, 'PATCH', body); else { const r = await api('/medicines', 'POST', { ...body, member_id: f.member_id });
        if (auto) for (const t of f.times) await api('/reminders', 'POST', { medicine_id: r.id, time: t, repeat: 'daily' }); }
      nav.bump(); nav.pop(); }
    catch { setErr('Please check the medicine name, times and numbers.'); }
  };
  return (
    <div className="px-5 pb-10"><Header title={id ? 'Edit medicine' : 'Add medicine'} onBack={nav.pop} />
      <div className="space-y-3.5 mt-5">
        {!id && <Field label="For"><select className="inp" value={f.member_id} onChange={e => set('member_id', e.target.value)}>{fam.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
        <Field label="Medicine name"><input className="inp" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Strength"><input className="inp" placeholder="500mg" value={f.strength ?? ''} onChange={e => set('strength', e.target.value)} /></Field>
          <Field label="Dosage"><input className="inp" value={f.dosage ?? ''} onChange={e => set('dosage', e.target.value)} /></Field></div>
        <Field label="Frequency"><div className="flex flex-wrap gap-2">{Object.entries(FREQ).map(([k, [l]]) => <button type="button" key={k} className={`chip ${f.frequency === k ? 'on' : ''}`} onClick={() => setFreq(k)}>{l}</button>)}</div></Field>
        <Field label="Times">
          <div className="space-y-2">{f.times.map((t: string, i: number) => <div key={i} className="flex gap-2"><input type="time" className="inp" value={t} onChange={e => set('times', f.times.map((x: string, j: number) => j === i ? e.target.value : x))} />
            {f.frequency === 'custom' && f.times.length > 1 && <button type="button" className="btn-o !w-14" aria-label="Remove time" onClick={() => set('times', f.times.filter((_: string, j: number) => j !== i))}>×</button>}</div>)}
            <div className="flex flex-wrap gap-2">{SLOTS.map(([l, t]) => <button type="button" key={l} className="chip" onClick={() => f.frequency === 'custom' ? set('times', [...f.times, t]) : set('times', f.times.map((x: string, j: number) => j === 0 ? t : x))}>{l}</button>)}
              {f.frequency === 'custom' && <button type="button" className="chip" onClick={() => set('times', [...f.times, '12:00'])}>+ Custom time</button>}</div></div></Field>
        <Field label="Food instructions"><div className="flex flex-wrap gap-2">{Object.entries(FOOD).map(([k, l]) => <button type="button" key={k} className={`chip ${f.food === k ? 'on' : ''}`} onClick={() => set('food', k)}>{l}</button>)}</div></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Start date"><input type="date" className="inp" value={f.start_date} onChange={e => set('start_date', e.target.value)} /></Field><Field label="End date"><input type="date" className="inp" value={f.end_date} onChange={e => set('end_date', e.target.value)} /></Field></div>
        <div className="grid grid-cols-3 gap-3"><Field label="Stock"><input className="inp" inputMode="numeric" value={f.stock_qty} onChange={e => set('stock_qty', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Unit"><input className="inp" value={f.stock_unit} onChange={e => set('stock_unit', e.target.value)} /></Field>
          <Field label="Low at"><input className="inp" inputMode="numeric" value={f.low_stock_threshold} onChange={e => set('low_stock_threshold', e.target.value.replace(/\D/g, ''))} /></Field></div>
        {!id && <label className="flex items-center gap-3 min-h-[48px] text-sm"><input type="checkbox" className="w-5 h-5 accent-[#39264B]" checked={auto} onChange={e => setAuto(e.target.checked)} />Set daily voice reminders for these times</label>}
        <Err msg={err} />
      </div>
      <div className="mt-6"><button className="btn-p" onClick={save}>{id ? 'Save changes' : 'Save medicine'}</button></div>
    </div>);
}
