import { storageGet, storageSet } from "./storage"
import { logInfo, logError } from "./logger"

// Global settings keys
export const STORAGE_KEYS = {
  SLIDER_MODE: 'yeshie_slider_mode',
  SLIDER_VISIBILITY: 'yeshie_slider_visibility', 
  SPEECH_CONTENT: 'yeshie_speech_content'
} as const

// Types
export type SliderMode = 'overlay' | 'push-content'

export interface GlobalSettings {
  sliderMode: SliderMode
  sliderVisibility: boolean
  speechContent: string
}

// Default values
const DEFAULT_SETTINGS: GlobalSettings = {
  sliderMode: 'overlay',
  sliderVisibility: false,
  speechContent: ''
}

// Slider mode functions
export async function getSliderMode(): Promise<SliderMode> {
  try {
    const mode = await storageGet<SliderMode>(STORAGE_KEYS.SLIDER_MODE)
    return mode ?? DEFAULT_SETTINGS.sliderMode
  } catch (error) {
    logError('GlobalSettings', 'Failed to get slider mode', { error })
    return DEFAULT_SETTINGS.sliderMode
  }
}

export async function setSliderMode(mode: SliderMode): Promise<void> {
  try {
    await storageSet(STORAGE_KEYS.SLIDER_MODE, mode)
    logInfo('GlobalSettings', 'Slider mode updated', { mode })
  } catch (error) {
    logError('GlobalSettings', 'Failed to set slider mode', { error, mode })
    throw error
  }
}

// Slider visibility functions
export async function getSliderVisibility(): Promise<boolean> {
  try {
    const visibility = await storageGet<boolean>(STORAGE_KEYS.SLIDER_VISIBILITY)
    return visibility ?? DEFAULT_SETTINGS.sliderVisibility
  } catch (error) {
    logError('GlobalSettings', 'Failed to get slider visibility', { error })
    return DEFAULT_SETTINGS.sliderVisibility
  }
}

export async function setSliderVisibility(visible: boolean): Promise<void> {
  try {
    await storageSet(STORAGE_KEYS.SLIDER_VISIBILITY, visible)
    logInfo('GlobalSettings', 'Slider visibility updated', { visible })
  } catch (error) {
    logError('GlobalSettings', 'Failed to set slider visibility', { error, visible })
    throw error
  }
}

// Speech content functions
export async function getSpeechContent(): Promise<string> {
  try {
    const content = await storageGet<string>(STORAGE_KEYS.SPEECH_CONTENT)
    return content ?? DEFAULT_SETTINGS.speechContent
  } catch (error) {
    logError('GlobalSettings', 'Failed to get speech content', { error })
    return DEFAULT_SETTINGS.speechContent
  }
}

export async function setSpeechContent(content: string): Promise<void> {
  try {
    await storageSet(STORAGE_KEYS.SPEECH_CONTENT, content)
    logInfo('GlobalSettings', 'Speech content updated', { contentLength: content.length })
  } catch (error) {
    logError('GlobalSettings', 'Failed to set speech content', { error, contentLength: content.length })
    throw error
  }
}

// Bulk operations
export async function getAllGlobalSettings(): Promise<GlobalSettings> {
  try {
    const [sliderMode, sliderVisibility, speechContent] = await Promise.all([
      getSliderMode(),
      getSliderVisibility(), 
      getSpeechContent()
    ])
    
    return {
      sliderMode,
      sliderVisibility,
      speechContent
    }
  } catch (error) {
    logError('GlobalSettings', 'Failed to get all global settings', { error })
    return DEFAULT_SETTINGS
  }
}

export async function setAllGlobalSettings(settings: Partial<GlobalSettings>): Promise<void> {
  try {
    const promises: Promise<void>[] = []
    
    if (settings.sliderMode !== undefined) {
      promises.push(setSliderMode(settings.sliderMode))
    }
    
    if (settings.sliderVisibility !== undefined) {
      promises.push(setSliderVisibility(settings.sliderVisibility))
    }
    
    if (settings.speechContent !== undefined) {
      promises.push(setSpeechContent(settings.speechContent))
    }
    
    await Promise.all(promises)
    logInfo('GlobalSettings', 'All global settings updated', { settings })
  } catch (error) {
    logError('GlobalSettings', 'Failed to set all global settings', { error, settings })
    throw error
  }
} 