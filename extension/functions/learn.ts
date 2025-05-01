// learn.ts (updated)

import { Stepper } from "./Stepper"
import { pageObserver } from "./observer"

interface LearnEvent {
  timestamp: string
  eventType: "userAction" | "domChange" | "voice"
  description: string
  value?: string
}

interface LearnProcedure {
  procedureName: string
  createdAt: string
  url: string
  pageTitle: string
  events: LearnEvent[]
  _meta?: {
    actionCount: number
    domChangeCount: number
    totalEvents: number
    url: string
    pageTitle: string
  }
}

let learnSession: {
  active: boolean
  name: string
  events: LearnEvent[]
  createdAt: string
} | null = null

export function isLearning() {
  return learnSession?.active ?? false
}

export function startLearnSession(name: string) {
  pageObserver.clear()
  pageObserver.start()
  Stepper("record start")

  learnSession = {
    active: true,
    name,
    createdAt: new Date().toISOString(),
    events: []
  }

  console.log(`Learning started: ${name}`)
}

export async function stopLearnSession(): Promise<LearnProcedure | null> {
  if (!learnSession?.active) return null

  const userActions = await Stepper("record stop")
  const domChanges = pageObserver.request()

  const allEvents: LearnEvent[] = []

  if (Array.isArray(userActions)) {
    allEvents.push(
      ...userActions.map(action => ({
        timestamp: new Date().toISOString(),
        eventType: "userAction" as const,
        description: `User performed: ${JSON.stringify(action)}`,
        value: JSON.stringify(action)
      }))
    )
  }

  allEvents.push({
    timestamp: new Date().toISOString(),
    eventType: "domChange",
    description: "DOM mutations recorded after interaction",
    value: JSON.stringify(domChanges)
  })

  const result: LearnProcedure = {
    procedureName: learnSession.name,
    createdAt: learnSession.createdAt,
    url: window.location.href,
    pageTitle: document.title,
    events: allEvents
  }

  // Store the task name before clearing the session
  const taskName = learnSession.name;
  
  // Clear the learn session
  learnSession = null

  // Copy the learned procedure to clipboard
  await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
  console.log(`Learned task "${taskName}" copied to clipboard.`)
  console.log(`Captured ${allEvents.length} events on page "${document.title}".`)

  // Return the completed result along with stats for UI feedback
  return {
    ...result,
    // Add metadata for display in the UI
    _meta: {
      actionCount: allEvents.filter(e => e.eventType === "userAction").length,
      domChangeCount: allEvents.filter(e => e.eventType === "domChange").length,
      totalEvents: allEvents.length,
      url: window.location.href,
      pageTitle: document.title
    }
  }
}

export async function toggleLearnMode(namePrompt: () => Promise<string>) {
  if (isLearning()) {
    const result = await stopLearnSession()
    return {
      action: 'stop',
      success: true,
      result,
      message: result ? `"${result.procedureName}" learned successfully` : 'No learning session was active'
    }
  } else {
    const name = await namePrompt()
    if (name) {
      startLearnSession(name)
      return {
        action: 'start',
        success: true,
        name,
        message: `Started learning "${name}"`
      }
    }
    return {
      action: 'cancelled',
      success: false,
      message: 'Learning mode cancelled'
    }
  }
}
