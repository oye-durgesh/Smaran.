import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, fmtDate, fmtTime, Member, Reading } from './api';
import { useNav } from './nav';
import { Avatar, Demo, Err, Field, Header, Row } from './ui';

const RANGES: [string, number][] = [['7 days', 7], ['30 days', 30], ['12 months', 365]];

function Chart({ pts, color, label }: { pts: { t: number; v: number }[]; color: string; label: string }) {
  if (pts.length < 2) return <div className="text-xs text-mute py-6 text-center">Not enough readings to draw a chart.</div>;
  const W = 320, H = 110, xs = pts.map(p => p.t), ys = pts.map(p => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 5, y1 = Math.max(...ys) + 5;
  const px = (t: number) => 8 + (t - x0) / (x1 - x0 || 1) * (W - 16), py = (v: number) => H - 8 - (v - y0) / (y1 - y0 || 1) * (H - 16);
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}><polyline fill="none" stroke={color} strokeWidth="2" points={pts.map(p => `${px(p.t)},${py(p.v)}`).join(' ')} />
    {pts.map((p, i) => <circle key={i} cx={px(p.t)} cy={py(p.v)} r="3" fill={color} />)}</svg>;
}

export function HealthTab() {
  const nav = useNav();
  const [fam, setFam] = useState<Member[]>([]); const [who, setWho] = useState(''); const [days, setDays] = useState(30);
  const [reads, setReads] = useState<Reading[]>([]);
  useEffect(() => { api<Member[]>('/family').then(l => { setFam(l); setWho(w => w || l[0]?.id || ''); }); }, [nav.tick]);
  useEffect(() => { if (who) api<Reading[]>(`/readings?member_id=${who}&days=${days}`).then(setReads); }, [who, days, nav.tick]);
  const bp = reads.filter(r => r.type === 'bp'), gl = reads.filter(r => r.type === 'glucose');
  return (
    <div className="px-5 pt-4 pb-24">
      <div className="flex justify-between items-center"><h1 className="hd text-[22px] font-bold">Health</h1>
        <button aria-label="Add reading" onClick={() => nav.push({ name: 'reading-form', memberId: who })} className="w-11 h-11 rounded-full bg-plum flex items-center justify-center"><Plus size={20} color="#fff" /></button></div>
      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">{fam.map(f => <button key={f.id} className={`chip shrink-0 ${who === f.id ? 'on' : ''}`} onClick={() => setWho(f.id)}>{f.name}</button>)}</div>
      <div className="flex gap-2 mt-2">{RANGES.map(([l, d]) => <button key={d} className={`chip ${days === d ? 'on' : ''}`} onClick={() => setDays(d)}>{l}</button>)}</div>
      <div className="crd mt-4"><div className="flex justify-between"><div className="text-sm font-medium">Blood pressure</div><div className="text-xs text-mute">{bp[0] ? `Latest ${bp[0].systolic}/${bp[0].diastolic} mmHg` : 'No readings'}</div></div>
        <Chart label="Systolic blood pressure" color="#39264B" pts={[...bp].reverse().map(r => ({ t: +new Date(r.measured_at), v: r.systolic! }))} /></div>
      <div className="crd mt-3"><div className="flex justify-between"><div className="text-sm font-medium">Blood sugar</div><div className="text-xs text-mute">{gl[0] ? `Latest ${gl[0].glucose} ${gl[0].unit}` : 'No readings'}</div></div>
        <Chart label="Blood glucose" color="#718C72" pts={[...gl].reverse().map(r => ({ t: +new Date(r.measured_at), v: r.glucose! }))} /></div>
      <p className="text-[11px] text-mute mt-2">These are recorded values only, not medical advice. Talk to a doctor about any concern.</p>
      <h2 className="hd text-base font-semibold mt-5">History</h2>
      <div className="space-y-2 mt-2.5">{reads.length === 0 && <div className="text-sm text-mute">No readings in this period.</div>}
        {reads.slice(0, 30).map(r => <Row key={r.id}><div className="flex-1"><div className="text-sm font-medium">{r.type === 'bp' ? `${r.systolic}/${r.diastolic} ${r.unit}` : `${r.glucose} ${r.unit}`}{r.is_demo ? <Demo /> : null}</div><div className="text-xs text-mute">{r.type === 'bp' ? 'Blood pressure' : 'Blood sugar'} · {fmtDate(r.measured_at)} {fmtTime(r.measured_at)}</div></div>
          <button aria-label="Delete reading" className="w-11 h-11 flex items-center justify-center text-mute" onClick={() => api(`/readings/${r.id}`, 'DELETE').then(nav.bump)}><Trash2 size={16} /></button></Row>)}</div>
    </div>);
}

