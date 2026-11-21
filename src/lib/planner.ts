import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { CalEvent, DailyLog, Activity, PlanGoal, PlanSettings } from './types'
import { uid } from './store'

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const at = (date: string, min: number) => `${date}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`
const minOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }

/** Free gaps (in minutes since midnight) on a date, given fixed events. */
export function freeGaps(date: string, events: CalEvent[], s: PlanSettings) {
  const busy = events
    .filter((e) => !e.allDay && e.start.slice(0, 10) === date)
    .map((e) => [minOf(e.start) - s.buffer, minOf(e.end) + s.buffer] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const gaps: [number, number][] = []
  let cur = toMin(s.dayStart)
  const end = toMin(s.dayEnd)
  for (const [a, b] of busy) {
    if (a > cur) gaps.push([cur, Math.min(a, end)])
    cur = Math.max(cur, b)
  }
  if (cur < end) gaps.push([cur, end])
  return gaps.filter(([a, b]) => b - a >= 15)
}

/** Simple greedy planner: places each goal for the day into the first free gap inside its window. */
export function rulePlan(date: string, events: CalEvent[], goals: PlanGoal[], s: PlanSettings): CalEvent[] {
  const dow = new Date(date + 'T12:00:00').getDay()
  let gaps = freeGaps(date, events, s)
  const out: CalEvent[] = []
  for (const g of goals.filter((g) => g.days.includes(dow))) {
    const lo = toMin(g.earliest), hi = toMin(g.latest)
    for (let i = 0; i < gaps.length; i++) {
      const a = Math.max(gaps[i][0], lo), b = Math.min(gaps[i][1], hi)
      if (b - a >= g.minutes) {
        out.push({ id: uid(), title: g.title, start: at(date, a), end: at(date, a + g.minutes), source: 'plan' })
        const used: [number, number] = [a, a + g.minutes + s.buffer]
        const next: [number, number][] = []
        if (used[0] - gaps[i][0] >= 15) next.push([gaps[i][0], used[0]])
        if (gaps[i][1] - used[1] >= 15) next.push([used[1], gaps[i][1]])
        gaps = [...gaps.slice(0, i), ...next, ...gaps.slice(i + 1)]
        break
      }
    }
  }
  return out
}

const PlanSchema = z.object({
  blocks: z.array(z.object({ title: z.string(), start: z.string().describe('HH:MM 24h'), end: z.string().describe('HH:MM 24h'), why: z.string() })),
  summary: z.string(),
})

export interface AiPlanResult { events: CalEvent[]; summary: string; notes: Record<string, string> }

/** Ask Claude to plan the day around fixed calendar events. Runs in the browser with the user's own API key. */
export async function aiPlan(opts: {
  apiKey: string; date: string; events: CalEvent[]; goals: PlanGoal[]; settings: PlanSettings
  recentLogs: DailyLog[]; recentActivities: Activity[]; extra: string
}): Promise<AiPlanResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true })
  const dow = new Date(opts.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long' })
  const fixed = opts.events.filter((e) => e.start.slice(0, 10) === opts.date && e.source !== 'plan')
    .map((e) => e.allDay ? `- All day: ${e.title}` : `- ${e.start.slice(11, 16)}-${e.end.slice(11, 16)} ${e.title}${e.location ? ` @ ${e.location}` : ''}`).join('\n') || '- (none)'
  const goals = opts.goals.map((g) => `- ${g.title}: ${g.minutes} min, between ${g.earliest} and ${g.latest}, on ${g.days.map((d) => 'SMTWTFS'[d]).join('')}`).join('\n') || '- (none set)'
  const logs = opts.recentLogs.slice(-7).map((l) => `- ${l.date}: sleep ${l.sleepHrs ?? '?'}h, steps ${l.steps ?? '?'}, energy ${l.energy ?? '?'}/5, mood ${l.mood ?? '?'}/5`).join('\n') || '- (no data)'
  const acts = opts.recentActivities.slice(-10).map((a) => `- ${a.date}: ${a.type} ${a.title}${a.distanceKm ? ` ${a.distanceKm.toFixed(1)}km` : ''}${a.durationMin ? ` ${Math.round(a.durationMin)}min` : ''}`).join('\n') || '- (no data)'

  const prompt = `Plan ${dow} ${opts.date} for me. My day runs ${opts.settings.dayStart} to ${opts.settings.dayEnd}. Leave ${opts.settings.buffer} min between blocks.

Fixed calendar events (do not move or overlap these):
${fixed}

Things I want to fit in:
${goals}

Last week of sleep/energy:
${logs}

Recent training (Garmin):
${acts}

${opts.extra ? `Anything else for today: ${opts.extra}\n` : ''}
Return only the new blocks to add (not my fixed events), including meals and a short wind-down if there's room. Adjust training intensity to my recent sleep and load. Keep each "why" to one short sentence, and the summary to two sentences.`

  const res = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    output_config: { effort: 'low', format: zodOutputFormat(PlanSchema) },
    system: 'You are a practical personal planner for someone in Melbourne, Australia who works, trains with a Garmin, and does positive-EV sports betting. Make realistic, specific schedules.',
    messages: [{ role: 'user', content: prompt }],
  })
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to plan this day.')
  const parsed = res.parsed_output
  if (!parsed) throw new Error('Could not read the plan from Claude.')
  const notes: Record<string, string> = {}
  const events = parsed.blocks.filter((b) => /^\d{1,2}:\d{2}$/.test(b.start) && /^\d{1,2}:\d{2}$/.test(b.end)).map((b) => {
    const id = uid(); notes[id] = b.why
    return { id, title: b.title, start: at(opts.date, toMin(b.start)), end: at(opts.date, toMin(b.end)), source: 'plan' as const }
  })
  return { events, summary: parsed.summary, notes }
}
