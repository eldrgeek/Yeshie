import { storageGet, storageSet } from "./storage"
import { logInfo, logError } from "./logger"
import type { Step } from "../components/AnnotationDialog"

export interface LearnedStep {
  description: string
  steps: Step[]
  createdAt: string
}

export interface LearnedStepsCollection {
  [stepName: string]: LearnedStep
}

/**
 * Get all learned steps for a specific hostname
 */
export async function getLearnedStepsForHost(hostname: string): Promise<LearnedStepsCollection> {
  try {
    const learnedStepsKey = `learnedSteps_${hostname}`
    const steps = await storageGet(learnedStepsKey)
    
    if (steps && typeof steps === 'object') {
      return steps as LearnedStepsCollection
    }
    
    return {}
  } catch (error) {
    logError("learnedSteps", "Error getting learned steps for host", { error, hostname })
    return {}
  }
}

/**
 * Get all learned steps for the current page
 */
export async function getLearnedStepsForCurrentHost(): Promise<LearnedStepsCollection> {
  return getLearnedStepsForHost(window.location.hostname)
}

/**
 * Get a specific learned step by name for a hostname
 */
export async function getLearnedStep(hostname: string, stepName: string): Promise<LearnedStep | null> {
  try {
    const allSteps = await getLearnedStepsForHost(hostname)
    return allSteps[stepName] || null
  } catch (error) {
    logError("learnedSteps", "Error getting specific learned step", { error, hostname, stepName })
    return null
  }
}

/**
 * Save a learned step for a specific hostname
 */
export async function saveLearnedStep(
  hostname: string, 
  stepName: string, 
  description: string, 
  steps: Step[]
): Promise<boolean> {
  try {
    logInfo("learnedSteps", `Saving learned step: ${stepName} for ${hostname}`)

    // Get existing learned steps for this host
    const existingSteps = await getLearnedStepsForHost(hostname)

    // Add the new step
    const updatedSteps: LearnedStepsCollection = {
      ...existingSteps,
      [stepName]: {
        description,
        steps,
        createdAt: new Date().toISOString()
      }
    }

    // Save back to storage
    const learnedStepsKey = `learnedSteps_${hostname}`
    await storageSet(learnedStepsKey, updatedSteps)

    logInfo("learnedSteps", `Successfully saved learned step: ${stepName}`, { 
      hostname, 
      stepsCount: steps.length,
      description 
    })

    return true
  } catch (error) {
    logError("learnedSteps", "Error saving learned step", { error, stepName, hostname })
    return false
  }
}

/**
 * Delete a learned step for a specific hostname
 */
export async function deleteLearnedStep(hostname: string, stepName: string): Promise<boolean> {
  try {
    const existingSteps = await getLearnedStepsForHost(hostname)
    
    if (!(stepName in existingSteps)) {
      logInfo("learnedSteps", `Step ${stepName} not found for deletion`, { hostname })
      return false
    }

    // Remove the step
    const { [stepName]: deletedStep, ...remainingSteps } = existingSteps
    
    // Save back to storage
    const learnedStepsKey = `learnedSteps_${hostname}`
    await storageSet(learnedStepsKey, remainingSteps)

    logInfo("learnedSteps", `Successfully deleted learned step: ${stepName}`, { hostname })
    return true
  } catch (error) {
    logError("learnedSteps", "Error deleting learned step", { error, stepName, hostname })
    return false
  }
}

/**
 * Get all hostnames that have learned steps
 */
export async function getAllHostsWithLearnedSteps(): Promise<string[]> {
  try {
    // This would require listing all storage keys, which might not be directly available
    // For now, we'll return an empty array and let callers track this separately
    logInfo("learnedSteps", "getAllHostsWithLearnedSteps called - returning empty array for now")
    return []
  } catch (error) {
    logError("learnedSteps", "Error getting all hosts with learned steps", { error })
    return []
  }
} 