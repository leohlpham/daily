import { useMemo, useRef, useState } from 'react'
import { usePersisted, uid, ymd } from '../lib/store'
import { parseCsv, parseDate } from '../lib/csv'
import type { Activity, DailyLog } from '../lib/types'
import { stravaAuth, stravaSyncNow } from '../lib/strava'
import { extractGarminStats } from '../lib/garminShot'

const hms = (s: string) => { const p = s.split(':').map(Number); if (p.some(isNaN)) return undefined; return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p.length === 2 ? p[0] + p[1] / 60 : undefined }
const n = (s?: string) => { if (!s) return undefined; const v = parseFloat(s.replace(/,/g, '')); return isNaN(v) ? undefined : v }

export function importGarminCsv(text: string): Activity[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const h = rows[0].map((c) => c.toLowerCase())
  const col = (name: string) => h.findIndex((c) => c === name)
  const iType = col('activity type'), iDate = col('date'), iTitle = col('title'), iDist = col('distance'), iCal = col('calories'), iTime = col('time') >= 0 ? col('time') : col('moving time'), iHr = col('avg hr')
  if (iDate < 0) throw new Error("This doesn't look like a Garmin Connect activities export (no Date column).")
  return rows.slice(1).flatMap((r) => {
    const date = parseDate(r[iDate] ?? '')
    if (!date) return []
    return [{ id: uid(), date, type: r[iType] ?? 'Activity', title: r[iTitle] ?? '', distanceKm: n(r[iDist]), durationMin: iTime >= 0 ? hms(r[iTime] ?? '') : undefined, calories: n(r[iCal]), avgHr: n(r[iHr]) }]
  })
}

