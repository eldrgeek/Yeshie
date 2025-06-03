import React, { useState, useEffect } from 'react'
import type { RecordedEvent } from '../functions/passiveRecorder'

export interface Step {
  type: "click" | "input" | "focus"
  selector: string
  value?: string
  timestamp?: number
}

interface AnnotationDialogProps {
  steps: RecordedEvent[]
  onSave: (name: string, description: string, parameterizedSteps: Step[]) => void
  onCancel: () => void
}

export default function AnnotationDialog({ steps, onSave, onCancel }: AnnotationDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editableSteps, setEditableSteps] = useState<Step[]>([])

  // Initialize editable steps from recorded events
  useEffect(() => {
    const initialSteps: Step[] = steps.map(event => ({
      type: event.type,
      selector: event.selector,
      value: event.type === 'input' ? event.value : undefined,
      timestamp: event.timestamp
    }))
    setEditableSteps(initialSteps)
  }, [steps])

  const handleStepValueChange = (index: number, newValue: string) => {
    const updatedSteps = [...editableSteps]
    updatedSteps[index] = { ...updatedSteps[index], value: newValue }
    setEditableSteps(updatedSteps)
  }

  const handleParameterizeValue = (index: number) => {
    const updatedSteps = [...editableSteps]
    updatedSteps[index] = { ...updatedSteps[index], value: '{{prompt}}' }
    setEditableSteps(updatedSteps)
  }

  const handleDeleteStep = (index: number) => {
    const updatedSteps = editableSteps.filter((_, i) => i !== index)
    setEditableSteps(updatedSteps)
  }

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a name for this step sequence')
      return
    }

    if (editableSteps.length === 0) {
      alert('Cannot save an empty step sequence. Please record some steps first.')
      return
    }

    // Remove timestamp from final steps as it's not needed for replay
    const finalSteps = editableSteps.map(({ timestamp, ...step }) => step)
    
    onSave(name.trim(), description.trim(), finalSteps)
  }

  const styles = {
    overlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      zIndex: 2147483647,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    dialog: {
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '20px',
      maxWidth: '600px',
      maxHeight: '80vh',
      overflow: 'auto',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
    },
    header: {
      fontSize: '18px',
      fontWeight: 'bold' as const,
      marginBottom: '20px',
      color: '#333'
    },
    field: {
      marginBottom: '15px'
    },
    label: {
      display: 'block',
      fontSize: '14px',
      fontWeight: 'bold' as const,
      marginBottom: '5px',
      color: '#555'
    },
    input: {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      fontSize: '14px',
      boxSizing: 'border-box' as const
    },
    textarea: {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      fontSize: '14px',
      minHeight: '80px',
      resize: 'vertical' as const,
      boxSizing: 'border-box' as const
    },
    stepsList: {
      marginTop: '15px'
    },
    step: {
      border: '1px solid #eee',
      borderRadius: '4px',
      padding: '12px',
      marginBottom: '10px',
      backgroundColor: '#f9f9f9'
    },
    stepHeader: {
      fontSize: '12px',
      fontWeight: 'bold' as const,
      color: '#666',
      marginBottom: '8px'
    },
    stepDetails: {
      fontSize: '12px',
      color: '#444',
      marginBottom: '8px'
    },
    stepValue: {
      marginTop: '8px'
    },
    valueInput: {
      width: '100%',
      padding: '6px 8px',
      border: '1px solid #ddd',
      borderRadius: '3px',
      fontSize: '12px',
      boxSizing: 'border-box' as const
    },
    paramButton: {
      marginLeft: '8px',
      padding: '4px 8px',
      border: '1px solid #007AFF',
      borderRadius: '3px',
      backgroundColor: '#007AFF',
      color: 'white',
      fontSize: '11px',
      cursor: 'pointer'
    },
    deleteButton: {
      marginLeft: '8px',
      padding: '4px 8px',
      border: '1px solid #f44336',
      borderRadius: '3px',
      backgroundColor: '#f44336',
      color: 'white',
      fontSize: '11px',
      cursor: 'pointer'
    },
    stepControls: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    },
    buttons: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '20px',
      paddingTop: '15px',
      borderTop: '1px solid #eee'
    },
    button: {
      padding: '10px 20px',
      border: 'none',
      borderRadius: '4px',
      fontSize: '14px',
      cursor: 'pointer'
    },
    cancelButton: {
      backgroundColor: '#f5f5f5',
      color: '#333'
    },
    saveButton: {
      backgroundColor: '#4CAF50',
      color: 'white'
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
  }

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          📝 Annotate Recorded Steps
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Name:</label>
          <input
            type="text"
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., submitPromptToChatGPT"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Description:</label>
          <textarea
            style={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., This step submits a prompt to ChatGPT"
          />
        </div>

        <div style={styles.stepsList}>
          <label style={styles.label}>Recorded Steps ({editableSteps.length}):</label>
          {editableSteps.map((step, index) => (
            <div key={index} style={styles.step}>
              <div style={styles.stepControls}>
                <div style={styles.stepHeader}>
                  Step {index + 1}: {step.type.toUpperCase()}
                  {step.timestamp && (
                    <span style={{ marginLeft: '10px', fontWeight: 'normal', color: '#888' }}>
                      @ {formatTimestamp(step.timestamp)}
                    </span>
                  )}
                </div>
                <button
                  style={styles.deleteButton}
                  onClick={() => handleDeleteStep(index)}
                  title="Delete this step"
                >
                  Delete
                </button>
              </div>
              
              <div style={styles.stepDetails}>
                <strong>Selector:</strong> <code>{step.selector}</code>
              </div>

              {step.type === 'input' && (
                <div style={styles.stepValue}>
                  <label style={{ ...styles.label, fontSize: '12px' }}>
                    Value (edit to parameterize):
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      style={styles.valueInput}
                      value={step.value || ''}
                      onChange={(e) => handleStepValueChange(index, e.target.value)}
                      placeholder="Enter value or use {{prompt}}"
                    />
                    <button
                      style={styles.paramButton}
                      onClick={() => handleParameterizeValue(index)}
                      title="Replace with {{prompt}} parameter"
                    >
                      {`Use {{prompt}}`}
                    </button>
                  </div>
                  {step.value === '{{prompt}}' && (
                    <div style={{ fontSize: '11px', color: '#007AFF', marginTop: '4px' }}>
                      ✓ This value will be replaced with user input when replaying
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={styles.buttons}>
          <button
            style={{ ...styles.button, ...styles.cancelButton }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            style={{ ...styles.button, ...styles.saveButton }}
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save Step Sequence
          </button>
        </div>
      </div>
    </div>
  )
} 