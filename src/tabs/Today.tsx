import { usePersisted, money, ymd } from '../lib/store'
import { summarise } from '../lib/betting'
import type { Activity, Bet, CalEvent, DailyLog, Txn } from '../lib/types'

const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })

export default function Today({ go }: { go: (t: string) => void }) {
  const [events] = usePersisted<CalEvent[]>('events', [])
  const [txns] = usePersisted<Txn[]>('transactions', [])
  const [bets] = usePersisted<Bet[]>('bets', [])
  const [logs] = usePersisted<DailyLog[]>('dailyLogs', [])
  const [acts] = usePersisted<Activity[]>('activities', [])
  const now = new Date()
  const today = ymd(now)
  const hr = now.getHours()
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'

  const upcoming = events.filter((e) => e.start.slice(0, 10) === today && (e.allDay || new Date(e.end) > now)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3)
  const month = today.slice(0, 7)
  const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = ymd(lastMonthD).slice(0, 7)
  const dayOfMonth = now.getDate()
  const spendIn = (m: string, uptoDay?: number) => -txns.filter((t) => t.date.slice(0, 7) === m && t.amount < 0 && t.category !== 'Transfers' && (!uptoDay || Number(t.date.slice(8)) <= uptoDay)).reduce((s, t) => s + t.amount, 0)
  const thisSpend = spendIn(month), lastSpendSamePoint = spendIn(lastMonth, dayOfMonth)
  const latestTxn = txns.reduce((m, t) => (t.date > m ? t.date : m), '')
  const weekCut = ymd(new Date(Date.now() - 6 * 864e5))
  const bs = summarise(bets.filter((b) => b.date >= weekCut))
  const allPending = bets.filter((b) => b.result === 'pending').length
  const log = logs.find((l) => l.date === today)
  const lastNight = log?.sleepHrs
  const weekTrain = acts.filter((a) => a.date >= weekCut)

  return (
    <div className="page">
      <h1>{greet}, Leo</h1>
      <p className="muted">{now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      <button className="card tap upnext" onClick={() => go('schedule')}>
        <div className="row between"><span className="tiny muted upper">Up next</span><span className="muted tiny">›</span></div>
        {upcoming.map((e) => <div key={e.id} className="unrow"><span className="etime">{e.allDay ? 'All day' : fmt(e.start)}</span><span className="ellipsis">{e.title}</span></div>)}
        {!upcoming.length && <span className="muted small">Nothing left today</span>}
      </button>

      <div className="grid2">
        <button className="card tap" onClick={() => go('money')}>
          <h3>Spent This Month</h3>
          <b className="big">{money(thisSpend)}</b>
          {lastSpendSamePoint > 0 && <p className={'small ' + (thisSpend <= lastSpendSamePoint ? 'pos' : 'neg')}>{thisSpend <= lastSpendSamePoint ? '▼' : '▲'} {money(Math.abs(thisSpend - lastSpendSamePoint))} vs last month</p>}
          <p className="muted tiny">{latestTxn ? `Data to ${latestTxn}` : 'Import a CSV'}</p>
        </button>
        <button className="card tap" onClick={() => go('betting')}>
          <h3>Betting · 7 Days</h3>
          <b className={'big ' + (bs.profit >= 0 ? 'pos' : 'neg')}>{money(bs.profit)}</b>
          <p className="muted small">EV {money(bs.ev)}</p>
          <p className="muted tiny">{allPending} pending</p>
        </button>
        <button className="card tap" onClick={() => go('health')}>
          <h3>Sleep</h3>
          <b className="big">{lastNight ? `${lastNight.toFixed(1)}h` : '—'}</b>
          <p className="muted small">{log?.steps ? `${log.steps.toLocaleString()} steps` : 'Log today'}</p>
        </button>
        <button className="card tap" onClick={() => go('health')}>
          <h3>Training · 7 Days</h3>
          <b className="big">{weekTrain.length}</b>
          <p className="muted small">{Math.round(weekTrain.reduce((s, a) => s + (a.distanceKm ?? 0), 0))} km · {Math.round(weekTrain.reduce((s, a) => s + (a.durationMin ?? 0), 0))} min</p>
        </button>
      </div>
    </div>
  )
}
