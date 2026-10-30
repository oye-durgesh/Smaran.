const store = () => (typeof window === 'undefined' ? null : window.localStorage);
let token = store()?.getItem('smaran_token') ?? '';
export const setToken = (t: string) => { token = t; t ? store()?.setItem('smaran_token', t) : store()?.removeItem('smaran_token'); };
export const hasToken = () => !!token;

export class ApiError extends Error { constructor(public status: number, public body: any) { super(body?.message ?? body?.error ?? 'Request failed'); } }

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { if (res.status === 401 && token) { setToken(''); location.reload(); } throw new ApiError(res.status, data); }
  return data;
}

export interface Member { id: string; name: string; relationship: string; notes?: string; is_demo: number; has_voice: number }
export interface Medicine { id: string; member_id: string; name: string; strength?: string; dosage?: string; dose_units: number; frequency: string; times: string[]; food: string; start_date?: string; end_date?: string; stock_qty: number; stock_unit: string; low_stock_threshold: number; status: string; is_demo: number; low_stock: boolean }
export interface Occ { id: string; state: string; outcome: string | null; kind: string; scheduled_for: string; member_id: string; member_name: string; relationship: string; has_voice: number; medicine_name: string; strength?: string; is_demo: number; conversation_enabled: number; duration_sec?: number }
export interface Reading { id: string; member_id: string; type: 'bp' | 'glucose'; systolic?: number; diastolic?: number; glucose?: number; unit: string; measured_at: string; note?: string; is_demo: number }
export interface Appt { id: string; member_id: string; member_name: string; doctor: string; clinic?: string; starts_at: string; notes?: string; voice_enabled: number; status: string; is_demo: number }

export const tz = 'Asia/Kolkata';
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
export const hhmm12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
