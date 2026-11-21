import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

const Extracted = z.object({
  bets: z.array(z.object({
    bookmaker: z.string().describe('Bookmaker brand shown in the screenshot, e.g. bet365, Sportsbet, TAB'),
    date: z.string().describe('Bet placement date as YYYY-MM-DD, or empty string if not visible'),
    event: z.string(),
    selection: z.string().describe('What was backed, including line/handicap and market. For multis, list the legs joined by " / "'),
    stake: z.number(),
    odds: z.number().describe('Decimal odds'),
    type: z.enum(['cash', 'bonus']).describe('bonus if paid with a bonus bet / bet credit / free bet (stake not returned)'),
    result: z.enum(['pending', 'won', 'lost', 'void', 'cashout']),
    returned: z.number().describe('Total amount returned/paid out if settled, else 0'),
  })),
})
export type ExtractedBet = z.infer<typeof Extracted>['bets'][number]

/** Shrink a photo to keep tokens (and cost) down. */
export async function toJpegBase64(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85).split(',')[1]
}

export async function extractBets(apiKey: string, files: File[], bookies: string[], today: string): Promise<ExtractedBet[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const images = await Promise.all(files.map(toJpegBase64))
  const res = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    output_config: { effort: 'low', format: zodOutputFormat(Extracted) },
    messages: [{
      role: 'user',
      content: [
        ...images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
        { type: 'text', text: `These are screenshots from Australian bookmaker apps (bet slips, receipts or "My Bets" pages). Extract every individual bet visible. Today is ${today}; resolve relative dates like "Today" or "Yesterday" against it. My bookmaker accounts are: ${bookies.join(', ')}. Use one of those names for "bookmaker" when it matches the brand. If a bet appears in more than one screenshot, include it once. Skip anything that isn't a placed bet.` },
      ],
    }],
  })
  if (res.stop_reason === 'refusal') throw new Error('Claude could not read these screenshots.')
  return res.parsed_output?.bets ?? []
}
