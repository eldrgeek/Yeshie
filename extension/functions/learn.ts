
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
    taskIndex: number
  }
}

interface LearnSession {
  active: boolean
  name: string
  events: LearnEvent[]
  createdAt: string
  taskIndex: number
}

interface CompletedTask {
  procedureName: string
  createdAt: string
  url: string
  pageTitle: string
  events: LearnEvent[]
}

let learnSession: LearnSession | null = null
let completedTasks: CompletedTask[] = []
let currentTaskIndex = 0

const TASK_NAMES = [
  "Click in input box",
  "Change models"
]

export function isLearning() {
  return learnSession?.active ?? false
}

export function startLearnSession() {
  console.log('Starting learn session');
  pageObserver.clear()
  pageObserver.start()
  Stepper("record start")

  const taskName = TASK_NAMES[currentTaskIndex] || `Task ${currentTaskIndex + 1}`

  learnSession = {
    active: true,
    name: taskName,
    createdAt: new Date().toISOString(),
    events: [],
    taskIndex: currentTaskIndex
  }

  console.log(`Learning started: ${taskName}`)
  return taskName
}

export async function stopLearnSession(): Promise<LearnProcedure | null> {
  console.log('Stopping learn session');
  if (!learnSession?.active) {
    console.log('No active learn session found');
    return null;
  }

  const userActions = await Stepper("record stop")
  console.log('User actions captured:', userActions);
  const domChanges = pageObserver.request()
  console.log('DOM changes captured:', domChanges);

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

  console.log('All events captured:', allEvents);

  const result: CompletedTask = {
    procedureName: learnSession.name,
    createdAt: learnSession.createdAt,
    url: window.location.href,
    pageTitle: document.title,
    events: allEvents
  }

  // Store the completed task
  completedTasks.push(result)
  
  // Store the task name and index before clearing the session
  const taskName = learnSession.name;
  const taskIndex = learnSession.taskIndex;
  
  // Clear the learn session
  learnSession = null

  // If all tasks are completed, combine results and copy to clipboard
  if (completedTasks.length === TASK_NAMES.length) {
    const combinedResult = {
      tasks: completedTasks,
      _meta: {
        totalTasks: completedTasks.length,
        totalEvents: completedTasks.reduce((sum, task) => sum + task.events.length, 0),
        url: window.location.href,
        pageTitle: document.title
      }
    }
    await navigator.clipboard.writeText(JSON.stringify(combinedResult, null, 2))
    console.log(`All tasks completed. Combined results copied to clipboard.`)
    // Clear completed tasks for next round
    completedTasks = []
    currentTaskIndex = 0
  } else {
    // Copy just the current task result
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    console.log(`Learned task "${taskName}" copied to clipboard.`)
    // Increment task index for next task
    currentTaskIndex = (taskIndex + 1) % TASK_NAMES.length
  }

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
      pageTitle: document.title,
      taskIndex: currentTaskIndex
    }
  }
}

export async function toggleLearnMode() {
  if (isLearning()) {
    const result = await stopLearnSession()
    // Get the next task name for the toast message
    const nextTaskName = TASK_NAMES[currentTaskIndex]
    
    return {
      action: 'stop',
      success: true,
      result,
      message: result ? 
        `"${result.procedureName}" learned successfully. Next task: "${nextTaskName}"` : 
        'No learning session was active'
    }
  } else {
    const taskName = startLearnSession()
    return {
      action: 'start',
      success: true,
      name: taskName,
      message: `Started learning "${taskName}"`
    }
  }
}
