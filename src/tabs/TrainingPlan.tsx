import { useState } from 'react'
import { usePersisted, uid, ymd } from '../lib/store'
import { generatePlan } from '../lib/training'
import type { TrainingPlan as Plan } from '../lib/context'
import type { Activity, CalEvent, PlanGoal } from '../lib/types'

const TYPE_MATCH: Record<string, RegExp> = { run: /run/i, ride: /cycl|ride|bik/i, swim: /swim/i, strength: /strength|weight|gym/i, mobility: /yoga|mobil|pilates/i, cross: /.*/ }

export default function TrainingPlan({ acts }: { acts: Activity[] }) {
  const [apiKey] = usePersisted<string>('anthropicKey', '')
  const [plan, setPlan] = usePersisted<Plan | null>('trainingPlan', null)
  const [events, setEvents] = usePersisted<CalEvent[]>('events', [])
  const [goals] = usePersisted<PlanGoal[]>('planGoals', [])
  const [goal, setGoal] = useState(plan?.goal ?? '')
  const [eventDate, setEventDate] = useState(plan?.eventDate ?? '')
  const [dpw, setDpw] = useState(plan?.daysPerWeek ?? 5)
  const [editing, setEditing] = useState(!plan)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const today = ymd(new Date())

  async function build() {
    if (!apiKey) { setMsg('Add your Claude API key in Settings first.'); return }
    setBusy(true); setMsg('')
    try { const p = await generatePlan(apiKey, goal, eventDate, dpw, plan ?? undefined); setPlan(p); setEditing(false) } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }

  function addToSchedule() {
    if (!plan) return
    const g = goals.find((x) => /train/i.test(x.title))
    const startT = g?.earliest ?? '06:30'
    const [h, m] = startT.split(':').map(Number)
    const fresh = plan.days.filter((d) => d.type !== 'rest' && d.date >= today).map((d) => {
      const end = h * 60 + m + d.durationMin
      return { id: uid(), title: `Training: ${d.title}`, note: d.details, source: 'plan' as const, start: `${d.date}T${startT}:00`, end: `${d.date}T${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}:00` }
    })
    setEvents([...events.filter((e) => !(e.source === 'plan' && e.title.startsWith('Training: '))), ...fresh])
    setMsg(`Added ${fresh.length} sessions to your schedule.`)
  }

  const doneOn = (d: Plan['days'][number]) => d.type !== 'rest' && acts.some((a) => a.date === d.date && (TYPE_MATCH[d.type] ?? /.*/).test(a.type + ' ' + a.title))
  const weeksOut = eventDate ? Math.ceil((new Date(eventDate + 'T12:00:00').getTime() - Date.now()) / (7 * 864e5)) : null

  return (
    <div className="card">
      <div className="row between"><h3>Training Plan{weeksOut !== null && weeksOut > 0 ? ` · ${weeksOut} Weeks Out` : ''}</h3>
        {plan && !editing && <button className="link" onClick={() => setEditing(true)}>Edit Goal</button>}</div>
      {msg && <div className="notice small" onClick={() => setMsg('')}>{msg}</div>}
      {editing && (
        <div className="planform">
          <label className="field"><span>Goal</span><input value={goal} placeholder="e.g. Sub-1:40 half marathon, Melbourne Marathon" onChange={(e) => setGoal(e.target.value)} /></label>
          <div className="grid2">
            <label className="field"><span>Event Date</span><input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
            <label className="field"><span>Days Per Week</span><select value={dpw} onChange={(e) => setDpw(Number(e.target.value))}>{[3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}</select></label>
          </div>
        </div>
      )}
      {plan && !editing && (
        <>
          <p className="focus">{plan.focus}</p>
          <div className="tplan">
            {plan.days.map((d) => {
              const done = doneOn(d), past = d.date < today
              return (
                <div key={d.date} className={'tday ' + d.intensity + (d.date === today ? ' today' : '') + (done ? ' done' : past && d.type !== 'rest' ? ' missed' : '')}>
                  <div className="tdate"><b>{new Date(d.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short' })}</b><span>{d.date.slice(8)}</span></div>
                  <div className="grow">
                    <div className="row gap"><b className="small">{d.title}</b>{d.type !== 'rest' && <span className="muted tiny">{d.durationMin} min</span>}{done && <span className="tick">✓</span>}</div>
                    {d.type !== 'rest' && <div className="muted tiny">{d.details}</div>}
                  </div>
                  <span className={'intensity ' + d.intensity} />
                </div>
              )
            })}
          </div>
        </>
      )}
      <div className="row gap">
        <button className="btn sm primary grow" disabled={busy} onClick={build}>{busy ? 'Building…' : plan ? 'Adapt My Week' : 'Build My Plan'}</button>
        {plan && !editing && <button className="btn sm" onClick={addToSchedule}>Add To Schedule</button>}
        {editing && plan && <button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
    </div>
  )
}
