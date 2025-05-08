import React, { useState, useEffect, useCallback } from 'react';
import { storageGet, storageSet, storageGetAll } from '../functions/storage';
import { toast } from 'react-toastify';
import { logInfo, logError } from '../functions/logger';
import { handleError } from '../functions/errorHandler';

const TEST_VIEWER_MODE_KEY = 'yeshie_test_viewer_mode';
const ARCHIVED_TEST_PREFIX = 'archived_test_';

interface TestViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ArchivedTest {
  name: string; // User-friendly name
  storageKey: string; // Actual key in chrome.storage.local
  content?: any; // Loaded test content
}

type DisplayMode = 'json' | 'human';

const TestViewerDialog: React.FC<TestViewerDialogProps> = ({ isOpen, onClose }) => {
  const [archivedTests, setArchivedTests] = useState<ArchivedTest[]>([]);
  const [selectedTestKey, setSelectedTestKey] = useState<string | null>(null);
  const [selectedTestContent, setSelectedTestContent] = useState<any | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('json');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load display mode preference on mount
  useEffect(() => {
    storageGet<DisplayMode>(TEST_VIEWER_MODE_KEY).then(mode => {
      if (mode) {
        setDisplayMode(mode);
      }
    }).catch(err => logError("Error loading test viewer mode", err));
  }, []);

  // Fetch archived tests when dialog opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      storageGetAll().then(allStorage => {
        const tests: ArchivedTest[] = [];
        for (const key in allStorage) {
          if (key.startsWith(ARCHIVED_TEST_PREFIX)) {
            const name = key.substring(ARCHIVED_TEST_PREFIX.length).replace(/_/g, ' ');
            tests.push({ name, storageKey: key });
          }
        }
        setArchivedTests(tests);
        setIsLoading(false);
        if (tests.length > 0 && !selectedTestKey) {
          // Auto-select first test if none is selected
          // setSelectedTestKey(tests[0].storageKey);
        }
      }).catch(err => {
        logError("Error fetching archived tests", err);
        toast.error("Could not load archived tests.");
        setIsLoading(false);
      });
    }
  }, [isOpen]);

  // Load content when a test is selected
  useEffect(() => {
    if (selectedTestKey) {
      setIsLoading(true);
      storageGet<any>(selectedTestKey).then(content => {
        setSelectedTestContent(content);
        setIsLoading(false);
      }).catch(err => {
        logError(`Error loading content for test ${selectedTestKey}`, err);
        toast.error(`Could not load content for ${selectedTestKey}.`);
        setSelectedTestContent(null);
        setIsLoading(false);
      });
    }
  }, [selectedTestKey]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  const handleModeToggle = () => {
    const newMode = displayMode === 'json' ? 'human' : 'json';
    setDisplayMode(newMode);
    storageSet(TEST_VIEWER_MODE_KEY, newMode).catch(err => 
      logError("Error saving test viewer mode", err)
    );
  };

  const renderHumanReadable = (test: any): JSX.Element[] => {
    if (!test || !test.tasks || !Array.isArray(test.tasks)) {
      return [<p key="no-tasks">No tasks found or invalid format.</p>];
    }
    const elements: JSX.Element[] = [];
    test.tasks.forEach((task: any, taskIndex: number) => {
      elements.push(<h4 key={`task-h-${taskIndex}`}>{task.taskName || task.tab?.name || `Task ${taskIndex + 1}`}</h4>);
      if (task.steps && Array.isArray(task.steps)) {
        const stepList = task.steps.map((step: any, stepIndex: number) => {
          let stepDescription = step.description || `${step.cmd}`;
          if (step.selector) stepDescription += ` [${step.selector}]`;
          if (step.text) stepDescription += ` ("${step.text}")`;
          if (step.url) stepDescription += ` (${step.url})`;
          if (step.message) stepDescription += `: "${step.message}"`;
          if (step.expectedText) stepDescription += ` (expects: "${step.expectedText}")`;
          return <li key={`task-${taskIndex}-step-${stepIndex}`}>{stepDescription}</li>;
        });
        elements.push(<ul key={`task-ul-${taskIndex}`}>{stepList}</ul>);
      }
    });
    return elements;
  };

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1050 }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ width: '70%', maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h3>Archived Test Viewer</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
          <select 
            value={selectedTestKey || ''} 
            onChange={(e) => setSelectedTestKey(e.target.value)} 
            disabled={isLoading || archivedTests.length === 0}
            style={{ flexGrow: 1, padding: '5px' }}
          >
            <option value="" disabled>{archivedTests.length === 0 ? 'No archived tests found' : 'Select a test'}</option>
            {archivedTests.map(test => (
              <option key={test.storageKey} value={test.storageKey}>{test.name}</option>
            ))}
          </select>
          <button onClick={handleModeToggle} disabled={isLoading || !selectedTestContent} style={{ padding: '5px 10px' }}>
            Mode: {displayMode === 'json' ? 'JSON' : 'Human'}
          </button>
          <button onClick={onClose} style={{ padding: '5px 10px' }}>Close</button>
        </div>
        <div style={{ flexGrow: 1, overflowY: 'auto', background: '#f0f0f0', padding: '10px', border: '1px solid #ccc' }}>
          {isLoading && <p>Loading...</p>}
          {!isLoading && !selectedTestContent && selectedTestKey && <p>Could not load test content.</p>}
          {!isLoading && !selectedTestKey && <p>Select a test to view its content.</p>}
          {!isLoading && selectedTestContent && (
            displayMode === 'json' ? (
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(selectedTestContent, null, 2)}
              </pre>
            ) : (
              <div>{renderHumanReadable(selectedTestContent)}</div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default TestViewerDialog; 