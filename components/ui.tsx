import { ReactNode } from 'react';
import { ArrowLeft, Heart, Home, Pill, Check } from 'lucide-react';

const GRADS = ['from-peach to-[#E8A88E]', 'from-plum-l to-[#C8B8D8]', 'from-warn to-[#C08A3A]', 'from-sage to-[#5A7A5B]'];
export function Avatar({ name, size = 40, i = 0 }: { name: string; size?: number; i?: number }) {
  const idx = (['mummy', 'papa', 'dadi'].indexOf(name.toLowerCase()) + 1 || 4) - 1 || i;
  const dark = idx === 2 || idx === 3;
  return <div style={{ width: size, height: size }} className={`rounded-full bg-gradient-to-br ${GRADS[idx % 4]} flex items-center justify-center shrink-0`}>
    <span className={`hd font-semibold ${dark ? 'text-white' : 'text-plum'}`} style={{ fontSize: size * .4 }}>{name[0]?.toUpperCase()}</span></div>;
}

export const Header = ({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) => (
  <div className="flex items-center gap-3 pt-4">
    {onBack && <button aria-label="Back" onClick={onBack} className="w-11 h-11 rounded-full bg-cream border border-line flex items-center justify-center"><ArrowLeft size={18} /></button>}
    {title && <h1 className="hd text-xl font-bold flex-1">{title}</h1>}{right}
  </div>
);

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block"><div className="text-xs font-medium text-mute mb-1.5">{label}</div>{children}</label>
);

export const Demo = () => <span className="ml-1.5 whitespace-nowrap text-[10px] font-semibold tracking-wide text-warn bg-warn/10 border border-warn/30 rounded px-1.5 py-0.5 align-middle">DEMO DATA</span>;

export const Section = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
  <div className="mt-5"><div className="flex justify-between items-center"><h2 className="hd text-base font-semibold">{title}</h2>{action}</div><div className="mt-2.5">{children}</div></div>
);

export const Row = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
  <div onClick={onClick} role={onClick ? 'button' : undefined} className={`bg-white border border-line rounded-2xl p-3.5 flex items-center gap-3 min-h-[48px] ${onClick ? 'cursor-pointer active:bg-plum-l/40' : ''}`}>{children}</div>;

const chipFor: Record<string, string> = {
  completed: 'bg-sage/10 border-sage text-sage', taken: 'bg-sage/10 border-sage text-sage',
  missed: 'bg-danger/10 border-danger text-danger', failed: 'bg-danger/10 border-danger text-danger', not_taken: 'bg-danger/10 border-danger text-danger',
  pending: 'bg-warn/10 border-warn text-warn', due: 'bg-warn/10 border-warn text-warn', follow_up: 'bg-warn/10 border-warn text-warn', declined: 'bg-warn/10 border-warn text-warn',
};
export const labelFor: Record<string, string> = { scheduled: 'Upcoming', due: 'Due now', connecting: 'Connecting', connected: 'In call', processing: 'Processing', completed: 'Taken ✓', pending: 'Pending', declined: 'Declined', missed: 'Missed', failed: 'Failed' };
export const StateChip = ({ s }: { s: string }) =>
  <span className={`text-xs font-medium rounded-full border px-2.5 py-0.5 ${chipFor[s] ?? 'bg-white border-line text-mute'}`}>{labelFor[s] ?? s}</span>;

export function Tabs({ tab, set }: { tab: string; set: (t: 'home' | 'medicines' | 'health') => void }) {
  const items = [['home', 'Home', Home], ['medicines', 'Medicines', Pill], ['health', 'Health', Heart]] as const;
  return <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-[72px] bg-cream border-t border-line flex justify-around items-center pb-2 z-20">
    {items.map(([k, label, Icon]) => <button key={k} onClick={() => set(k)} className={`min-w-[72px] min-h-[48px] flex flex-col items-center gap-1 text-[10px] ${tab === k ? 'text-plum font-semibold' : 'text-mute'}`}><Icon size={20} fill={tab === k && k === 'home' ? 'currentColor' : 'none'} />{label}</button>)}
  </nav>;
}

export const Check22 = () => <div className="w-[22px] h-[22px] rounded-full bg-plum flex items-center justify-center"><Check size={12} color="#fff" strokeWidth={3} /></div>;
export const Err = ({ msg }: { msg: string }) => msg ? <div role="alert" className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-xl px-3 py-2">{msg}</div> : null;
