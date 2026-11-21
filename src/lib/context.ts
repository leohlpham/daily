import { get } from 'idb-keyval'
import type { Activity, Bet, Bookmaker, CalEvent, DailyLog, Txn } from './types'
import { summarise } from './betting'
import { detectBills } from './bills'
import { ymd } from './store'

export interface TrainingDay { date: string; title: string; type: string; durationMin: number; intensity: string; details: string }
export interface TrainingPlan { goal: string; eventDate: string; daysPerWeek: number; generatedAt: string; focus: string; days: TrainingDay[] }
export interface Habit { id: string; name: string; done: string[] }

const r2 = (n: number) => Math.round(n * 100) / 100

/** Compact text snapshot of everything in the app, for Claude. */
export async function buildContext(): Promise<string> {
  const [txns, bets, bookies, events, logs, acts, plan, habits, dismissed] = await Promise.all([
    get<Txn[]>('transactions'), get<Bet[]>('bets'), get<Bookmaker[]>('bookmakers'), get<CalEvent[]>('events'),
    get<DailyLog[]>('dailyLogs'), get<Activity[]>('activities'), get<TrainingPlan>('trainingPlan'), get<Habit[]>('habits'), get<string[]>('dismissedBills'),
  ])
  const today = ymd(new Date())
  const out: string[] = [`Today is ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (Melbourne).`]

  // Money
  const T = txns ?? []
  if (T.length) {
    const months = [...new Set(T.map((t) => t.date.slice(0, 7)))].sort().slice(-4)
    out.push('\n## Spending (from bank CSV; transfers excluded)')
    for (const m of months) {
      const mt = T.filter((t) => t.date.startsWith(m) && t.category !== 'Transfers')
      const cats: Record<string, number> = {}
      for (const t of mt) if (t.amount < 0) cats[t.category] = (cats[t.category] ?? 0) - t.amount
      const income = mt.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      out.push(`${m}: income $${r2(income)}, spent $${r2(Object.values(cats).reduce((a, b) => a + b, 0))} — ` + Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} $${r2(v)}`).join(', '))
    }
    const recent = [...T].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40)
    out.push('Recent transactions: ' + recent.map((t) => `${t.date} ${t.description} ${t.amount} [${t.category}]`).join('; '))
    const bills = detectBills(T, dismissed ?? [])
    if (bills.length) out.push('Recurring bills: ' + bills.map((b) => `${b.name} ${b.cadence} $${r2(b.amount)} next ${b.next}`).join('; '))
  }

  // Betting
  const B = bets ?? []
  if (B.length || bookies?.length) {
    out.push('\n## +EV betting')
    const all = summarise(B), m30 = summarise(B.filter((b) => b.date >= ymd(new Date(Date.now() - 30 * 864e5))))
    out.push(`All time: ${all.count} bets, profit $${r2(all.profit)}, expected $${r2(all.ev)}, cash ROI ${(all.roi * 100).toFixed(1)}%, avg CLV ${all.avgClv !== null ? (all.avgClv * 100).toFixed(1) + '%' : 'n/a'}, bonus conversion ${all.bonusConversion !== null ? (all.bonusConversion * 100).toFixed(0) + '%' : 'n/a'}, pending stake $${r2(all.pendingStake)}.`)
    out.push(`Last 30 days: ${m30.count} bets, profit $${r2(m30.profit)}, expected $${r2(m30.ev)}.`)
    for (const bk of bookies ?? []) {
      const s = summarise(B.filter((b) => b.bookmaker === bk.name))
      out.push(`${bk.name} [${bk.status ?? 'active'}] balance ${bk.balance !== undefined ? '$' + bk.balance : '?'}: ${s.count} bets, profit $${r2(s.profit)}, EV $${r2(s.ev)}${bk.notes ? ', notes: ' + bk.notes : ''}`)
    }
    out.push('Recent bets: ' + B.slice(0, 25).map((b) => `${b.date} ${b.bookmaker} ${b.selection || b.event} ${b.type} $${b.stake}@${b.odds}${b.fairOdds ? ` fair ${b.fairOdds}` : ''} ${b.result}`).join('; '))
  }

  // Health
  const L = (logs ?? []).filter((l) => l.date >= ymd(new Date(Date.now() - 30 * 864e5)))
  if (L.length) {
    out.push('\n## Daily health (Garmin)')
    out.push(L.map((l) => `${l.date}: ` + Object.entries(l).filter(([k, v]) => k !== 'date' && v !== undefined && v !== '').map(([k, v]) => `${k}=${v}`).join(' ')).join('\n'))
  }
  const A = (acts ?? []).filter((a) => a.date >= ymd(new Date(Date.now() - 42 * 864e5)))
  if (A.length) out.push('\n## Workouts, last 6 weeks\n' + A.map((a) => `${a.date} ${a.type} "${a.title}"${a.distanceKm ? ` ${a.distanceKm.toFixed(1)}km` : ''}${a.durationMin ? ` ${Math.round(a.durationMin)}min` : ''}${a.avgHr ? ` HR${a.avgHr}` : ''}`).join('\n'))
  if (plan) out.push(`\n## Training plan\nGoal: ${plan.goal}${plan.eventDate ? ` on ${plan.eventDate}` : ''}. Focus: ${plan.focus}\n` + plan.days.map((d) => `${d.date}: ${d.title} (${d.intensity}, ${d.durationMin}min) ${d.details}`).join('\n'))

  // Schedule
  const E = (events ?? []).filter((e) => e.start.slice(0, 10) >= today && e.start.slice(0, 10) <= ymd(new Date(Date.now() + 7 * 864e5))).sort((a, b) => a.start.localeCompare(b.start))
  if (E.length) out.push('\n## Next 7 days\n' + E.map((e) => `${e.start.slice(0, 16).replace('T', ' ')}${e.allDay ? ' (all day)' : `-${e.end.slice(11, 16)}`} ${e.title} [${e.source}]`).join('\n'))

  if (habits?.length) out.push('\n## Habits\n' + habits.map((h) => `${h.name}: done on ${h.done.filter((d) => d >= ymd(new Date(Date.now() - 14 * 864e5))).join(', ') || 'none in 2 weeks'}`).join('\n'))
  return out.join('\n')
}
