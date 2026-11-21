import { useEffect, useRef, useState } from 'react'
import { usePersisted, exportAll, importAll, download } from '../lib/store'
import { outlookAccount, outlookSignIn, outlookSignOut } from '../lib/outlook'
import { googleConnected, googleDisconnect, googleSignIn } from '../lib/google'
import { stravaAuth, stravaDisconnect, stravaSignIn } from '../lib/strava'

export default function Settings() {
  const [clientId, setClientId] = usePersisted<string>('msClientId', '')
  const [apiKey, setApiKey] = usePersisted<string>('anthropicKey', '')
  const [googleId, setGoogleId] = usePersisted<string>('googleClientId', '')
  const [gConn, setGConn] = useState(googleConnected())
  const [stravaId, setStravaId] = usePersisted<string>('stravaClientId', '')
  const [stravaSecret, setStravaSecret] = usePersisted<string>('stravaSecret', '')
  const [sAuth, setSAuth] = useState(stravaAuth())
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
        <h3>Google Calendar</h3>
        {gConn ? (
          <><p>Connected. Tap ↻ Sync on the Schedule tab to refresh.</p><button className="btn" onClick={() => { googleDisconnect(); setGConn(false) }}>Disconnect</button></>
        ) : (
          <>
            <label className="field"><span>Google OAuth client ID</span><input value={googleId} placeholder="…apps.googleusercontent.com" onChange={(e) => setGoogleId(e.target.value.trim())} /></label>
            <button className="btn primary" disabled={!googleId.endsWith('.apps.googleusercontent.com')} onClick={() => googleSignIn(googleId)}>Sign in with Google</button>
            <details className="muted small help">
              <summary>One-time setup (about 5 minutes, free)</summary>
              <ol>
                <li>Go to <b>console.cloud.google.com</b> and create a project called LifeHub.</li>
                <li>APIs &amp; Services → Library → enable <b>Google Calendar API</b>.</li>
                <li>OAuth consent screen → External → fill in the app name and your email → add yourself under <b>Test users</b>.</li>
                <li>Credentials → Create credentials → <b>OAuth client ID</b> → Web application.</li>
                <li>Authorised JavaScript origin: <code>{location.origin}</code></li>
                <li>Authorised redirect URI: <code>{redirect}</code></li>
                <li>Create, then copy the <b>Client ID</b> and paste it above.</li>
              </ol>
              <p>Google asks you to sign in again about once an hour when you sync, which is a one-tap redirect.</p>
            </details>
          </>
        )}
      </div>

      <div className="card">
        <h3>Strava (workouts)</h3>
        {sAuth ? (
          <><p>Connected{sAuth.athlete ? <> as <b>{sAuth.athlete}</b></> : ''}. Workouts sync automatically each time you open the app.</p><button className="btn" onClick={() => { stravaDisconnect(); setSAuth(null) }}>Disconnect</button></>
        ) : (
          <>
            <div className="grid2">
              <label className="field"><span>Client ID</span><input inputMode="numeric" value={stravaId} onChange={(e) => setStravaId(e.target.value.trim())} /></label>
              <label className="field"><span>Client secret</span><input type="password" value={stravaSecret} onChange={(e) => setStravaSecret(e.target.value.trim())} /></label>
            </div>
            <button className="btn primary" disabled={!/^\d+$/.test(stravaId) || stravaSecret.length < 20} onClick={() => stravaSignIn(stravaId)}>Connect Strava</button>
            <details className="muted small help">
              <summary>One-time setup (about 2 minutes, free)</summary>
              <ol>
                <li>In Garmin Connect app → More → Settings → Connected Apps → <b>Strava</b>, turn it on so every workout uploads to Strava.</li>
                <li>On a browser, go to <b>strava.com/settings/api</b> and create an app (any name and website).</li>
                <li>Set <b>Authorization Callback Domain</b> to <code>{location.hostname}</code></li>
                <li>Copy the <b>Client ID</b> and <b>Client Secret</b> into the boxes above, then tap Connect Strava.</li>
              </ol>
              <p>The secret is stored only on this phone and is only sent to Strava.</p>
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
