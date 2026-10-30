import { useState } from 'react';
import { Check, Eye, EyeOff, Plus, Users, User } from 'lucide-react';
import { api, ApiError, setToken } from './api';
import { Avatar, Err, Field, Header } from './ui';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'welcome' | 'account' | 'login' | 'purpose' | 'family'>('welcome');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [purpose, setPurpose] = useState<'family' | 'self'>('family');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({ Mummy: true, Papa: true, Dadi: true });
  const [custom, setCustom] = useState<{ name: string; rel: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [cn, setCn] = useState({ name: '', rel: '' });
  const progress = (n: number) => <div className="flex gap-1.5 mt-4">{[1, 2, 3].map(i => <div key={i} className={`flex-1 h-[3px] rounded ${i <= n ? 'bg-plum' : 'bg-line'}`} />)}</div>;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const create = async () => {
    setErr(''); setBusy(true);
    try { const r = await api('/account', 'POST', { ...f, purpose }); setToken(r.token); setStep('purpose'); }
    catch (e) { setErr(e instanceof ApiError && e.status === 409 ? 'An account already exists on this device. Please log in.' : 'Please enter your name, a valid email and a password of at least 8 characters.'); }
    setBusy(false);
  };
  const login = async () => {
    setErr(''); setBusy(true);
    try { const r = await api('/login', 'POST', f); setToken(r.token); onDone(); } catch { setErr('Email or password is incorrect.'); }
    setBusy(false);
  };
  const finish = async () => {
    setBusy(true);
    const list = [
      ...(purpose === 'self' ? [{ name: f.name.split(' ')[0] || 'Me', relationship: 'Self' }] : []),
      ...[['Mummy', 'Mother'], ['Papa', 'Father'], ['Dadi', 'Grandmother']].filter(([n]) => picked[n]).map(([name, relationship]) => ({ name, relationship })),
      ...(picked.Me && purpose !== 'self' ? [{ name: f.name.split(' ')[0] || 'Me', relationship: 'Self' }] : []),
      ...custom.map(c => ({ name: c.name, relationship: c.rel })),
    ];
    for (const m of list) await api('/family', 'POST', m).catch(() => {});
    onDone();
  };

  if (step === 'welcome') return (
    <div className="min-h-dvh flex flex-col items-center px-7 py-10">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-plum to-[#5A3D6E] flex items-center justify-center shadow-[0_8px_24px_rgba(57,38,75,.2)]"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" /></svg></div>
        <div className="hd text-[28px] font-bold mt-5">Smaran</div>
        <div className="text-sm text-mute mt-1">Your voice. Their care.</div>
        <div className="mt-8 w-[260px] h-[200px] rounded-3xl bg-gradient-to-br from-plum-l to-peach flex items-center justify-center gap-3 items-end">
          {[['bg-plum/10', 'h-14', User, '#39264B'], ['bg-sage/15', 'h-[68px]', Users, '#718C72'], ['bg-peach/30', 'h-[60px]', Plus, '#D79A46']].map(([bg, h, Ic, c]: any, i) => <div key={i} className={`w-12 ${h} rounded-[14px] ${bg} flex items-center justify-center self-center`}><Ic size={22} color={c} /></div>)}
        </div>
        <p className="mt-7 text-[15px] text-mute text-center leading-relaxed max-w-[300px]">Stay connected to your family's health, medicines and daily care.</p>
      </div>
      <div className="w-full space-y-3"><button className="btn-p" onClick={() => setStep('account')}>Get Started</button>
        <div className="text-center text-sm text-mute">I already have an account · <button className="text-plum font-medium min-h-[48px] px-1" onClick={() => setStep('login')}>Log in</button></div></div>
    </div>);

  if (step === 'account' || step === 'login') return (
    <div className="px-6 pb-10"><Header onBack={() => setStep('welcome')} />
      <h1 className="hd text-[26px] font-bold mt-6">{step === 'account' ? 'Create account' : 'Welcome back'}</h1>
      <p className="text-sm text-mute mt-1.5">{step === 'account' ? 'Set up your Smaran Bolna account' : 'Log in to continue'}</p>
      <div className="space-y-3.5 mt-7">
        {step === 'account' && <Field label="Full name"><input className="inp" value={f.name} onChange={set('name')} autoComplete="name" /></Field>}
        <Field label="Email address"><input className="inp" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Password"><div className="relative"><input className="inp pr-12" type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} autoComplete={step === 'account' ? 'new-password' : 'current-password'} />
          <button type="button" aria-label="Show password" onClick={() => setShow(!show)} className="absolute right-0 top-0 w-12 h-[52px] flex items-center justify-center text-mute">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>
        <Err msg={err} />
      </div>
      {step === 'account' && <p className="mt-2.5 text-xs text-mute">By continuing, you agree to our Terms of Service and Privacy Policy.</p>}
      <div className="mt-6"><button className="btn-p" disabled={busy} onClick={step === 'account' ? create : login}>{step === 'account' ? 'Continue' : 'Log in'}</button></div>
      <div className="text-center text-sm text-mute mt-4">{step === 'account' ? 'Already have an account?' : 'New here?'} <button className="text-plum font-medium min-h-[48px] px-1" onClick={() => { setErr(''); setStep(step === 'account' ? 'login' : 'account'); }}>{step === 'account' ? 'Log in' : 'Create account'}</button></div>
    </div>);

  if (step === 'purpose') return (
    <div className="px-6 pb-10 flex flex-col min-h-dvh"><Header onBack={() => setStep('account')} />{progress(2)}
      <h1 className="hd text-[26px] font-bold mt-6">What brings you here?</h1>
      <p className="text-sm text-mute mt-1.5">This helps us personalise your experience</p>
      <div className="space-y-3.5 mt-7">
        {([['family', 'Helping my family', 'Manage medicines, reminders and health readings for your family members', Users, 'bg-plum'], ['self', 'Managing my own health', 'Track your own medicines, health readings and appointments', User, 'bg-peach']] as const).map(([k, t, d, Ic, bg]) =>
          <button key={k} onClick={() => setPurpose(k)} className={`w-full text-left rounded-[20px] p-5 flex gap-3.5 items-start ${purpose === k ? 'bg-plum-l border-2 border-plum' : 'bg-white border border-line'}`}>
            <div className={`w-[52px] h-[52px] rounded-2xl ${bg} flex items-center justify-center shrink-0`}><Ic size={24} color={k === 'family' ? '#fff' : '#39264B'} /></div>
            <div className="flex-1"><div className="hd text-[17px] font-semibold">{t}</div><div className="text-[13px] text-mute mt-1 leading-normal">{d}</div></div>
            {purpose === k ? <div className="w-6 h-6 rounded-full bg-plum flex items-center justify-center mt-0.5"><Check size={14} color="#fff" strokeWidth={2.5} /></div> : <div className="w-6 h-6 rounded-full border-[1.5px] border-line mt-0.5" />}
          </button>)}
      </div>
      <div className="flex-1" /><div className="mt-8"><button className="btn-p" onClick={() => setStep('family')}>Continue</button></div>
    </div>);

  const members = [['Mummy', 'Mother'], ['Papa', 'Father'], ['Dadi', 'Grandmother'], ['Me', 'Self']];
  return (
    <div className="px-6 pb-10"><Header onBack={() => setStep('purpose')} />{progress(3)}
      <h1 className="hd text-[26px] font-bold mt-6">Add family members</h1>
      <p className="text-sm text-mute mt-1.5">Select who you'll be caring for</p>
      <div className="space-y-2.5 mt-6">
        {members.map(([n, r]) => <button key={n} onClick={() => setPicked({ ...picked, [n]: !picked[n] })} className={`w-full min-h-[64px] text-left rounded-2xl px-4 py-3.5 flex items-center gap-3 ${picked[n] ? 'bg-plum-l border-2 border-plum' : 'bg-white border border-line'}`}>
          <Avatar name={n === 'Me' ? (f.name || 'Me') : n} size={44} i={3} /><div className="flex-1"><div className="hd text-base font-semibold">{n}</div><div className="text-xs text-mute">{r}</div></div>
          {picked[n] ? <div className="w-[22px] h-[22px] rounded-full bg-plum flex items-center justify-center"><Check size={12} color="#fff" strokeWidth={3} /></div> : <div className="w-[22px] h-[22px] rounded-full border-[1.5px] border-line" />}</button>)}
        {custom.map(c => <div key={c.name} className="rounded-2xl px-4 py-3.5 flex items-center gap-3 bg-plum-l border-2 border-plum"><Avatar name={c.name} size={44} i={3} /><div className="flex-1"><div className="hd font-semibold">{c.name}</div><div className="text-xs text-mute">{c.rel}</div></div></div>)}
        {adding ? <div className="crd space-y-3"><Field label="Name"><input className="inp" value={cn.name} onChange={e => setCn({ ...cn, name: e.target.value })} /></Field><Field label="Relationship"><input className="inp" value={cn.rel} onChange={e => setCn({ ...cn, rel: e.target.value })} /></Field>
          <button className="btn-s" onClick={() => { if (cn.name.trim() && cn.rel.trim()) { setCustom([...custom, { name: cn.name.trim(), rel: cn.rel.trim() }]); setCn({ name: '', rel: '' }); setAdding(false); } }}>Add</button></div>
          : <button onClick={() => setAdding(true)} className="w-full min-h-[64px] border-[1.5px] border-dashed border-line rounded-2xl px-4 py-3.5 flex items-center gap-3 text-mute"><div className="w-11 h-11 rounded-full bg-cream border border-line flex items-center justify-center"><Plus size={20} /></div><span className="hd font-semibold">Add another member</span></button>}
      </div>
      <div className="mt-6"><button className="btn-p" disabled={busy} onClick={finish}>Continue</button></div>
    </div>);
}
