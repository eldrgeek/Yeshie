import React, { useState, useEffect } from 'react';
import { SpeechInput } from './SpeechEditor';
import { Storage } from "@plasmohq/storage";
import { getBuildInfo } from '../background/buildCounter';

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (report: { type: "bug" | "feature"; title: string; description: string; }) => void;
}

const ReportDialog = ({ isOpen, onClose, onSubmit }: ReportDialogProps) => {
  const [currentText, setCurrentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // Load report count when dialog opens
      const loadReportCount = async () => {
        try {
          const storage = new Storage();
          const reports = await storage.get('reports') || [];
          setReportCount(reports.length);
        } catch (err) {
          console.error('Failed to load report count:', err);
        }
      };
      loadReportCount();
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!currentText.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Parse report type from first word
      const firstWord = currentText.trim().split(' ')[0].toLowerCase();
      const type = firstWord === 'bug' || firstWord === 'feature' ? firstWord : 'bug';
      
      // Split into title and description
      const [title, ...descParts] = currentText.trim().split('\n');
      const description = descParts.join('\n').trim();

      // Send to background script
      await chrome.runtime.sendMessage({
        type: 'ADD_REPORT',
        report: {
          type,
          title,
          description,
          timestamp: Date.now(),
          status: 'pending',
          buildInfo: getBuildInfo()
        }
      });

      // Call onSubmit if provided
      if (onSubmit) {
        onSubmit({ type, title, description });
      }

      onClose();
    } catch (err) {
      console.error('Failed to submit report:', err);
      setError('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextChange = (text: string) => {
    console.log('Report text changed:', text);
    setCurrentText(text);
  };

  if (!isOpen) return null;

  return (
    <div className="report-dialog-overlay">
      <div className="report-dialog">
        <div className="report-dialog-header">
          <h2>Report #{reportCount + 1}</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        <div className="report-dialog-content">
          <SpeechInput
            onChange={handleTextChange}
            onSubmit={handleSubmit}
            onShowHelp={() => {
              alert(`Start your report with "bug" or "feature" followed by your description.
Example: "bug the app crashes when I click the button"
Example: "feature add a dark mode option"`);
            }}
          />
          {error && <div className="error-message">{error}</div>}
          <div className="report-dialog-footer">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !currentText.trim()}
              className="submit-button"
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
            <button onClick={onClose} className="cancel-button">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportDialog; 