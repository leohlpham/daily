import { useEffect, useRef, useState } from 'react'
import type { CalEvent } from '../lib/types'
import { ymd } from '../lib/store'

const HOUR = 48 // px per hour
const mins = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }
const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
const hourLabel = (h: number) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`)

/** Lay overlapping events side by side. */
function layout(evs: CalEvent[]) {
  const items = evs.map((e) => ({ e, s: mins(e.start), en: Math.max(mins(e.start) + 15, e.end.slice(0, 10) > e.start.slice(0, 10) ? 1440 : mins(e.end)), col: 0, cols: 1 }))
    .sort((a, b) => a.s - b.s || b.en - a.en)
  let group: typeof items = [], groupEnd = -1
  const flush = () => { const n = Math.max(...group.map((g) => g.col)) + 1; group.forEach((g) => (g.cols = n)); group = [] }
  for (const it of items) {
    if (it.s >= groupEnd && group.length) flush()
    const used = new Set(group.filter((g) => g.en > it.s).map((g) => g.col))
    while (used.has(it.col)) it.col++
    group.push(it); groupEnd = Math.max(groupEnd, it.en)
  }
  if (group.length) flush()
  return items
}

export default function DayGrid({ date, events, dayStart, onRemove }: { date: string; events: CalEvent[]; dayStart: string; onRemove: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(new Date())
  const [sel, setSel] = useState<string | null>(null)
  const isToday = date === ymd(now)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const h = isToday ? Math.max(0, new Date().getHours() - 1) : Number(dayStart.split(':')[0])
    ref.current?.scrollTo({ top: h * HOUR, behavior: 'instant' as ScrollBehavior })
  }, [date, isToday, dayStart])

  const allDay = events.filter((e) => e.allDay)
  const timed = layout(events.filter((e) => !e.allDay))
  const nowTop = (now.getHours() * 60 + now.getMinutes()) * HOUR / 60

  return (
    <div className="daygrid-wrap">
      {allDay.length > 0 && <div className="allday">{allDay.map((e) => <span key={e.id} className={'adchip ' + e.source}>{e.title}</span>)}</div>}
      <div className="daygrid" ref={ref}>
        <div className="grid-inner" style={{ height: 24 * HOUR }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="hour" style={{ top: h * HOUR }}><span>{h ? hourLabel(h) : ''}</span></div>
          ))}
          {timed.map(({ e, s, en, col, cols }) => (
            <div key={e.id} className={'gev ' + e.source + (sel === e.id ? ' sel' : '')}
              style={{ top: s * HOUR / 60 + 1, height: Math.max(18, (en - s) * HOUR / 60 - 2), left: `calc(46px + (100% - 50px) * ${col / cols})`, width: `calc((100% - 50px) / ${cols} - 2px)` }}
              onClick={() => setSel(sel === e.id ? null : e.id)}>
              <div className="gtitle">{e.title}</div>
              {en - s >= 40 && <div className="gtime">{fmt(e.start)} – {fmt(e.end)}{e.location ? ` · ${e.location}` : ''}</div>}
              {sel === e.id && (
                <div className="gdetail">
                  {e.note && <div>{e.note}</div>}
                  {(e.source === 'plan' || e.source === 'manual') && <button className="link tiny" onClick={(ev) => { ev.stopPropagation(); onRemove(e.id) }}>Remove</button>}
                </div>
              )}
            </div>
          ))}
          {isToday && <div className="nowline" style={{ top: nowTop }} />}
        </div>
      </div>
    </div>
  )
}
