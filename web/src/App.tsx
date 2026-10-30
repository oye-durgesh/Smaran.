import { useCallback, useEffect, useRef, useState } from 'react';
import { api, hasToken, Occ } from './api';
import { AppointmentDetail, AppointmentForm, AppointmentList } from './Appointments';
import { CallFlow } from './Call';
import { FamilyProfile, MemberForm } from './Family';
import { HealthTab, ReadingForm } from './Health';
import { HomeScreen } from './Home';
import { MedicineDetail, MedicineForm, MedicinesTab } from './Medicines';
import { Nav, NavCtx, Route } from './nav';
import { Onboarding } from './Onboarding';
import { ReminderForm, RemindersList } from './Reminders';
import { Settings } from './Settings';
import { Tabs } from './ui';

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [me, setMe] = useState<{ name: string; email: string }>();
  const [stack, setStack] = useState<Route[]>([{ name: 'tabs', tab: 'home' }]);
  const [tick, setTick] = useState(0);
  const [call, setCall] = useState<Occ | null>(null);
  const callRef = useRef<Occ | null>(null); callRef.current = call;
  const declinedHere = useRef<Set<string>>(new Set());

  const nav: Nav = {
    push: r => setStack(s => [...s, r]), pop: () => setStack(s => s.length > 1 ? s.slice(0, -1) : s),
    reset: r => setStack([r]), tick, bump: () => setTick(t => t + 1),
  };

  useEffect(() => { if (authed) api('/me').then(setMe).catch(() => {}); }, [authed]);

  // Event A: the app asks the server whether a reminder is due. This only shows the incoming screen.
  useEffect(() => {
    if (!authed) return;
    const poll = async () => {
      if (callRef.current) return;
      try {
        const { incoming } = await api<{ incoming: Occ | null }>('/incoming');
        if (incoming && !declinedHere.current.has(incoming.id)) {
          declinedHere.current.add(incoming.id);
          setCall(incoming);
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted')
            new Notification('Smaran Bolna', { body: `${incoming.medicine_name} for ${incoming.member_name}` });
        }
      } catch { /* offline: try again next time */ }
    };
    poll(); const t = setInterval(poll, 10_000);
    const vis = () => !document.hidden && poll(); document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [authed]);

  const startRetryCall = useCallback(async (o: Occ) => { if (o.state !== 'due') await api(`/occurrences/${o.id}/retry`, 'POST').catch(() => {}); setCall({ ...o, state: 'due' }); }, []);

  if (!authed) return <div className="shell"><Onboarding onDone={() => setAuthed(true)} /></div>;
  const top = stack[stack.length - 1];
  const body = (() => {
    switch (top.name) {
      case 'tabs': return top.tab === 'medicines' ? <MedicinesTab /> : top.tab === 'health' ? <HealthTab /> : <HomeScreen name={me?.name ?? ''} incomingCall={startRetryCall} />;
      case 'family-profile': return <FamilyProfile id={top.id} />;
      case 'member-form': return <MemberForm id={top.id} />;
      case 'medicine-detail': return <MedicineDetail id={top.id} />;
      case 'medicine-form': return <MedicineForm id={top.id} memberId={top.memberId} />;
      case 'reminders': return <RemindersList />;
      case 'reminder-form': return <ReminderForm medicineId={top.medicineId} />;
      case 'reading-form': return <ReadingForm memberId={top.memberId} />;
      case 'appointments': return <AppointmentList />;
      case 'appointment-detail': return <AppointmentDetail id={top.id} />;
      case 'appointment-form': return <AppointmentForm id={top.id} />;
      case 'settings': return <Settings name={me?.name ?? ''} email={me?.email ?? ''} />;
    }
    return null;
  })();
  return (
    <NavCtx.Provider value={nav}>
      <div className="shell">{body}
        {top.name === 'tabs' && <Tabs tab={top.tab} set={t => setStack([{ name: 'tabs', tab: t }])} />}
      </div>
      {call && <CallFlow key={call.id + call.state} occ={call} onDone={() => { setCall(null); nav.bump(); }} />}
    </NavCtx.Provider>);
}
