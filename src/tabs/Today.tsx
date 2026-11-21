import { usePersisted, money, ymd } from '../lib/store'
import { summarise } from '../lib/betting'
import { detectBills } from '../lib/bills'
import Habits from './Habits'
import type { TrainingPlan } from '../lib/context'
import type { Activity, Bet, CalEvent, DailyLog, Txn } from '../lib/types'

const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
const STEP_GOAL = 10000
const SLEEP_GOAL = 8

function Ring({ value, goal, size = 112, stroke = 10, color, children }: { value: number; goal: number; size?: number; stroke?: number; color: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, pct = Math.min(1, value / goal)
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chip)" strokeWidth={stroke} />
        {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .6s ease' }} />}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  )
}

/** 7-day single-series bars; the most recent day is emphasised. Tap a bar to read its value. */
function Spark({ values, color, format }: { values: { d: string; v?: number }[]; color: string; format: (v: number) => string }) {
  const nums = values.map((x) => x.v ?? 0)
  const max = Math.max(1, ...nums), min = 0
  return (
    <div className="spark7" role="img" aria-label={values.map((x) => `${x.d}: ${x.v !== undefined ? format(x.v) : 'no data'}`).join(', ')}>
      {values.map((x, i) => (
        <div key={x.d} className="s7col" title={`${new Date(x.d + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' })}: ${x.v !== undefined ? format(x.v) : '—'}`}>
          <div className="s7bar" style={{ height: x.v !== undefined ? `${Math.max(6, ((x.v - min) / (max - min)) * 100)}%` : '3px', background: x.v === undefined ? 'var(--chip)' : color, opacity: i === values.length - 1 ? 1 : 0.45 }} />
        </div>
      ))}
    </div>
  )
}

export default function Today({ go }: { go: (t: string) => void }) {
  const [events] = usePersisted<CalEvent[]>('events', [])
  const [txns] = usePersisted<Txn[]>('transactions', [])
  const [bets] = usePersisted<Bet[]>('bets', [])
  const [logs] = usePersisted<DailyLog[]>('dailyLogs', [])
  const [acts] = usePersisted<Activity[]>('activities', [])
  const [dismissed] = usePersisted<string[]>('dismissedBills', [])
  const [plan] = usePersisted<TrainingPlan | null>('trainingPlan', null)
  const now = new Date()
  const today = ymd(now)

  // Health
  const last7 = Array.from({ length: 7 }, (_, i) => ymd(new Date(Date.now() - (6 - i) * 864e5)))
  const logOf = (d: string) => logs.find((l) => l.date === d)
  const latest = [...logs].reverse().find((l) => l.steps !== undefined || l.sleepHrs !== undefined || l.restingHr !== undefined)
  const shown = logOf(today) ?? latest
  const shownLabel = !shown ? '' : shown.date === today ? 'Today' : shown.date === ymd(new Date(Date.now() - 864e5)) ? 'Yesterday' : new Date(shown.date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const series = (k: keyof DailyLog) => last7.map((d) => ({ d, v: logOf(d)?.[k] as number | undefined }))
  const avg = (k: keyof DailyLog) => { const v = series(k).map((x) => x.v).filter((x): x is number => x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined }
  const steps = shown?.steps ?? 0
  const weekCut = ymd(new Date(Date.now() - 6 * 864e5))
  const weekTrain = acts.filter((a) => a.date >= weekCut)
  const trainMin = Math.round(weekTrain.reduce((s, a) => s + (a.durationMin ?? 0), 0))

  // Schedule / money / betting
  const upcoming = events.filter((e) => e.start.slice(0, 10) === today && (e.allDay || new Date(e.end) > now)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3)
  const month = today.slice(0, 7)
  const lastMonth = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7)
  const spendIn = (m: string, uptoDay?: number) => -txns.filter((t) => t.date.slice(0, 7) === m && t.amount < 0 && t.category !== 'Transfers' && (!uptoDay || Number(t.date.slice(8)) <= uptoDay)).reduce((s, t) => s + t.amount, 0)
  const thisSpend = spendIn(month), lastSpend = spendIn(lastMonth, now.getDate())
  const bs = summarise(bets.filter((b) => b.date >= weekCut))
  const allPending = bets.filter((b) => b.result === 'pending').length
  const in7 = ymd(new Date(Date.now() + 7 * 864e5))
  const dueSoon = detectBills(txns, dismissed).filter((b) => b.next >= today && b.next <= in7)

  return (
    <div className="page home">
      <div className="home-head">
        <span className="date">{now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>

      <button className="card tap hero" onClick={() => go('health')}>
        <div className="row between"><span className="badge">Activity · {shownLabel || 'No Data Yet'}</span><span className="chev">›</span></div>
        <div className="hero-body">
          <Ring value={steps} goal={STEP_GOAL} color="var(--accent)">
            <b className="ring-num">{steps ? steps.toLocaleString() : '—'}</b>
            <span className="ring-sub">of {(STEP_GOAL / 1000).toFixed(0)}k steps</span>
          </Ring>
          <div className="metrics">
            <div className="metric"><span className="mlabel"><i className="dot-ic" style={{ background: 'var(--hr)' }} />Resting HR</span><b>{shown?.restingHr ?? '—'}<small> bpm</small></b></div>
            <div className="metric"><span className="mlabel"><i className="dot-ic" style={{ background: 'var(--sleep)' }} />Sleep</span><b>{shown?.sleepHrs?.toFixed(1) ?? '—'}<small> h</small></b>
              {shown?.sleepHrs !== undefined && <div className="minibar"><div style={{ width: `${Math.min(100, (shown.sleepHrs / SLEEP_GOAL) * 100)}%`, background: 'var(--sleep)' }} /></div>}</div>
            <div className="metric"><span className="mlabel"><i className="dot-ic" style={{ background: 'var(--train)' }} />Training · 7d</span><b>{trainMin}<small> min</small></b></div>
          </div>
        </div>
        {(shown?.bodyBattery !== undefined || shown?.hrv !== undefined || shown?.readiness !== undefined || shown?.stress !== undefined) && (
          <div className="advrow">
            {shown?.bodyBattery !== undefined && <span><em>Body Battery</em><b>{shown.bodyBattery}</b></span>}
            {shown?.hrv !== undefined && <span><em>HRV</em><b>{shown.hrv}<small>ms</small></b></span>}
            {shown?.readiness !== undefined && <span><em>Readiness</em><b>{shown.readiness}</b></span>}
            {shown?.stress !== undefined && <span><em>Stress</em><b>{shown.stress}</b></span>}
          </div>
        )}
      </button>

      <div className="trend-row">
        {([
          ['Steps', 'steps', 'var(--accent)', (v: number) => Math.round(v).toLocaleString()],
          ['Sleep', 'sleepHrs', 'var(--sleep)', (v: number) => v.toFixed(1) + 'h'],
          ['Resting HR', 'restingHr', 'var(--hr)', (v: number) => Math.round(v) + ''],
        ] as const).map(([label, k, color, f]) => {
          const a = avg(k)
          return (
            <button key={k} className="card tap trend" onClick={() => go('health')}>
              <span className="label">{label}</span>
              <b className="tnum">{a !== undefined ? f(a) : '—'}</b>
              <span className="tsub">7-day avg</span>
              <Spark values={series(k)} color={color} format={f} />
            </button>
          )
        })}
      </div>

      {(() => {
        const t = plan?.days.find((d) => d.date === today)
        return t ? (
          <button className="card tap session" onClick={() => go('health')}>
            <div className="row between"><span className="badge">Today's Training</span><span className={'intensity-pill ' + t.intensity}>{t.intensity}</span></div>
            <b className="small">{t.title}{t.type !== 'rest' ? ` · ${t.durationMin} min` : ''}</b>
            {t.type !== 'rest' && <span className="muted tiny">{t.details}</span>}
          </button>
        ) : null
      })()}

      <Habits />

      <button className="card tap upnext" onClick={() => go('schedule')}>
        <div className="row between"><span className="label">Up next</span><span className="chev">›</span></div>
        {upcoming.map((e) => <div key={e.id} className="unrow"><span className="etime">{e.allDay ? 'All day' : fmt(e.start)}</span><span className="ellipsis">{e.title}</span></div>)}
        {!upcoming.length && <span className="muted small">Nothing left today</span>}
      </button>

      <div className="grid2">
        <button className="card tap tile" onClick={() => go('money')}>
          <span className="label">Spent This Month</span>
          <b className="big">{money(thisSpend)}</b>
          {lastSpend > 0 ? <span className={'pill ' + (thisSpend <= lastSpend ? 'good' : 'bad')}>{thisSpend <= lastSpend ? '↓' : '↑'} {money(Math.abs(thisSpend - lastSpend))} vs last month</span> : <span className="foot">{txns.length ? 'This month so far' : 'Import a CSV'}</span>}
          {dueSoon.length > 0 && <span className="foot">{dueSoon.length} bill{dueSoon.length > 1 ? 's' : ''} due this week · {money(dueSoon.reduce((s, b) => s + b.amount, 0))}</span>}
        </button>
        <button className="card tap tile" onClick={() => go('betting')}>
          <span className="label">Betting · 7 Days</span>
          <b className={'big ' + (bs.profit >= 0 ? 'pos' : 'neg')}>{money(bs.profit)}</b>
          <span className="foot">EV {money(bs.ev)} · {allPending} pending</span>
        </button>
      </div>
    </div>
  )
}
