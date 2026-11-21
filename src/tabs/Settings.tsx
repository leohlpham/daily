import { useEffect, useRef, useState } from 'react'
import { usePersisted, exportAll, importAll, download } from '../lib/store'
import { outlookAccount, outlookSignIn, outlookSignOut } from '../lib/outlook'

export default function Settings() {
  const [clientId, setClientId] = usePersisted<string>('msClientId', '')
  const [apiKey, setApiKey] = usePersisted<string>('anthropicKey', '')
  const [acct, setAcct] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const redirect = location.origin + location.pathname
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone

  useEffect(() => { outlookAccount(clientId).then((a) => setAcct(a?.username ?? null)).catch(() => setAcct(null)) }, [clientId])

  return (
    <div className="page">
      <h1>Settings</h1>
      {msg && <div className="notice" onClick={() => setMsg('')}>{msg}</div>}

      {!standalone && (
        <div className="card">
          <h3>Install on your iPhone</h3>
          <ol className="muted small"><li>Open this page in <b>Safari</b></li><li>Tap the Share button</li><li>Tap <b>Add to Home Screen</b></li></ol>
          <p className="muted small">It then opens full-screen like a normal app and works offline.</p>
        </div>
      )}

      <div className="card">
        <h3>Outlook calendar</h3>
        {acct ? (
          <><p>Connected as <b>{acct}</b></p><button className="btn" onClick={async () => { await outlookSignOut(clientId); setAcct(null) }}>Disconnect</button></>
        ) : (
          <>
            <label className="field"><span>Microsoft app (client) ID</span><input value={clientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" onChange={(e) => setClientId(e.target.value.trim())} /></label>
            <button className="btn primary" disabled={!/^[0-9a-f-]{36}$/i.test(clientId)} onClick={() => outlookSignIn(clientId)}>Sign in with Microsoft</button>
            <details className="muted small help">
              <summary>One-time setup (about 3 minutes, free)</summary>
              <ol>
                <li>Go to <b>portal.azure.com</b> and sign in with your Microsoft account.</li>
                <li>Search <b>App registrations</b> → <b>New registration</b>.</li>
                <li>Name: LifeHub. Supported accounts: <b>Accounts in any organizational directory and personal Microsoft accounts</b>.</li>
                <li>Redirect URI: platform <b>Single-page application (SPA)</b>, URL: <code>{redirect}</code></li>
                <li>Register, then copy the <b>Application (client) ID</b> and paste it above.</li>
              </ol>
              <p>If your Outlook is a work account, your employer's IT may need to approve it.</p>
            </details>
          </>
        )}
      </div>

      <div className="card">
        <h3>Claude AI planner</h3>
        <label className="field"><span>Anthropic API key</span><input type="password" value={apiKey} placeholder="sk-ant-…" onChange={(e) => setApiKey(e.target.value.trim())} /></label>
        <p className="muted small">Get one at <b>console.anthropic.com</b> → API Keys, and add a few dollars of credit. Each day plan costs a few cents. The key is stored only on this phone and is sent only to Anthropic.</p>
      </div>

      <div className="card">
        <h3>Backup</h3>
        <p className="muted small">All your data lives on this device. Export a backup now and then (save it to iCloud Drive), especially before deleting the app.</p>
        <div className="row gap">
          <button className="btn" onClick={async () => download(`lifehub-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportAll())}>Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Restore</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (!f || !confirm('Replace current data with this backup?')) return
            try { await importAll(await f.text()); location.reload() } catch (err) { setMsg((err as Error).message) }
          }} />
        </div>
      </div>
      <p className="muted tiny center">LifeHub · data stored locally on this device</p>
    </div>
  )
}
