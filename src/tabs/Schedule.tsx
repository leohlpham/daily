import { useEffect, useMemo, useState } from 'react'
import { usePersisted, uid, ymd } from '../lib/store'
import { fetchOutlookEvents, outlookAccount, outlookSignIn } from '../lib/outlook'
import { aiPlan, rulePlan } from '../lib/planner'
import type { Activity, CalEvent, DailyLog, PlanGoal, PlanSettings } from '../lib/types'

export const DEFAULT_GOALS: PlanGoal[] = [
  { id: 'train', title: 'Training', minutes: 60, days: [1, 2, 3, 4, 5, 6], earliest: '06:00', latest: '19:30', color: '#22c55e' },
  { id: 'focus', title: 'Deep work', minutes: 90, days: [1, 2, 3, 4, 5], earliest: '08:00', latest: '17:00', color: '#3b82f6' },
  { id: 'ev', title: '+EV betting session', minutes: 45, days: [0, 1, 2, 3, 4, 5, 6], earliest: '17:00', latest: '21:30', color: '#f59e0b' },
  { id: 'admin', title: 'Admin & money check', minutes: 20, days: [0, 3], earliest: '09:00', latest: '20:00', color: '#a855f7' },
]
export const DEFAULT_SETTINGS: PlanSettings = { dayStart: '06:30', dayEnd: '22:30', buffer: 10 }

const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x) }

export default function Schedule({ openSettings }: { openSettings: () => void }) {
  const [events, setEvents] = usePersisted<CalEvent[]>('events', [])
  const [goals, setGoals] = usePersisted<PlanGoal[]>('planGoals', DEFAULT_GOALS)
  const [settings, setSettings] = usePersisted<PlanSettings>('planSettings', DEFAULT_SETTINGS)
  const [clientId] = usePersisted<string>('msClientId', '')
  const [apiKey] = usePersisted<string>('anthropicKey', '')
  const [logs] = usePersisted<DailyLog[]>('dailyLogs', [])
  const [acts] = usePersisted<Activity[]>('activities', [])
  const [date, setDate] = useState(ymd(new Date()))
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [summary, setSummary] = useState('')
  const [extra, setExtra] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [showGoals, setShowGoals] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => { outlookAccount(clientId).then((a) => setSignedIn(!!a)).catch(() => {}) }, [clientId])

  const day = useMemo(() => events.filter((e) => e.start.slice(0, 10) === date).sort((a, b) => (a.allDay ? -1 : b.allDay ? 1 : a.start.localeCompare(b.start))), [events, date])

  async function sync() {
    if (!clientId) { setMsg('Add your Microsoft app ID in Settings first (one-time setup, steps are there).'); return }
    if (!signedIn) { await outlookSignIn(clientId); return }
    setBusy('Syncing Outlook…')
    try {
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - 7)
      const to = new Date(from); to.setDate(to.getDate() + 42)
      const fresh = await fetchOutlookEvents(clientId, from, to)
      const fromS = ymd(from), toS = ymd(to)
      setEvents([...events.filter((e) => e.source !== 'outlook' || e.start.slice(0, 10) < fromS || e.start.slice(0, 10) >= toS), ...fresh])
      setMsg(`Synced ${fresh.length} Outlook events.`)
    } catch (e) { setMsg((e as Error).message) }
    setBusy('')
  }

  async function plan(useAi: boolean) {
    const fixed = events.filter((e) => e.source !== 'plan')
    const keep = events.filter((e) => !(e.source === 'plan' && e.start.slice(0, 10) === date))
    setSummary('')
    if (useAi) {
      setBusy('Claude is planning your day…')
      try {
        const r = await aiPlan({ apiKey, date, events: fixed, goals, settings, recentLogs: logs, recentActivities: acts, extra })
        setEvents([...keep, ...r.events.map((e) => ({ ...e, note: r.notes[e.id] }))])
        setSummary(r.summary)
      } catch (e) { setMsg('Planning failed: ' + (e as Error).message) }
      setBusy('')
    } else {
      setEvents([...keep, ...rulePlan(date, fixed, goals, settings)])
    }
  }

  const label = date === ymd(new Date()) ? 'Today' : date === addDays(ymd(new Date()), 1) ? 'Tomorrow' : new Date(date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <div className="page">
      <div className="row between"><h1>Schedule</h1><button className="btn" onClick={sync} disabled={!!busy}>{signedIn ? '↻ Outlook' : 'Connect Outlook'}</button></div>
      <div className="daynav"><button onClick={() => setDate(addDays(date, -1))}>‹</button><b onClick={() => setDate(ymd(new Date()))}>{label}</b><button onClick={() => setDate(addDays(date, 1))}>›</button></div>
      {msg && <div className="notice" onClick={() => setMsg('')}>{msg}</div>}
      {busy && <div className="notice">{busy}</div>}

      <div className="card">
        <input placeholder="Anything special today? (optional, e.g. ‘long run’, ‘tired’)" value={extra} onChange={(e) => setExtra(e.target.value)} />
        <div className="row gap">
          <button className="btn primary grow" disabled={!!busy} onClick={() => apiKey ? plan(true) : (setMsg('Add your Claude API key in Settings to use AI planning. Using the quick planner instead.'), plan(false))}>✨ Plan my day</button>
          <button className="btn" disabled={!!busy} onClick={() => plan(false)}>Quick plan</button>
        </div>
        {summary && <p className="muted small">{summary}</p>}
        {!apiKey && <p className="muted small">AI planning needs a Claude API key. <button className="link" onClick={openSettings}>Add one in Settings</button></p>}
      </div>

      <div className="timeline">
        {day.map((e) => (
          <div key={e.id} className={'event ' + e.source}>
            <div className="time">{e.allDay ? 'All day' : <>{fmt(e.start)}<br /><span className="muted">{fmt(e.end)}</span></>}</div>
            <div className="grow">
              <b>{e.title}</b>
              {e.location && <div className="muted small">{e.location}</div>}
              {e.note && <div className="muted small">{e.note}</div>}
              <div className="muted tiny">{e.source === 'outlook' ? 'Outlook' : e.source === 'plan' ? 'Planned' : 'Manual'}</div>
            </div>
            {e.source !== 'outlook' && <button className="link" onClick={() => setEvents(events.filter((x) => x.id !== e.id))}>✕</button>}
          </div>
        ))}
        {!day.length && <p className="muted center">Nothing scheduled. Connect Outlook or tap Plan my day.</p>}
      </div>
      <div className="row gap">
        <button className="btn" onClick={() => setAdding(true)}>+ Event</button>
        <button className="btn" onClick={() => setShowGoals(!showGoals)}>{showGoals ? 'Hide routine' : 'Edit routine'}</button>
      </div>

      {showGoals && <Goals goals={goals} setGoals={setGoals} settings={settings} setSettings={setSettings} />}
      {adding && <AddEvent date={date} onAdd={(e) => { setEvents([...events, e]); setAdding(false) }} onClose={() => setAdding(false)} />}
    </div>
  )
}

