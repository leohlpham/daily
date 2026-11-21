import Anthropic from '@anthropic-ai/sdk'
import { buildContext } from './context'

export interface ChatMsg { role: 'user' | 'assistant'; text: string }

const SYSTEM = `You are LifeHub's built-in assistant for the user, who lives in Australia (Melbourne time zone), works, trains with a Garmin, and does positive-EV (matched/value) sports betting in Australia. You can see a snapshot of their data below. Answer using that data: be specific with numbers and dates, and say when the data doesn't cover something. Keep replies short and practical, phone-sized, using short paragraphs or brief lists. You can't change data in the app; when asked to, tell them exactly what to tap. Encourage sound bankroll management and responsible gambling where relevant, without lecturing.`

export async function sendChat(apiKey: string, history: ChatMsg[], onText: (t: string) => void): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const context = await buildContext()
  const stream = client.beta.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: [{ type: 'text', text: SYSTEM }, { type: 'text', text: '# User data\n' + context }],
    messages: history.slice(-20).map((m) => ({ role: m.role, content: m.text })),
  })
  let text = ''
  stream.on('text', (d) => { text += d; onText(text) })
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') return text || "Sorry, I can't help with that one."
  return text
}
