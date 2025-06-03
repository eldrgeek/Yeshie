import React, { useState, useEffect } from 'react';
import { SpeechInput } from './SpeechEditor';
import { logInfo, logError } from '../functions/logger';

interface DailyRitualDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RitualAnswers {
  dayIntent: string;
  mainTask: string;
  workspace: string;
  cleanTabs: string;
}

const questions = [
  { key: 'dayIntent', prompt: 'What kind of day do you want today?' },
  { key: 'mainTask', prompt: 'What one task do you want to complete?' },
  { key: 'workspace', prompt: 'Which workspace? Cursor, blog, or other?' },
  { key: 'cleanTabs', prompt: 'Should I close all unrelated tabs?' }
] as const;

type QuestionKey = typeof questions[number]['key'];

const DailyRitualDialog: React.FC<DailyRitualDialogProps> = ({ isOpen, onClose }) => {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<RitualAnswers>>({});
  const [currentText, setCurrentText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuestionIndex(0);
      setAnswers({});
      setCurrentText('');
    }
  }, [isOpen]);

  const handleSubmit = async (text: string) => {
    const key = questions[questionIndex].key as QuestionKey;
    const updated = { ...answers, [key]: text };
    setAnswers(updated);
    setCurrentText('');

    if (questionIndex < questions.length - 1) {
      setQuestionIndex(q => q + 1);
    } else {
      try {
        await chrome.runtime.sendMessage({
          type: 'DAILY_RITUAL_COMPLETE',
          payload: updated
        });
        logInfo('DailyRitual', 'Ritual complete', { answers: updated });
      } catch (error) {
        logError('DailyRitual', 'Failed to send ritual results', { error });
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  const question = questions[questionIndex];

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h3>{question.prompt}</h3>
        <SpeechInput onSubmit={handleSubmit} onChange={setCurrentText} />
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default DailyRitualDialog;
