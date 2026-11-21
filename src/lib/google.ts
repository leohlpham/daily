import type { CalEvent } from './types'
import { ymd } from './store'

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const TOKEN_KEY = 'googleToken'
const redirectUri = () => location.origin + location.pathname

/** Called on app start: captures the token Google sends back in the URL hash. */
export function captureGoogleRedirect(): boolean {
  if (!location.hash.includes('access_token') || !location.hash.includes('state=google')) return false
  const p = new URLSearchParams(location.hash.slice(1))
  const token = p.get('access_token'), exp = Number(p.get('expires_in') || 3600)
  if (token) try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, until: Date.now() + (exp - 60) * 1000 })) } catch { /* ignore */ }
  history.replaceState(null, '', location.pathname + location.search)
  try { localStorage.setItem('googleConnected', '1') } catch { /* ignore */ }
  return true
}

export const googleConnected = () => { try { return localStorage.getItem('googleConnected') === '1' } catch { return false } }
export function googleDisconnect() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('googleConnected') } catch { /* ignore */ } }

function validToken(): string | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')
    return t && t.until > Date.now() ? t.token : null
  } catch { return null }
}

/** Full-page redirect to Google (popups don't work in iPhone home-screen apps). Google remembers consent, so repeat sign-ins are instant. */
export function googleSignIn(clientId: string, silent = false) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPE, include_granted_scopes: 'true', state: 'google', ...(silent ? {} : { prompt: 'select_account' }) })
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + q
}

const localIso = (s: string) => { const d = new Date(s); return `${ymd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00` }

/** Returns null if a sign-in redirect is needed. */
export async function fetchGoogleEvents(clientId: string, from: Date, to: Date): Promise<CalEvent[] | null> {
  const token = validToken()
  if (!token) { googleSignIn(clientId, true); return null }
  const h = { Authorization: `Bearer ${token}` }
  const lr = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', { headers: h })
  if (lr.status === 401) { googleSignIn(clientId, true); return null }
  if (!lr.ok) throw new Error(`Google returned ${lr.status}`)
  const cals = ((await lr.json()).items ?? []).filter((c: { selected?: boolean; primary?: boolean }) => c.selected || c.primary)
  const out: CalEvent[] = []
  for (const c of cals) {
    let pageToken = ''
    do {
      const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250', ...(pageToken && { pageToken }) })
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${q}`, { headers: h })
      if (!r.ok) break
      const j = await r.json()
      for (const e of j.items ?? []) {
        if (e.status === 'cancelled' || e.transparency === 'transparent') continue
        const allDay = !!e.start?.date
        out.push({
          id: 'g_' + c.id + '_' + e.id, title: e.summary || '(busy)', source: 'google', location: e.location || undefined, allDay,
          start: allDay ? `${e.start.date}T00:00:00` : localIso(e.start.dateTime),
          end: allDay ? `${e.end.date}T00:00:00` : localIso(e.end.dateTime),
        })
      }
      pageToken = j.nextPageToken || ''
    } while (pageToken)
  }
  return out
}
