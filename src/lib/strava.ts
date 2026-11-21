import type { Activity } from './types'

/**
 * Strava sync for a personal app. Strava's token exchange needs the app's client secret; it is kept
 * only on this device (the user's own API app), never sent anywhere except strava.com.
 */
const KEY = 'stravaAuth'
interface Auth { access: string; refresh: string; expires: number; athlete?: string }
const redirectUri = () => location.origin + location.pathname

export const stravaAuth = (): Auth | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
const save = (a: Auth | null) => { try { a ? localStorage.setItem(KEY, JSON.stringify(a)) : localStorage.removeItem(KEY) } catch { /* ignore */ } }
export const stravaDisconnect = () => save(null)

export function stravaSignIn(clientId: string) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri(), response_type: 'code', approval_prompt: 'auto', scope: 'activity:read_all', state: 'strava' })
  location.href = 'https://www.strava.com/oauth/authorize?' + q
}

/** If we just came back from Strava with ?code=…&state=strava, return the code and clean the URL. */
export function captureStravaCode(): string | null {
  const p = new URLSearchParams(location.search)
  if (p.get('state') !== 'strava' || !p.get('code')) return null
  const code = p.get('code')!
  history.replaceState(null, '', location.pathname + location.hash)
  return code
}

async function token(body: Record<string, string>): Promise<Auth> {
  const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`Strava sign-in failed (${r.status}). Check the client ID and secret in Settings.`)
  const j = await r.json()
  const prev = stravaAuth()
  return { access: j.access_token, refresh: j.refresh_token, expires: j.expires_at * 1000, athlete: j.athlete ? `${j.athlete.firstname ?? ''} ${j.athlete.lastname ?? ''}`.trim() : prev?.athlete }
}

export async function stravaExchange(clientId: string, secret: string, code: string) {
  save(await token({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' }))
}

async function access(clientId: string, secret: string): Promise<string> {
  const a = stravaAuth()
  if (!a) throw new Error('Not connected to Strava')
  if (a.expires - 60000 > Date.now()) return a.access
  const n = await token({ client_id: clientId, client_secret: secret, refresh_token: a.refresh, grant_type: 'refresh_token' })
  save(n)
  return n.access
}

const TYPE: Record<string, string> = { Run: 'Running', TrailRun: 'Trail Running', VirtualRun: 'Treadmill Running', Ride: 'Cycling', VirtualRide: 'Indoor Cycling', GravelRide: 'Gravel Cycling', MountainBikeRide: 'Mountain Biking', Swim: 'Swimming', Walk: 'Walking', Hike: 'Hiking', WeightTraining: 'Strength Training', Workout: 'Workout', Yoga: 'Yoga', Rowing: 'Rowing' }

/** Fetch activities since a date (inclusive). Pages through everything. */
export async function fetchStravaActivities(clientId: string, secret: string, since: Date): Promise<Activity[]> {
  const t = await access(clientId, secret)
  const out: Activity[] = []
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${Math.floor(since.getTime() / 1000)}&per_page=100&page=${page}`, { headers: { Authorization: `Bearer ${t}` } })
    if (!r.ok) throw new Error(`Strava returned ${r.status}`)
    const list = await r.json()
    for (const a of list) {
      out.push({
        id: 'strava_' + a.id, date: String(a.start_date_local).slice(0, 10), type: TYPE[a.sport_type] ?? TYPE[a.type] ?? a.sport_type ?? a.type, title: a.name,
        distanceKm: a.distance ? a.distance / 1000 : undefined, durationMin: a.moving_time ? a.moving_time / 60 : undefined,
        calories: a.kilojoules ? Math.round(a.kilojoules / 4.184 / 0.24) : undefined, avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
      })
    }
    if (list.length < 100) break
  }
  return out
}

/** Merge Strava activities into the stored list: replaces earlier Strava copies and skips Garmin CSV rows for the same session. */
export function mergeActivities(existing: Activity[], incoming: Activity[]): Activity[] {
  const ids = new Set(incoming.map((a) => a.id))
  const sameSession = (a: Activity, b: Activity) => a.date === b.date && Math.abs((a.durationMin ?? 0) - (b.durationMin ?? 0)) < 3 && Math.abs((a.distanceKm ?? 0) - (b.distanceKm ?? 0)) < 0.3
  const kept = existing.filter((e) => !ids.has(e.id) && !(e.id.startsWith('strava_') === false && incoming.some((i) => sameSession(i, e))))
  return [...kept, ...incoming].sort((a, b) => a.date.localeCompare(b.date))
}

import { get, set } from 'idb-keyval'

/** Pull recent Strava activities into storage. Returns number of activities synced, or null if not connected. */
export async function stravaSyncNow(force = false): Promise<number | null> {
  if (!stravaAuth()) return null
  const clientId: string = (await get('stravaClientId')) ?? '', secret: string = (await get('stravaSecret')) ?? ''
  if (!clientId || !secret) return null
  let last = 0
  try { last = Number(localStorage.getItem('stravaLastSync') || 0) } catch { /* ignore */ }
  if (!force && Date.now() - last < 30 * 60000) return null
  const existing: Activity[] = (await get('activities')) ?? []
  const hasStrava = existing.some((a) => a.id.startsWith('strava_'))
  const since = new Date(Date.now() - (hasStrava ? 30 : 180) * 864e5) // first sync: 6 months of history
  const incoming = await fetchStravaActivities(clientId, secret, since)
  await set('activities', mergeActivities(existing, incoming))
  try { localStorage.setItem('stravaLastSync', String(Date.now())) } catch { /* ignore */ }
  return incoming.length
}

export async function stravaFinishSignIn(code: string) {
  const clientId: string = (await get('stravaClientId')) ?? '', secret: string = (await get('stravaSecret')) ?? ''
  await stravaExchange(clientId, secret, code)
  return stravaSyncNow(true)
}
