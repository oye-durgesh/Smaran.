import { useEffect, useState } from 'react';
import { Bell, ChevronRight, Database, Globe, Lock, Timer, Users } from 'lucide-react';
import { api, setToken, Member } from './api';
import { useNav } from './nav';
import { Avatar, Demo, Header, Row } from './ui';

export function Settings({ name, email }: { name: string; email: string }) {
  const nav = useNav();
  const [s, setS] = useState<any>(null); const [fam, setFam] = useState<Member[]>([]); const [sure, setSure] = useState(false); const [note, setNote] = useState('');
  const load = () => { api('/settings').then(setS); api('/family').then(setFam); };
  useEffect(load, [nav.tick]);
  const patch = (b: object) => api('/settings', 'PATCH', b).then(load);
  const demo = (a: string, msg: string) => api(`/demo/${a}`, 'POST').then(() => { setNote(msg); nav.bump(); });
  const notif = async () => { if (!s.notifications && 'Notification' in window) await Notification.requestPermission(); patch({ notifications: !s.notifications }); };
  if (!s) return null;
  const Sec = ({ icon: I, t, children }: any) => <div className="mt-6"><div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-mute"><I size={14} />{t.toUpperCase()}</div><div className="mt-2.5 space-y-2.5">{children}</div></div>;
  return (
    <div className="px-5 pb-12"><Header title="Settings" onBack={nav.pop} />
      <div className="crd mt-5 flex items-center gap-3"><Avatar name={name} size={48} /><div><div className="hd font-semibold">{name}</div><div className="text-xs text-mute">{email}</div></div></div>
      <Sec icon={Users} t="Family">{fam.map(f => <Row key={f.id} onClick={() => nav.push({ name: 'member-form', id: f.id })}><Avatar name={f.name} size={36} /><div className="flex-1 text-sm font-medium">{f.name}{f.is_demo ? <Demo /> : null}<div className="text-xs text-mute font-normal">{f.relationship}</div></div><ChevronRight size={16} className="text-mute" /></Row>)}
        <button className="btn-s" onClick={() => nav.push({ name: 'member-form' })}>Add family member</button></Sec>
      <Sec icon={Timer} t="Reminder preferences">
        <Row onClick={() => nav.push({ name: 'reminders' })}><div className="flex-1 text-sm font-medium">Manage reminders</div><ChevronRight size={16} className="text-mute" /></Row>
        <div className="crd"><div className="text-sm font-medium">If a reminder is declined or missed, try again after</div><div className="flex gap-2 mt-2.5">{[5, 10, 15, 30].map(m => <button key={m} className={`chip ${s.retry_minutes === m ? 'on' : ''}`} onClick={() => patch({ retry_minutes: m })}>{m} min</button>)}</div><div className="text-xs text-mute mt-2">Up to 2 retries. Time zone: India (Asia/Kolkata).</div></div></Sec>
      <Sec icon={Globe} t="Language"><div className="crd flex gap-2">{[['en', 'English'], ['hi', 'हिन्दी']].map(([k, l]) => <button key={k} className={`chip ${s.language === k ? 'on' : ''}`} onClick={() => patch({ language: k })}>{l}</button>)}</div>
        <p className="text-xs text-mute">Controls app labels. Each voice agent keeps the language settings it already has.</p></Sec>
      <Sec icon={Bell} t="Notifications"><label className="crd flex items-center justify-between min-h-[48px] text-sm"><span>Show alerts when a reminder is due</span><input type="checkbox" className="w-5 h-5 accent-[#39264B]" checked={s.notifications} onChange={notif} /></label>
        <p className="text-xs text-mute">Reminders appear while Smaran Bolna is open on this phone. If the app is closed or the phone is locked, the call screen cannot appear until you open the app.</p></Sec>
      <Sec icon={Lock} t="Privacy"><div className="crd text-sm leading-relaxed">Smaran Bolna does <b>not</b> store conversation transcripts or audio recordings. Voice calls are audio only. Only the result (taken, not taken, follow-up…) is saved.</div>
        <div className="crd text-sm"><div className="font-medium mb-1.5">Voice agents</div>
          {[['Mummy', s.voice_configured.mummy], ['Papa', s.voice_configured.papa]].map(([n, ok]) => <div key={n as string} className="flex justify-between py-1"><span>{n}</span><span className={ok ? 'text-sage' : 'text-warn'}>{ok ? 'Connected' : 'Not set up on server'}</span></div>)}</div>
        {!sure ? <button className="btn-d" onClick={() => setSure(true)}>Delete all my data</button> : <div className="crd border-danger/30"><p className="text-sm">This permanently deletes your account, family, medicines, readings and appointments from this app.</p>
          <div className="flex gap-2 mt-3"><button className="btn-o" onClick={() => setSure(false)}>Cancel</button><button className="btn-d" onClick={async () => { await api('/account', 'DELETE'); setToken(''); location.reload(); }}>Delete</button></div></div>}</Sec>
      <Sec icon={Database} t="Demo mode"><div className="crd text-sm">Demo data is clearly labelled <Demo /> and kept separate from your real records. It is for illustration only, not real prescriptions.</div>
        <div className="grid grid-cols-3 gap-2"><button className="btn-s !text-[13px]" onClick={() => demo('load', 'Demo data loaded.')}>Load</button><button className="btn-s !text-[13px]" onClick={() => demo('reset', 'Demo data reset.')}>Reset</button><button className="btn-o !text-[13px]" onClick={() => demo('clear', 'Demo data cleared.')}>Clear</button></div>
        {note && <div className="text-xs text-sage" role="status">{note}</div>}</Sec>
      <div className="mt-6"><button className="btn-o" onClick={() => { setToken(''); location.reload(); }}>Log out</button></div>
    </div>);
}
