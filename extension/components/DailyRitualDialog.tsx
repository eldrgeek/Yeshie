import React, { useState, useEffect } from 'react'
import { SpeechInput } from './SpeechEditor'
import { logInfo, logError } from '../functions/logger'

interface DailyRitualDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface RitualAnswers {
  mood: string
  task: string
  workspace: string
  cleanTabs: boolean
}

const questions = [
  'What kind of day do you want today?',
  'What one task do you want to complete?',
  'Which workspace? Cursor, blog, or other?',
  'Should I close all unrelated tabs?'
]

const DailyRitualDialog: React.FC<DailyRitualDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Partial<RitualAnswers>>({})

  useEffect(() => {
    if (!isOpen) {
      setStep(0)
      setAnswers({})
    }
  }, [isOpen])

  const handleSubmit = async (text: string) => {
    const updated = { ...answers }
    if (step === 0) updated.mood = text
    if (step === 1) updated.task = text
    if (step === 2) updated.workspace = text
    if (step === 3) updated.cleanTabs = /yes|y/i.test(text)
    setAnswers(updated)

    if (step < questions.length - 1) {
      setStep(step + 1)
    } else {
      try {
        await chrome.runtime.sendMessage({
          type: 'DAILY_RITUAL_COMPLETE',
          answers: updated
        })
        logInfo('DailyRitualDialog', 'Sent ritual completion', { answers: updated })
      } catch (error) {
        logError('DailyRitualDialog', 'Error sending completion', { error })
      }
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="daily-ritual-overlay">
      <div className="daily-ritual-dialog">
        <h3>Daily Ritual</h3>
        <p>{questions[step]}</p>
        <SpeechInput onSubmit={handleSubmit} />
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export default DailyRitualDialog
