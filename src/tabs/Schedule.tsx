import { useEffect, useMemo, useState } from 'react'
import { usePersisted, uid, ymd } from '../lib/store'
import { fetchOutlookEvents, outlookAccount } from '../lib/outlook'
import { aiPlan, rulePlan } from '../lib/planner'
import { fetchGoogleEvents, googleConnected } from '../lib/google'
import DayGrid from './DayGrid'
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
  const [events, setEvents, eventsLoaded] = usePersisted<CalEvent[]>('events', [])
  const [goals, setGoals] = usePersisted<PlanGoal[]>('planGoals', DEFAULT_GOALS)
  const [settings, setSettings] = usePersisted<PlanSettings>('planSettings', DEFAULT_SETTINGS)
  const [clientId] = usePersisted<string>('msClientId', '')
  const [googleId] = usePersisted<string>('googleClientId', '')
  const [showPlanOpts, setShowPlanOpts] = useState(false)
  const [apiKey] = usePersisted<string>('anthropicKey', '')
  const [logs] = usePersisted<DailyLog[]>('dailyLogs', [])
  const [acts] = usePersisted<Activity[]>('activities', [])
  const [date, setDate] = useState(ymd(new Date()))
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [summary, setSummary] = useState('')
  void openSettings
  const [extra, setExtra] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [showGoals, setShowGoals] = useState(false)
  const [adding, setAdding] = useState(false)
  const [view, setView] = useState<'day' | 'week'>('day')

  useEffect(() => {
    if (!eventsLoaded || !googleId) return
    let flag = false
    try { flag = localStorage.getItem('autoSync') === '1'; localStorage.removeItem('autoSync') } catch { /* ignore */ }
    if (flag) sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsLoaded, googleId])
  useEffect(() => { outlookAccount(clientId).then((a) => setSignedIn(!!a)).catch(() => {}) }, [clientId])

  const day = useMemo(() => events.filter((e) => e.start.slice(0, 10) === date).sort((a, b) => (a.allDay ? -1 : b.allDay ? 1 : a.start.localeCompare(b.start))), [events, date])

  async function sync() {
    const useOutlook = !!clientId && signedIn, useGoogle = !!googleId && googleConnected()
    if (!useOutlook && !useGoogle) { setMsg('Connect Outlook or Google Calendar in Settings first (one-time setup, steps are there).'); return }
    setBusy('Syncing calendars…')
    const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - 7)
    const to = new Date(from); to.setDate(to.getDate() + 42)
    const fromS = ymd(from), toS = ymd(to)
    const inRange = (e: CalEvent) => e.start.slice(0, 10) >= fromS && e.start.slice(0, 10) < toS
    let next = events
    const done: string[] = []
    try {
      if (useOutlook) {
        const o = await fetchOutlookEvents(clientId, from, to)
        next = [...next.filter((e) => e.source !== 'outlook' || !inRange(e)), ...o]; done.push(`${o.length} Outlook`)
      }
      if (useGoogle) {
        const g = await fetchGoogleEvents(googleId, from, to)
        if (g === null) { setEvents(next); return } // redirecting to Google
        next = [...next.filter((e) => e.source !== 'google' || !inRange(e)), ...g]; done.push(`${g.length} Google`)
      }
      setEvents(next)
      setMsg(`Synced ${done.join(' and ')} events.`)
    } catch (e) { setEvents(next); setMsg((e as Error).message) }
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

  const weekStart = (() => { const d = new Date(date + 'T12:00:00'); const off = (d.getDay() + 6) % 7; return addDays(date, -off) })()
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEvents = (d: string) => events.filter((e) => e.start.slice(0, 10) === d).sort((x, y) => (x.allDay ? -1 : y.allDay ? 1 : x.start.localeCompare(y.start)))
  const weekActs = acts.filter((x) => x.date >= weekStart && x.date <= weekDays[6])
  const busyMin = weekDays.reduce((s, d) => s + weekEvents(d).filter((e) => !e.allDay && e.source !== 'plan').reduce((t, e) => t + (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000, 0), 0)
  
  return (
    <div className="page compact">
      <div className="row between"><h2 className="title">Schedule</h2><div className="row gap"><button className="btn sm" onClick={() => setAdding(true)}>+</button><button className="btn sm" onClick={sync} disabled={!!busy}>↻ Sync</button></div></div>
      <div className="seg small">{(['day', 'week'] as const).map((v) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v}</button>)}</div>
      {msg && <div className="notice small" onClick={() => setMsg('')}>{msg}</div>}
      {busy && <div className="notice small">{busy}</div>}

      {view === 'day' && (
        <>
          <div className="daynav sm"><button onClick={() => setDate(addDays(date, -1))}>‹</button><b onClick={() => setDate(ymd(new Date()))}>{label}</b><button onClick={() => setDate(addDays(date, 1))}>›</button></div>
          <DayGrid date={date} events={day} dayStart={settings.dayStart} onRemove={(id) => setEvents(events.filter((x) => x.id !== id))} />

          <div className="planbar">
            <button className="btn xs primary" disabled={!!busy} onClick={() => apiKey ? plan(true) : (setMsg('Add your Claude API key in Settings for AI planning. Used the quick planner instead.'), plan(false))}>Plan my day</button>
            <button className="btn xs" disabled={!!busy} onClick={() => plan(false)}>Quick</button>
            <button className="btn xs" onClick={() => setShowPlanOpts(!showPlanOpts)} aria-label="More">⋯</button>
          </div>
          {showPlanOpts && (
            <div className="planopts">
              <input className="sm" placeholder="Anything special today? e.g. long run, tired" value={extra} onChange={(e) => setExtra(e.target.value)} />
              <div className="row gap"><button className="btn xs" onClick={() => setAdding(true)}>+ Event</button><button className="btn xs" onClick={() => setShowGoals(!showGoals)}>{showGoals ? 'Hide routine' : 'Edit routine'}</button></div>
            </div>
          )}
          {summary && <p className="muted tiny">{summary}</p>}
          {showGoals && <Goals goals={goals} setGoals={setGoals} settings={settings} setSettings={setSettings} />}
        </>
      )}

      {view === 'week' && (
        <>
          <div className="daynav sm"><button onClick={() => setDate(addDays(weekStart, -7))}>‹</button>
            <b onClick={() => setDate(ymd(new Date()))}>{new Date(weekStart + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {new Date(weekDays[6] + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</b>
            <button onClick={() => setDate(addDays(weekStart, 7))}>›</button></div>
          <div className="stats3 sm">
            <div className="stat"><span>Booked</span><b>{Math.round(busyMin / 6) / 10}h</b></div>
            <div className="stat"><span>Sessions</span><b>{weekActs.length}</b></div>
            <div className="stat"><span>Training</span><b>{Math.round(weekActs.reduce((t, x) => t + (x.distanceKm ?? 0), 0))}km · {Math.round(weekActs.reduce((t, x) => t + (x.durationMin ?? 0), 0))}m</b></div>
          </div>
          <div className="week">
            {weekDays.map((d) => {
              const evs = weekEvents(d), da = acts.filter((x) => x.date === d), isToday = d === ymd(new Date())
              return (
                <button key={d} className={'wday' + (isToday ? ' today' : '')} onClick={() => { setDate(d); setView('day') }}>
                  <div className="wlabel"><b>{new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' })}</b><span>{d.slice(8)}</span></div>
                  <div className="grow">
                    {evs.map((e) => <div key={e.id} className={'wev ' + e.source}><span className="etime">{e.allDay ? 'All day' : fmt(e.start)}</span><span className="ellipsis">{e.title}</span></div>)}
                    {da.map((x) => <div key={x.id} className="wev act"><span className="etime">{x.type.split(" ")[0]}</span><span className="ellipsis">{x.title || x.type}{x.distanceKm ? ` · ${x.distanceKm.toFixed(1)}km` : ''}{x.durationMin ? ` · ${Math.round(x.durationMin)}m` : ''}</span></div>)}
                    {!evs.length && !da.length && <div className="muted tiny">Free</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

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
