import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import type { CalEvent } from './types'

const SCOPES = ['Calendars.Read', 'User.Read']
let pca: PublicClientApplication | null = null
let pcaClient = ''

async function getPca(clientId: string) {
  if (pca && pcaClient === clientId) return pca
  pca = new PublicClientApplication({
    auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: location.origin + location.pathname },
    cache: { cacheLocation: 'localStorage' },
  })
  await pca.initialize()
  await pca.handleRedirectPromise().catch(() => null)
  pcaClient = clientId
  return pca
}

export async function outlookAccount(clientId: string): Promise<AccountInfo | null> {
  if (!clientId) return null
  const p = await getPca(clientId)
  return p.getAllAccounts()[0] ?? null
}

/** iOS home-screen apps block popups, so use a full-page redirect for sign-in. */
export async function outlookSignIn(clientId: string) {
  const p = await getPca(clientId)
  await p.loginRedirect({ scopes: SCOPES, prompt: 'select_account' })
}

export async function outlookSignOut(clientId: string) {
  const p = await getPca(clientId)
  const acct = p.getAllAccounts()[0]
  if (acct) await p.clearCache({ account: acct })
}

async function token(clientId: string) {
  const p = await getPca(clientId)
  const account = p.getAllAccounts()[0]
  if (!account) throw new Error('Not signed in to Outlook')
  try {
    return (await p.acquireTokenSilent({ scopes: SCOPES, account })).accessToken
  } catch {
    await p.acquireTokenRedirect({ scopes: SCOPES, account })
    throw new Error('Redirecting to Microsoft sign-in…')
  }
}

/** Fetch events between two dates (inclusive start, exclusive end) in Melbourne time. */
export async function fetchOutlookEvents(clientId: string, from: Date, to: Date): Promise<CalEvent[]> {
  const t = await token(clientId)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne'
  let url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$top=200&$orderby=start/dateTime&$select=id,subject,start,end,location,isAllDay,showAs,isCancelled`
  const out: CalEvent[] = []
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${t}`, Prefer: `outlook.timezone="${tz}"` } })
    if (!res.ok) throw new Error(`Outlook returned ${res.status}`)
    const j = await res.json()
    for (const e of j.value) {
      if (e.isCancelled || e.showAs === 'free') continue
      out.push({ id: 'o_' + e.id, title: e.subject || '(busy)', start: e.start.dateTime.slice(0, 19), end: e.end.dateTime.slice(0, 19), source: 'outlook', location: e.location?.displayName || undefined, allDay: e.isAllDay })
    }
    url = j['@odata.nextLink'] || ''
  }
  return out
}
