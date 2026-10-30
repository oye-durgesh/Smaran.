import { useEffect, useState } from 'react';
import { Calendar, ChevronRight, Plus } from 'lucide-react';
import { api, Appt, fmtDate, fmtTime, Medicine, Member, Occ, Reading } from './api';
import { useNav } from './nav';
import { Avatar, Demo, Err, Field, Header, Row, Section, StateChip } from './ui';

export function FamilyProfile({ id }: { id: string }) {
  const nav = useNav();
  const [m, setM] = useState<Member>(); const [meds, setMeds] = useState<Medicine[]>([]); const [occ, setOcc] = useState<Occ[]>([]);
  const [reads, setReads] = useState<Reading[]>([]); const [appts, setAppts] = useState<Appt[]>([]);
  useEffect(() => {
    api<Member[]>('/family').then(l => setM(l.find(x => x.id === id)));
    api<Medicine[]>(`/medicines?member_id=${id}`).then(setMeds);
    api('/today').then(d => setOcc(d.occurrences.filter((o: Occ) => o.member_id === id)));
    api<Reading[]>(`/readings?member_id=${id}&days=30`).then(setReads);
    api<Appt[]>('/appointments').then(l => setAppts(l.filter(a => a.member_id === id && a.status === 'scheduled' && new Date(a.starts_at) > new Date())));
  }, [id, nav.tick]);
  if (!m) return null;
  const bp = reads.find(r => r.type === 'bp'), gl = reads.find(r => r.type === 'glucose');
  const done = occ.filter(o => o.state === 'completed').length;
  return (
    <div className="px-5 pb-10">
      <Header onBack={nav.pop} right={<button className="text-sm text-plum font-medium min-h-[48px] px-2" onClick={() => nav.push({ name: 'member-form', id })}>Edit</button>} />
      <div className="flex items-center gap-3.5 mt-4"><Avatar name={m.name} size={64} />
        <div><h1 className="hd text-2xl font-bold">{m.name}{m.is_demo ? <Demo /> : null}</h1><div className="text-sm text-mute">{m.relationship}{m.has_voice ? ' · Voice reminders on' : ' · No voice agent'}</div></div></div>
      {m.notes && <p className="text-sm text-mute mt-3">{m.notes}</p>}
      <div className="grid grid-cols-3 gap-2.5 mt-5">{[['Active medicines', meds.filter(x => x.status === 'active').length], ['Done today', done], ['Pending', occ.filter(o => ['due', 'pending', 'declined', 'missed'].includes(o.state)).length]].map(([l, n]) =>
        <div key={l as string} className="bg-white border border-line rounded-2xl p-3 text-center"><div className="text-xl font-bold text-plum">{n}</div><div className="text-[11px] text-mute">{l}</div></div>)}</div>
      <Section title="Today's reminders">{occ.length === 0 ? <div className="text-sm text-mute">No reminders today.</div> : <div className="space-y-2">{occ.map(o => <Row key={o.id}><div className="flex-1"><div className="text-sm font-medium">{o.medicine_name} {o.strength}</div><div className="text-xs text-mute">{fmtTime(o.scheduled_for)}</div></div><StateChip s={o.state} /></Row>)}</div>}</Section>
      <Section title="Medicines" action={<button className="text-[13px] text-plum font-medium min-h-[44px]" onClick={() => nav.push({ name: 'medicine-form', memberId: id })}>Add</button>}>
        <div className="space-y-2">{meds.map(x => <Row key={x.id} onClick={() => nav.push({ name: 'medicine-detail', id: x.id })}><div className="flex-1"><div className="text-sm font-medium">{x.name} {x.strength}</div><div className="text-xs text-mute">{x.stock_qty} {x.stock_unit} left{x.low_stock ? ' · low' : ''}</div></div><ChevronRight size={16} className="text-mute" /></Row>)}</div></Section>
      <Section title="Latest readings"><div className="grid grid-cols-2 gap-2.5">
        <div className="crd"><div className="text-xs text-mute">Blood pressure</div><div className="hd text-lg font-bold mt-1">{bp ? `${bp.systolic}/${bp.diastolic}` : '—'}</div><div className="text-[11px] text-mute">{bp ? fmtDate(bp.measured_at) : 'No reading'}{bp?.is_demo ? ' · demo' : ''}</div></div>
        <div className="crd"><div className="text-xs text-mute">Blood sugar</div><div className="hd text-lg font-bold mt-1">{gl ? `${gl.glucose}` : '—'}</div><div className="text-[11px] text-mute">{gl ? `${gl.unit} · ${fmtDate(gl.measured_at)}` : 'No reading'}{gl?.is_demo ? ' · demo' : ''}</div></div></div></Section>
      <Section title="Upcoming appointments">{appts.length === 0 ? <div className="text-sm text-mute">None scheduled.</div> : appts.map(a => <Row key={a.id} onClick={() => nav.push({ name: 'appointment-detail', id: a.id })}><Calendar size={18} className="text-plum" /><div className="flex-1"><div className="text-sm font-medium">{a.doctor}</div><div className="text-xs text-mute">{fmtDate(a.starts_at)} · {fmtTime(a.starts_at)}</div></div></Row>)}</Section>
    </div>);
}

export function MemberForm({ id }: { id?: string }) {
  const nav = useNav();
  const [f, setF] = useState({ name: '', relationship: '', notes: '' });
  const [err, setErr] = useState(''); const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (id) api<Member[]>('/family').then(l => { const m = l.find(x => x.id === id); if (m) setF({ name: m.name, relationship: m.relationship, notes: m.notes ?? '' }); }); }, [id]);
  const save = async () => {
    try { id ? await api(`/family/${id}`, 'PATCH', { ...f, notes: f.notes || null }) : await api('/family', 'POST', { ...f, notes: f.notes || undefined }); nav.bump(); nav.pop(); }
    catch { setErr('Please enter a name and relationship.'); }
  };
  return (
    <div className="px-5 pb-10"><Header title={id ? 'Edit member' : 'Add family member'} onBack={nav.pop} />
      <div className="space-y-3.5 mt-6">
        <Field label="Name"><input className="inp" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Relationship"><input className="inp" value={f.relationship} onChange={e => setF({ ...f, relationship: e.target.value })} placeholder="e.g. Mother" /></Field>
        <Field label="Notes (optional)"><textarea className="inp h-24 py-3" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        <Err msg={err} />
      </div>
      <div className="mt-6 space-y-3"><button className="btn-p" onClick={save}>{id ? 'Save changes' : 'Add member'}</button>
        {id && !confirm && <button className="btn-d" onClick={() => setConfirm(true)}>Remove member</button>}
        {id && confirm && <div className="crd border-danger/30"><p className="text-sm">This permanently removes {f.name} and their medicines, reminders, readings and appointments. Other family members are not affected.</p>
          <div className="flex gap-2 mt-3"><button className="btn-o" onClick={() => setConfirm(false)}>Cancel</button><button className="btn-d" onClick={async () => { await api(`/family/${id}?confirm=true`, 'DELETE'); nav.bump(); nav.reset({ name: 'tabs' }); }}>Remove</button></div></div>}
      </div></div>);
}
