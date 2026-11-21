import { useState } from 'react'
import { usePersisted, uid, ymd } from '../lib/store'
import type { Habit } from '../lib/context'

const DEFAULTS: Habit[] = ['Stretch', '2L Water', 'Read 20 Min', 'Log Bets'].map((name) => ({ id: uid(), name, done: [] }))

function streak(done: string[]) {
  const set = new Set(done)
  let n = 0
  const d = new Date()
  if (!set.has(ymd(d))) d.setDate(d.getDate() - 1) // today not done yet: count from yesterday
  while (set.has(ymd(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

export default function Habits() {
  const [habits, setHabits] = usePersisted<Habit[]>('habits', DEFAULTS)
  const [edit, setEdit] = useState(false)
  const today = ymd(new Date())
  const toggle = (h: Habit) => setHabits(habits.map((x) => (x.id === h.id ? { ...x, done: x.done.includes(today) ? x.done.filter((d) => d !== today) : [...x.done, today] } : x)))
  const doneCount = habits.filter((h) => h.done.includes(today)).length

  return (
    <div className="card habits">
      <div className="row between"><span className="label">Habits · {doneCount}/{habits.length}</span><button className="link tiny" onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit'}</button></div>
      <div className="hgrid">
        {habits.map((h) => {
          const on = h.done.includes(today), s = streak(h.done)
          return (
            <button key={h.id} className={'habit' + (on ? ' on' : '')} onClick={() => (edit ? confirm(`Remove ${h.name}?`) && setHabits(habits.filter((x) => x.id !== h.id)) : toggle(h))}>
              <span className="hcheck">{edit ? '✕' : on ? '✓' : ''}</span>
              <span className="hname">{h.name}</span>
              {s > 0 && <span className="hstreak">{s}d</span>}
            </button>
          )
        })}
        {edit && <button className="habit add" onClick={() => { const n = prompt('New habit'); if (n) setHabits([...habits, { id: uid(), name: n, done: [] }]) }}><span className="hcheck">+</span><span className="hname">Add Habit</span></button>}
      </div>
    </div>
  )
}
