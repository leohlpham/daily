import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { toJpegBase64 } from './betImport'

const n = (d: string) => z.number().nullable().describe(d + ' (null if not visible)')
const Stats = z.object({
  date: z.string().describe('YYYY-MM-DD the stats are for, or empty if unclear (assume today)'),
  bodyBattery: n('Current or highest Body Battery 0-100'),
  hrv: n('Overnight HRV average in ms'),
  hrvStatus: z.string().nullable().describe('HRV status label, e.g. Balanced, Unbalanced, Low'),
  stress: n('Average stress level 0-100'),
  sleepScore: n('Sleep score 0-100'),
  sleepHrs: n('Total sleep in hours (decimal)'),
  readiness: n('Training readiness 0-100'),
  vo2max: n('VO2 max'),
  trainingStatus: z.string().nullable().describe('Training status label, e.g. Productive, Maintaining, Recovery'),
  trainingLoad: n('Acute training load'),
  restingHr: n('Resting heart rate bpm'),
  steps: n('Steps'),
})
export type GarminStats = z.infer<typeof Stats>

export async function extractGarminStats(apiKey: string, files: File[], today: string): Promise<GarminStats> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const images = await Promise.all(files.map((f) => toJpegBase64(f)))
  const res = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(Stats) },
    messages: [{ role: 'user', content: [
      ...images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
      { type: 'text', text: `These are screenshots from the Garmin Connect app (e.g. My Day, Body Battery, HRV status, Sleep, Training Readiness, Training Status). Today is ${today}. Read the health metrics for the most recent day shown. Only report values you can actually see.` },
    ] }],
  })
  if (res.stop_reason === 'refusal' || !res.parsed_output) throw new Error('Could not read those screenshots.')
  return res.parsed_output
}
