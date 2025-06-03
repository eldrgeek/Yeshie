import { storageGetAll } from "./storage"
import { logInfo } from "./logger"
import type { LearnedStepsCollection } from "./learnedSteps"

/**
 * Inspect all learned steps stored in local storage
 * Useful for debugging and showing users what they have saved
 */
export async function inspectLearnedSteps(): Promise<{
  hosts: string[]
  totalSteps: number
  allSteps: Record<string, LearnedStepsCollection>
}> {
  try {
    const allStorage = await storageGetAll()
    const allSteps: Record<string, LearnedStepsCollection> = {}
    const hosts: string[] = []
    let totalSteps = 0

    // Find all learned steps keys
    for (const key in allStorage) {
      if (key.startsWith('learnedSteps_')) {
        const hostname = key.replace('learnedSteps_', '')
        const steps = allStorage[key] as LearnedStepsCollection
        
        hosts.push(hostname)
        allSteps[hostname] = steps
        totalSteps += Object.keys(steps).length
      }
    }

    logInfo("StorageInspector", "Learned steps inspection complete", {
      hostsCount: hosts.length,
      totalSteps,
      hosts
    })

    return { hosts, totalSteps, allSteps }
  } catch (error) {
    logInfo("StorageInspector", "Error inspecting learned steps", { error })
    return { hosts: [], totalSteps: 0, allSteps: {} }
  }
}

/**
 * Copy learned steps data to clipboard for sharing/debugging
 */
export async function copyLearnedStepsToClipboard(): Promise<boolean> {
  try {
    const inspection = await inspectLearnedSteps()
    
    const report = {
      summary: {
        totalHosts: inspection.hosts.length,
        totalSteps: inspection.totalSteps,
        hosts: inspection.hosts
      },
      data: inspection.allSteps,
      timestamp: new Date().toISOString()
    }

    const formattedReport = JSON.stringify(report, null, 2)
    await navigator.clipboard.writeText(formattedReport)
    
    logInfo("StorageInspector", "Learned steps copied to clipboard", {
      totalHosts: inspection.hosts.length,
      totalSteps: inspection.totalSteps
    })

    return true
  } catch (error) {
    logInfo("StorageInspector", "Error copying learned steps to clipboard", { error })
    return false
  }
}

/**
 * Get a summary string of learned steps for display
 */
export async function getLearnedStepsSummary(): Promise<string> {
  try {
    const inspection = await inspectLearnedSteps()
    
    if (inspection.totalSteps === 0) {
      return "No learned steps saved yet."
    }

    let summary = `📚 Learned Steps Summary:\n\n`
    summary += `Total: ${inspection.totalSteps} step sequences across ${inspection.hosts.length} websites\n\n`

    for (const hostname of inspection.hosts) {
      const steps = inspection.allSteps[hostname]
      const stepNames = Object.keys(steps)
      
      summary += `🌐 ${hostname} (${stepNames.length} sequences):\n`
      for (const stepName of stepNames) {
        const step = steps[stepName]
        summary += `  • "${stepName}" - ${step.steps.length} actions\n`
        summary += `    ${step.description || 'No description'}\n`
      }
      summary += '\n'
    }

    summary += `\n💾 Storage location: Chrome extension local storage\n`
    summary += `Key pattern: learnedSteps_<hostname>\n`
    summary += `\nTo export: Use Yeshie debug tools or console: copyLearnedStepsToClipboard()`

    return summary
  } catch (error) {
    return "Error generating learned steps summary."
  }
}

// Export function for console access
if (typeof window !== 'undefined') {
  (window as any).inspectLearnedSteps = inspectLearnedSteps;
  (window as any).copyLearnedStepsToClipboard = copyLearnedStepsToClipboard;
  (window as any).getLearnedStepsSummary = getLearnedStepsSummary;
} 