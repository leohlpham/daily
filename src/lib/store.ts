import { get, set } from 'idb-keyval'
import { useEffect, useRef, useState } from 'react'

/** State persisted to IndexedDB on this device. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    get(key).then((v) => {
      if (v !== undefined) setValue(v as T)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [key])

  useEffect(() => {
    if (!loaded) return
    if (first.current) { first.current = false; return }
    set(key, value).catch(() => {})
  }, [key, value, loaded])

  return [value, setValue, loaded]
}

export const STORE_KEYS = ['transactions', 'categoryRules', 'budgets', 'bets', 'bookmakers', 'events', 'planGoals', 'planSettings', 'msClientId', 'activities', 'dailyLogs'] as const

export async function exportAll(): Promise<string> {
  const out: Record<string, unknown> = {}
  for (const k of STORE_KEYS) out[k] = await get(k)
  return JSON.stringify({ app: 'lifehub', version: 1, exportedAt: new Date().toISOString(), data: out }, null, 2)
}

export async function importAll(json: string) {
  const parsed = JSON.parse(json)
  if (parsed?.app !== 'lifehub') throw new Error('Not a LifeHub backup file')
  for (const k of STORE_KEYS) if (parsed.data[k] !== undefined) await set(k, parsed.data[k])
}

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export const money = (n: number) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function download(filename: string, text: string, type = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