export default function Health() {
  const [logs, setLogs] = usePersisted<DailyLog[]>('dailyLogs', [])
  const [acts, setActs] = usePersisted<Activity[]>('activities', [])
  const [date, setDate] = useState(ymd(new Date()))
  const [msg, setMsg] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const shotRef = useRef<HTMLInputElement>(null)
  const [apiKey] = usePersisted<string>('anthropicKey', '')

  async function onGarminShots(files: File[]) {
    if (!files.length) return
    if (!apiKey) { setMsg('Add your Claude API key in Settings to read Garmin screenshots.'); return }
    setMsg('Reading Garmin screenshots…')
    try {
      const g = await extractGarminStats(apiKey, files, ymd(new Date()))
      const d = /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : ymd(new Date())
      const patch: Partial<DailyLog> = {}
      const keys = ['bodyBattery', 'hrv', 'hrvStatus', 'stress', 'sleepScore', 'sleepHrs', 'readiness', 'vo2max', 'trainingStatus', 'trainingLoad', 'restingHr', 'steps'] as const
      for (const k of keys) { const v = g[k]; if (v !== null && v !== undefined && v !== '') (patch as Record<string, unknown>)[k] = v }
      const cur = logs.find((l) => l.date === d) ?? { date: d }
      setLogs([...logs.filter((l) => l.date !== d), { ...cur, ...patch }].sort((a, b) => a.date.localeCompare(b.date)))
      setDate(d)
      setMsg(`Saved ${Object.keys(patch).length} Garmin stats for ${d}.`)
    } catch (e) { setMsg((e as Error).message) }
  }
  const log = logs.find((l) => l.date === date) ?? { date }
  const set = (p: Partial<DailyLog>) => setLogs([...logs.filter((l) => l.date !== date), { ...log, ...p }].sort((a, b) => a.date.localeCompare(b.date)))

  const last14 = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = ymd(new Date(Date.now() - (13 - i) * 864e5)); return { d, l: logs.find((x) => x.date === d) } }), [logs])
  const weekCut = ymd(new Date(Date.now() - 6 * 864e5))
  const weekActs = acts.filter((a) => a.date >= weekCut)
  const avg = (k: keyof DailyLog) => { const v = last14.slice(7).map((x) => x.l?.[k]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  const maxSteps = Math.max(10000, ...last14.map((x) => x.l?.steps ?? 0))

  async function onFile(f: File) {
    try {
      const incoming = importGarminCsv(await f.text())
      const key = (a: Activity) => `${a.date}|${a.title}|${a.durationMin?.toFixed(0)}`
      const seen = new Set(acts.map(key))
      const fresh = incoming.filter((a) => !seen.has(key(a)))
      setActs([...acts, ...fresh].sort((a, b) => a.date.localeCompare(b.date)))
      setMsg(`Imported ${fresh.length} new activities.`)
    } catch (e) { setMsg((e as Error).message) }
  }

  const numField = (k: keyof DailyLog, label: string, mode: 'decimal' | 'numeric' = 'decimal') => (
    <label className="field"><span>{label}</span><input inputMode={mode} value={(log[k] as number | undefined) ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); set({ [k]: isNaN(v) ? undefined : v }) }} /></label>
  )
  const scale = (k: 'mood' | 'energy', label: string) => (
    <div className="field"><span>{label}</span><div className="days">{[1, 2, 3, 4, 5].map((v) => <button key={v} className={log[k] === v ? 'on' : ''} onClick={() => set({ [k]: log[k] === v ? undefined : v })}>{v}</button>)}</div></div>
  )

  return (
    <div className="page">
      <div className="row between"><h1>Health</h1><div className="row gap"><button className="btn" onClick={() => shotRef.current?.click()}>Garmin screenshot</button><button className="btn" onClick={() => fileRef.current?.click()}>CSV</button></div>
        <input ref={shotRef} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; onGarminShots(f) }} />
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} /></div>
      {msg && <div className="notice" onClick={() => setMsg('')}>{msg}</div>}

      <div className="stats3">
        <div className="stat"><span>Avg sleep</span><b>{avg('sleepHrs')?.toFixed(1) ?? '—'}h</b></div>
        <div className="stat"><span>Avg steps</span><b>{avg('steps') ? Math.round(avg('steps')!).toLocaleString() : '—'}</b></div>
        <div className="stat"><span>7-day training</span><b>{Math.round(weekActs.reduce((s, a) => s + (a.durationMin ?? 0), 0))}m</b></div>
      </div>

      <div className="card">
        <div className="row between"><h3>Garmin advanced stats · {log.date === ymd(new Date()) ? 'Today' : log.date}</h3></div>
        <div className="adv">
          {([['Body Battery', log.bodyBattery, ''], ['HRV', log.hrv, ' ms', log.hrvStatus], ['Stress', log.stress, ''], ['Sleep score', log.sleepScore, ''], ['Readiness', log.readiness, ''], ['VO2 max', log.vo2max, ''], ['Training load', log.trainingLoad, '', log.trainingStatus]] as [string, number | undefined, string, string?][]).map(([l, v, u, sub]) => (
            <div key={l} className="advcell"><span>{l}</span><b>{v ?? '—'}{v !== undefined && u ? <small>{u}</small> : null}</b>{sub && <em>{sub}</em>}</div>
          ))}
        </div>
        <p className="muted tiny">Garmin doesn't share these with Apple Health or Strava. Screenshot your My Day, HRV, Sleep or Training Readiness screens in Garmin Connect and tap “Garmin screenshot”. Claude fills them in.</p>
      </div>

      <div className="card">
        <h3>Last 14 days</h3>
        <div className="spark">{last14.map(({ d, l }) => (
          <div key={d} className="spark-col" title={d}>
            <div className="spark-bar steps" style={{ height: `${((l?.steps ?? 0) / maxSteps) * 100}%` }} />
            <div className="spark-bar sleep" style={{ height: `${((l?.sleepHrs ?? 0) / 10) * 100}%` }} />
            <span>{'SMTWTFS'[new Date(d + 'T12:00:00').getDay()]}</span>
          </div>
        ))}</div>
        <p className="muted tiny"><span className="dot steps" /> steps <span className="dot sleep" /> sleep</p>
      </div>

      <div className="card">
        <div className="row between"><h3>Daily log</h3><input type="date" className="date-sm" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="grid3">
          {numField('sleepHrs', 'Sleep (h)')}{numField('steps', 'Steps', 'numeric')}{numField('restingHr', 'Resting HR', 'numeric')}
          {numField('weightKg', 'Weight (kg)')}{numField('water', 'Water (L)')}
        </div>
        <div className="grid2">{scale('energy', 'Energy')}{scale('mood', 'Mood')}</div>
        <textarea placeholder="Notes" value={log.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        <button className="link" onClick={() => setShowHelp(!showHelp)}>{showHelp ? 'Hide' : 'How to fill this in automatically from Garmin'}</button>
        {showHelp && (
          <div className="muted small help">
            <p><b>Daily stats (sleep, steps, resting HR):</b> in Garmin Connect app → More → Settings → Connected Apps → Apple Health, turn everything on. Then make an iPhone Shortcut:</p>
            <ol>
              <li>Shortcuts app → new shortcut. Add <i>Find Health Samples</i> for Steps (today, sum), Sleep (last night, sum, hours) and Resting Heart Rate (latest).</li>
              <li>Add <i>Open URLs</i> with: <code>{location.origin + location.pathname}?steps=[Steps]&amp;sleep=[Sleep]&amp;rhr=[Resting HR]</code></li>
              <li>Automation tab → Time of Day (e.g. 9pm) → run it.</li>
            </ol>
            <p><b>Activities:</b> on connect.garmin.com (desktop site in Safari) → Activities → All Activities → Export CSV, then tap Import Garmin.</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row between"><h3>Recent activities</h3>
          {stravaAuth() ? <button className="link" onClick={async () => { setMsg('Syncing Strava…'); try { const n = await stravaSyncNow(true); setMsg(`Synced ${n ?? 0} Strava activities.`); location.reload() } catch (e) { setMsg((e as Error).message) } }}>↻ Strava</button> : <span className="muted tiny">Connect Strava in Settings for auto-sync</span>}
        </div>
        {[...acts].reverse().slice(0, 20).map((a) => (
          <div key={a.id} className="row between line">
            <span><b>{a.title || a.type}</b><br /><span className="muted small">{a.date} · {a.type}</span></span>
            <span className="right small">{a.distanceKm ? `${a.distanceKm.toFixed(2)} km` : ''}<br /><span className="muted">{a.durationMin ? `${Math.round(a.durationMin)} min` : ''}{a.avgHr ? ` · ${a.avgHr} bpm` : ''}</span></span>
          </div>
        ))}
        {!acts.length && <p className="muted">No activities yet. Connect Strava in Settings, or import a Garmin CSV.</p>}
      </div>
    </div>
  )
}
