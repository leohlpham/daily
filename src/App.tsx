import { useEffect, useState } from 'react'
import { get, set } from 'idb-keyval'
import Today from './tabs/Today'
import Schedule from './tabs/Schedule'
import Money from './tabs/Money'
import Health from './tabs/Health'
import Betting from './tabs/Betting'
import Settings from './tabs/Settings'
import { ymd } from './lib/store'
import { captureGoogleRedirect } from './lib/google'
import { captureStravaCode, stravaFinishSignIn, stravaSyncNow } from './lib/strava'
import type { DailyLog } from './lib/types'

const TABS = [
  { id: 'today', label: 'Today', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { id: 'schedule', label: 'Schedule', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { id: 'money', label: 'Money', icon: 'M3 7h18v12H3zM3 11h18M7 15h3' },
  { id: 'health', label: 'Health', icon: 'M3 12h4l2-5 4 10 2-5h6' },
  { id: 'betting', label: 'Betting', icon: 'M4 18l5-6 4 3 7-9M15 6h5v5' },
  { id: 'settings', label: 'Settings', icon: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-2-4-2 1-2-2V4h-4v2L9 7 7 6 5 10l2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z' },
] as const

/** Health values passed in the URL by an iPhone Shortcut, e.g. ?steps=8123&sleep=7.4&rhr=52 */
async function applyHealthParams() {
  const p = new URLSearchParams(location.search)
  const num = (k: string) => { const v = parseFloat((p.get(k) ?? '').replace(/,/g, '')); return isNaN(v) ? undefined : v }
  const steps = num('steps'), sleepRaw = num('sleep'), rhr = num('rhr'), weight = num('weight')
  if (steps === undefined && sleepRaw === undefined && rhr === undefined && weight === undefined) return false
  const sleep = sleepRaw !== undefined && sleepRaw > 24 ? sleepRaw / 60 : sleepRaw // minutes → hours
  const date = p.get('date') ?? ymd(new Date())
  const logs: DailyLog[] = (await get('dailyLogs')) ?? []
  const cur = logs.find((l) => l.date === date) ?? { date }
  const next = { ...cur, ...(steps !== undefined && { steps: Math.round(steps) }), ...(sleep !== undefined && { sleepHrs: Math.round(sleep * 10) / 10 }), ...(rhr !== undefined && { restingHr: Math.round(rhr) }), ...(weight !== undefined && { weightKg: weight }) }
  await set('dailyLogs', [...logs.filter((l) => l.date !== date), next].sort((a, b) => a.date.localeCompare(b.date)))
  history.replaceState(null, '', location.pathname + location.hash)
  return true
}

const googleReturned = captureGoogleRedirect()
const stravaCode = captureStravaCode()

export default function App() {
  const [tab, setTab] = useState<string>(() => {
    if (stravaCode) return 'health'
    if (googleReturned) { try { localStorage.setItem('autoSync', '1') } catch { /* ignore */ } return 'schedule' }
    try { return localStorage.getItem('tab') || 'today' } catch { return 'today' }
  })
  const [toast, setToast] = useState('')
  const [k, setK] = useState(0)

  useEffect(() => { try { localStorage.setItem('tab', tab) } catch { /* ignore */ } window.scrollTo(0, 0) }, [tab])
  useEffect(() => {
    const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3000) }
    if (stravaCode) stravaFinishSignIn(stravaCode).then((n) => { flash(`Strava connected · ${n ?? 0} activities synced`); setK((x) => x + 1) }).catch((e) => flash(e.message))
    else stravaSyncNow().then((n) => { if (n) setK((x) => x + 1) }).catch(() => {})
    const onVis = () => { if (document.visibilityState === 'visible') stravaSyncNow().then((n) => { if (n) setK((x) => x + 1) }).catch(() => {}) }
    document.addEventListener('visibilitychange', onVis)
    applyHealthParams().then((did) => { if (did) { setToast('Health data updated from Shortcut'); setK((x) => x + 1); setTimeout(() => setToast(''), 3000) } })
    if (/code=|error=/.test(location.hash)) setTab('schedule') // returning from Microsoft sign-in
  }, [])

  return (
    <div className="app" key={k}>
      {toast && <div className="toast">{toast}</div>}
      <main>
        {tab === 'today' && <Today go={setTab} />}
        {tab === 'schedule' && <Schedule openSettings={() => setTab('settings')} />}
        {tab === 'money' && <Money />}
        {tab === 'health' && <Health />}
        {tab === 'betting' && <Betting />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
