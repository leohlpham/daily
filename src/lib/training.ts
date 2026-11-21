import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { buildContext, type TrainingPlan } from './context'
import { ymd } from './store'

const PlanSchema = z.object({
  focus: z.string().describe('One or two sentences on this week\'s focus and why'),
  days: z.array(z.object({
    date: z.string().describe('YYYY-MM-DD'),
    title: z.string().describe('Short session name, e.g. "Easy run", "Threshold intervals", "Rest"'),
    type: z.enum(['run', 'ride', 'swim', 'strength', 'mobility', 'cross', 'rest']),
    durationMin: z.number(),
    intensity: z.enum(['rest', 'easy', 'moderate', 'hard']),
    details: z.string().describe('Specific workout: warm-up, main set with paces/HR zones, cool-down. One or two sentences.'),
  })),
})

export async function generatePlan(apiKey: string, goal: string, eventDate: string, daysPerWeek: number, prev?: TrainingPlan): Promise<TrainingPlan> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const start = ymd(new Date())
  const context = await buildContext()
  const prompt = `Build my training plan for the next 7 days starting ${start} (7 entries, one per date, rest days included).
Goal: ${goal || 'general fitness and endurance'}${eventDate ? `, target date ${eventDate}` : ''}. I can train ${daysPerWeek} days a week.
Use my recent workouts, sleep, HRV, Body Battery, readiness and resting HR from the data to set the load: progress sensibly (about 10% a week at most), back off if recovery markers are poor, and work around busy calendar days.
${prev ? `Last plan's focus was: ${prev.focus}. Compare what I planned with what I actually did and adapt.` : ''}`
  const res = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'medium', format: zodOutputFormat(PlanSchema) },
    system: [{ type: 'text', text: 'You are an experienced endurance and strength coach. Write specific, realistic sessions using HR zones or effort cues.' }, { type: 'text', text: '# Athlete data\n' + context }],
    messages: [{ role: 'user', content: prompt }],
  })
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error('Could not build a plan right now.')
  return { goal, eventDate, daysPerWeek, generatedAt: new Date().toISOString(), focus: res.parsed_output.focus, days: res.parsed_output.days.sort((a, b) => a.date.localeCompare(b.date)) }
}
