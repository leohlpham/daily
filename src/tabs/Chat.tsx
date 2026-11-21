import { useEffect, useRef, useState } from 'react'
import { usePersisted } from '../lib/store'
import { sendChat, type ChatMsg } from '../lib/chat'

const PROMPTS = ['Weekly Review', 'Where Is My Money Going?', 'How Is My Betting Tracking?', 'Am I Recovered Enough To Train Hard?', 'Plan My Week']
const EXPAND: Record<string, string> = {
  'Weekly Review': 'Give me a weekly review across spending, betting, training, sleep and recovery. Highlight wins, concerns and 3 things to focus on next week.',
  'Where Is My Money Going?': 'Break down where my money went this month vs last month, flag anything unusual and suggest where I could cut back.',
  'How Is My Betting Tracking?': 'How is my +EV betting tracking? Compare profit to expected value, CLV, which bookies are performing, and any accounts I should be careful with.',
  'Am I Recovered Enough To Train Hard?': 'Based on my sleep, HRV, Body Battery, readiness and recent training load, should I train hard today? What session would you suggest?',
  'Plan My Week': 'Look at my calendar for the next 7 days, my training plan and my routine, and suggest how to structure the week.',
}

/** Minimal markdown: **bold**, bullet lines, paragraphs. */
function Md({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((para, i) => {
    const lines = para.split('\n')
    const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s/.test(l))
    const fmt = (s: string) => s.split(/(\*\*[^*]+\*\*)/).map((p, j) => p.startsWith('**') ? <b key={j}>{p.slice(2, -2)}</b> : <span key={j}>{p.replace(/^#+\s*/, '')}</span>)
    return isList ? <ul key={i}>{lines.map((l, j) => <li key={j}>{fmt(l.replace(/^\s*([-*•]|\d+\.)\s/, ''))}</li>)}</ul> : <p key={i}>{lines.map((l, j) => <span key={j}>{fmt(l)}{j < lines.length - 1 && <br />}</span>)}</p>
  })}</>
}

export default function Chat({ onClose }: { onClose: () => void }) {
  const [apiKey] = usePersisted<string>('anthropicKey', '')
  const [msgs, setMsgs] = usePersisted<ChatMsg[]>('chat', [])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs, streaming])

  async function send(raw: string) {
    const q = (EXPAND[raw] ?? raw).trim()
    if (!q || streaming !== null) return
    if (!apiKey) { setErr('Add your Claude API key in Settings first.'); return }
    const next = [...msgs, { role: 'user' as const, text: q }]
    setMsgs(next); setInput(''); setErr(''); setStreaming('')
    try {
      const answer = await sendChat(apiKey, next, setStreaming)
      setMsgs([...next, { role: 'assistant' as const, text: answer }].slice(-60))
    } catch (e) { setErr((e as Error).message); setMsgs(next) }
    setStreaming(null)
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <b>Ask LifeHub</b>
        <div className="row gap">{msgs.length > 0 && <button className="link tiny" onClick={() => setMsgs([])}>Clear</button>}<button className="btn xs" onClick={onClose}>Done</button></div>
      </div>
      <div className="chat-body">
        {!msgs.length && streaming === null && (
          <div className="chat-empty">
            <div className="orb" />
            <p className="muted small center">Ask anything about your money, bets, training, sleep or schedule.</p>
          </div>
        )}
        {msgs.map((m, i) => <div key={i} className={'bubble ' + m.role}>{m.role === 'assistant' ? <Md text={m.text} /> : m.text}</div>)}
        {streaming !== null && <div className="bubble assistant">{streaming ? <Md text={streaming} /> : <span className="typing"><i /><i /><i /></span>}</div>}
        {err && <div className="notice small">{err}</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-prompts">{PROMPTS.map((p) => <button key={p} className="chip big" onClick={() => send(p)} disabled={streaming !== null}>{p}</button>)}</div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <input value={input} placeholder="Message" onChange={(e) => setInput(e.target.value)} />
        <button className="btn primary" disabled={!input.trim() || streaming !== null}>↑</button>
      </form>
    </div>
  )
}
