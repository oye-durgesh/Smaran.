import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({ opts: null as any, startSession: vi.fn(), endSession: vi.fn() }));
vi.mock('@elevenlabs/react', () => ({
  useConversation: (o: any) => { hook.opts = o; return { startSession: hook.startSession, endSession: hook.endSession, isSpeaking: false, status: 'disconnected' }; },
}));
const apiMock = vi.hoisted(() => vi.fn());
vi.mock('./api', async (orig) => ({ ...(await orig<any>()), api: apiMock }));

import { CallFlow } from './Call';
import { makeOutcomeCollector } from './outcomeTool';

const occ: any = { id: 'o1', state: 'due', member_name: 'Mummy', medicine_name: 'Metformin', strength: '500mg', scheduled_for: '2026-10-30T03:30:00Z', has_voice: 1, conversation_enabled: 1 };
const calls = () => apiMock.mock.calls.map(c => `${c[1] ?? 'GET'} ${c[0]}`);
const outcomePosts = () => apiMock.mock.calls.filter(c => String(c[0]).endsWith('/outcome')).map(c => c[2]);
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  apiMock.mockImplementation(async (path: string) => path.endsWith('/answer') ? { signedUrl: 'wss://signed/abc' } : { ok: true });
  hook.startSession.mockResolvedValue('conv');
  hook.endSession.mockResolvedValue(undefined);
});

describe('incoming screen', () => {
  it('shows the incoming reminder and starts nothing', () => {
    render(<CallFlow occ={occ} onDone={() => {}} />);
    expect(screen.getByText('INCOMING VOICE REMINDER')).toBeTruthy();
    expect(calls()).toEqual([]);
    expect(hook.startSession).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('Decline never starts ElevenLabs, never asks the server for a session, never opens the microphone', async () => {
    render(<CallFlow occ={occ} onDone={() => {}} />);
    fireEvent.click(screen.getByText('Decline'));
    await screen.findByText('Reminder declined');
    expect(calls()).toEqual(['POST /occurrences/o1/decline']);
    expect(hook.startSession).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('Answer asks the server for a session, then starts with the signed URL only', async () => {
    render(<CallFlow occ={occ} onDone={() => {}} />);
    fireEvent.click(screen.getByText('Answer'));
    await waitFor(() => expect(hook.startSession).toHaveBeenCalledTimes(1));
    expect(calls()[0]).toBe('POST /occurrences/o1/answer');
    expect(hook.startSession).toHaveBeenCalledWith({ signedUrl: 'wss://signed/abc' });
  });
});

describe('no transcript', () => {
  it('registers no message or audio handlers', () => {
    render(<CallFlow occ={occ} onDone={() => {}} />);
    for (const k of ['onMessage', 'onAudio', 'onDebug']) expect(hook.opts[k]).toBeUndefined();
    expect(Object.keys(hook.opts.clientTools)).toEqual(['report_medicine_outcome']);
  });
});

describe('outcomes', () => {
  const answerAndConnect = async () => {
    render(<CallFlow occ={occ} onDone={() => {}} />);
    fireEvent.click(screen.getByText('Answer'));
    await waitFor(() => expect(hook.startSession).toHaveBeenCalled());
    act(() => hook.opts.onConnect({ conversationId: 'c' }));
    await screen.findByText('Connected');
  };

  it('ending the call with no agent report records unconfirmed and never taken', async () => {
    await answerAndConnect();
    fireEvent.click(screen.getByText('End'));
    await screen.findByText(/Did Mummy take Metformin/);
    expect(outcomePosts()).toEqual([expect.objectContaining({ outcome: 'unconfirmed', source: 'agent' })]);
    expect(outcomePosts().some(p => p.outcome === 'taken')).toBe(false);
  });

  it('a clear "taken" report from the agent tool is recorded as taken', async () => {
    await answerAndConnect();
    act(() => { hook.opts.clientTools.report_medicine_outcome({ outcome: 'taken' }); });
    fireEvent.click(screen.getByText('End'));
    expect((await screen.findAllByText('Medicine taken')).length).toBeGreaterThan(0);
    expect(outcomePosts()).toEqual([expect.objectContaining({ outcome: 'taken', source: 'agent' })]);
  });

  it('"will take later" style follow_up carries the interval', async () => {
    await answerAndConnect();
    act(() => { hook.opts.clientTools.report_medicine_outcome({ outcome: 'follow_up', follow_up_minutes: 20 }); });
    fireEvent.click(screen.getByText('End'));
    expect((await screen.findAllByText('Follow-up set')).length).toBeGreaterThan(0);
    expect(outcomePosts()[0]).toMatchObject({ outcome: 'follow_up', followUpMinutes: 20 });
  });

  it('only the administrator tapping "Yes" marks taken after an unclear call', async () => {
    await answerAndConnect();
    fireEvent.click(screen.getByText('End'));
    fireEvent.click(await screen.findByText('Yes, medicine taken'));
    await waitFor(() => expect(outcomePosts().at(-1)).toMatchObject({ outcome: 'taken', source: 'manual' }));
  });

  it('connection failure is reported and shown', async () => {
    hook.startSession.mockRejectedValue(new Error('mic denied'));
    render(<CallFlow occ={occ} onDone={() => {}} />);
    fireEvent.click(screen.getByText('Answer'));
    await screen.findByText('Connection failed');
    expect(calls()).toContain('POST /occurrences/o1/failed');
  });

  it('dropped connection mid-call is reported as failed', async () => {
    await answerAndConnect();
    act(() => hook.opts.onError('socket closed'));
    await screen.findByText('Connection failed');
    expect(calls()).toContain('POST /occurrences/o1/failed');
  });
});

describe('outcome tool', () => {
  it('accepts only the four agent values and keeps the first', () => {
    const c = makeOutcomeCollector();
    expect(c.tool({ outcome: 'missed' })).toMatch(/Invalid/);
    expect(c.tool({ outcome: 'taken; drop table' })).toMatch(/Invalid/);
    expect(c.tool(undefined)).toMatch(/Invalid/);
    expect(c.get()).toBeNull();
    c.tool({ outcome: 'unconfirmed' });
    c.tool({ outcome: 'taken' });
    expect(c.get()).toEqual({ outcome: 'unconfirmed', followUp: undefined });
  });
  it('clamps the follow-up interval', () => {
    const c = makeOutcomeCollector(); c.tool({ outcome: 'follow_up', follow_up_minutes: 99999 });
    expect(c.get()?.followUp).toBe(240);
  });
});