export function ReadingForm({ memberId }: { memberId?: string }) {
  const nav = useNav();
  const [fam, setFam] = useState<Member[]>([]); const [mid, setMid] = useState(memberId ?? ''); const [type, setType] = useState<'bp' | 'glucose'>('bp');
  const [f, setF] = useState({ sys: '', dia: '', glu: '' }); const [when, setWhen] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [confirm, setConfirm] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { api<Member[]>('/family').then(l => { setFam(l); setMid(m => m || l[0]?.id || ''); }); }, []);
  const valid = type === 'bp' ? +f.sys > 0 && +f.dia > 0 : +f.glu > 0;
  const save = async () => {
    try { await api('/readings', 'POST', { member_id: mid, type, ...(type === 'bp' ? { systolic: +f.sys, diastolic: +f.dia } : { glucose: +f.glu }), measured_at: new Date(when).toISOString() }); nav.bump(); nav.pop(); }
    catch { setErr('That value looks out of range. Please check it.'); setConfirm(false); }
  };
  const num = (k: 'sys' | 'dia' | 'glu') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') });
  const who = fam.find(x => x.id === mid)?.name;
  return (
    <div className="px-5 pb-10"><Header title="Add reading" onBack={nav.pop} />
      {!confirm ? <div className="space-y-3.5 mt-5">
        <Field label="Family member"><div className="flex flex-wrap gap-2">{fam.map(x => <button key={x.id} className={`chip ${mid === x.id ? 'on' : ''}`} onClick={() => setMid(x.id)}>{x.name}</button>)}</div></Field>
        <div className="flex gap-2">{([['bp', 'Blood pressure'], ['glucose', 'Blood sugar']] as const).map(([k, l]) => <button key={k} className={`chip ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>{l}</button>)}</div>
        {type === 'bp' ? <div className="grid grid-cols-2 gap-3"><Field label="Systolic (mmHg)"><input className="inp" inputMode="numeric" value={f.sys} onChange={num('sys')} /></Field><Field label="Diastolic (mmHg)"><input className="inp" inputMode="numeric" value={f.dia} onChange={num('dia')} /></Field></div>
          : <Field label="Glucose (mg/dL)"><input className="inp" inputMode="decimal" value={f.glu} onChange={num('glu')} /></Field>}
        <Field label="Date and time"><input type="datetime-local" className="inp" value={when} onChange={e => setWhen(e.target.value)} /></Field>
        <Err msg={err} /><button className="btn-p" disabled={!valid} onClick={() => setConfirm(true)}>Review</button>
      </div> : <div className="mt-6 space-y-4"><div className="crd text-center"><Avatar name={who ?? '?'} size={48} /><div className="hd text-3xl font-bold mt-3">{type === 'bp' ? `${f.sys}/${f.dia}` : f.glu}</div><div className="text-sm text-mute">{type === 'bp' ? 'mmHg' : 'mg/dL'} · {who}</div></div>
        <p className="text-sm text-mute text-center">Is this correct? Nothing is saved until you confirm.</p>
        <button className="btn-p" onClick={save}>Confirm & save</button><button className="btn-o" onClick={() => setConfirm(false)}>Edit</button></div>}
    </div>);
}