function Goals({ goals, setGoals, settings, setSettings }: { goals: PlanGoal[]; setGoals: (g: PlanGoal[]) => void; settings: PlanSettings; setSettings: (s: PlanSettings) => void }) {
  const upd = (id: string, p: Partial<PlanGoal>) => setGoals(goals.map((g) => (g.id === id ? { ...g, ...p } : g)))
  return (
    <div className="card">
      <h3>Daily routine</h3>
      <div className="grid3">
        <label className="field"><span>Day starts</span><input type="time" value={settings.dayStart} onChange={(e) => setSettings({ ...settings, dayStart: e.target.value })} /></label>
        <label className="field"><span>Day ends</span><input type="time" value={settings.dayEnd} onChange={(e) => setSettings({ ...settings, dayEnd: e.target.value })} /></label>
        <label className="field"><span>Gap (min)</span><input inputMode="numeric" value={settings.buffer} onChange={(e) => setSettings({ ...settings, buffer: Number(e.target.value) || 0 })} /></label>
      </div>
      {goals.map((g) => (
        <div key={g.id} className="goal">
          <div className="row gap"><input className="grow" value={g.title} onChange={(e) => upd(g.id, { title: e.target.value })} /><button className="link danger" onClick={() => setGoals(goals.filter((x) => x.id !== g.id))}>✕</button></div>
          <div className="grid3">
            <label className="field"><span>Minutes</span><input inputMode="numeric" value={g.minutes} onChange={(e) => upd(g.id, { minutes: Number(e.target.value) || 0 })} /></label>
            <label className="field"><span>From</span><input type="time" value={g.earliest} onChange={(e) => upd(g.id, { earliest: e.target.value })} /></label>
            <label className="field"><span>Until</span><input type="time" value={g.latest} onChange={(e) => upd(g.id, { latest: e.target.value })} /></label>
          </div>
          <div className="days">{'SMTWTFS'.split('').map((d, i) => <button key={i} className={g.days.includes(i) ? 'on' : ''} onClick={() => upd(g.id, { days: g.days.includes(i) ? g.days.filter((x) => x !== i) : [...g.days, i].sort() })}>{d}</button>)}</div>
        </div>
      ))}
      <button className="btn" onClick={() => setGoals([...goals, { id: uid(), title: 'New block', minutes: 30, days: [1, 2, 3, 4, 5], earliest: '09:00', latest: '18:00', color: '#64748b' }])}>+ Add block</button>
    </div>
  )
}

function AddEvent({ date, onAdd, onClose }: { date: string; onAdd: (e: CalEvent) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('12:00')
  const [end, setEnd] = useState('13:00')
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>New event</h3>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid2">
          <label className="field"><span>Start</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field"><span>End</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <div className="row gap"><button className="btn primary" disabled={!title} onClick={() => onAdd({ id: uid(), title, start: `${date}T${start}:00`, end: `${date}T${end}:00`, source: 'manual' })}>Add</button><button className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  )
}
