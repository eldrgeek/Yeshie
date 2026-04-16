/**
 * Yeshie E2E test helpers — inject/await wrapper for the relay API.
 *
 * Usage:
 *   import { inject, awaitResponse, awaitCompletion, getTabId } from '../helpers/yeshie'
 *
 * Requires the relay to be running on localhost:3333 and the extension connected.
 */

const RELAY = 'http://localhost:3333'

export interface RelayResponse {
  type: 'response' | 'timeout'
  text?: string
  success?: boolean
  escalate?: boolean
  failureContext?: Record<string, unknown>
  ts?: number
  heartbeat?: { status: string; step: string; ts: number } | null
}

/** Send a message to Haiku via the side panel. Appends (C) if not already present. */
export async function inject(tabId: number, message: string): Promise<void> {
  const msg = message.trimEnd().endsWith('(C)') ? message : `${message} (C)`
  const res = await fetch(`${RELAY}/chat/inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tabId, message: msg }),
  })
  if (!res.ok) throw new Error(`inject failed: ${res.status} ${await res.text()}`)
}

/**
 * Wait for the next Haiku response. Returns immediately if one is already buffered
 * since `since` (defaults to 0 = any response).
 */
export async function awaitResponse(
  tabId: number,
  timeoutSeconds = 30,
  since = 0,
): Promise<RelayResponse> {
  const url = `${RELAY}/chat/await?tabId=${tabId}&timeout=${timeoutSeconds}&since=${since}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`awaitResponse failed: ${res.status}`)
  return res.json() as Promise<RelayResponse>
}

/**
 * Poll until Haiku sends a non-heartbeat response or overall deadline is exceeded.
 * Heartbeats (type: 'timeout' with a recent heartbeat) extend the wait automatically.
 * Throws if the deadline is exceeded with no real response.
 */
export async function awaitCompletion(
  tabId: number,
  totalTimeoutSeconds = 120,
): Promise<RelayResponse> {
  const deadline = Date.now() + totalTimeoutSeconds * 1000
  let since = 0

  while (Date.now() < deadline) {
    const remaining = Math.ceil((deadline - Date.now()) / 1000)
    const pollTimeout = Math.min(30, remaining)
    const result = await awaitResponse(tabId, pollTimeout, since)

    if (result.type === 'response') return result

    // type === 'timeout' — check heartbeat
    const hb = result.heartbeat
    if (hb && Date.now() - hb.ts * 1000 < 30_000) {
      // Haiku is alive and working — keep waiting
      since = hb.ts
      continue
    }

    // Stale or missing heartbeat — Haiku may be stuck
    throw new Error(
      `awaitCompletion: no response within ${totalTimeoutSeconds}s and heartbeat is stale/missing`,
    )
  }

  throw new Error(`awaitCompletion: deadline exceeded (${totalTimeoutSeconds}s)`)
}

/**
 * Get the tabId for the active YeshID tab from the relay status endpoint.
 * Throws if no YeshID tab is found.
 */
export async function getTabId(urlPattern = 'app.yeshid.com'): Promise<number> {
  const res = await fetch(`${RELAY}/status`)
  if (!res.ok) throw new Error(`relay /status failed: ${res.status}`)
  const data = await res.json() as { tabs?: Array<{ tabId: number; url: string }> }
  const tab = (data.tabs ?? []).find(t => t.url.includes(urlPattern))
  if (!tab) throw new Error(`No tab matching "${urlPattern}" found — is YeshID open?`)
  return tab.tabId
}

/**
 * Convenience: inject and wait for acknowledgement in one call.
 * Returns the ack response (step 1+2 of the E2E pattern).
 */
export async function injectAndAck(
  tabId: number,
  message: string,
  ackTimeoutSeconds = 30,
): Promise<RelayResponse> {
  await inject(tabId, message)
  return awaitResponse(tabId, ackTimeoutSeconds)
}
