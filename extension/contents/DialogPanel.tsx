import React, { useState, useEffect, useRef } from "react"
import { toggleLearnMode, isLearning } from "../functions/learn"

// Toast notification for acknowledging when something is learned
const Toast = ({ message, onClose }: { message: string, onClose: () => void }) => {
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: '#4CAF50',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
      zIndex: 2147483647,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      maxWidth: '300px'
    }}>
      <span>{message}</span>
    </div>
  )
}

const LearnPromptModal = ({ onConfirm, onCancel }: { onConfirm: (name: string) => void, onCancel: () => void }) => {
  const [name, setName] = useState("")
  const modalRef = useRef<HTMLDivElement>(null)

  // Add event handler for Escape key
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    
    window.addEventListener('keydown', handleEscKey)
    return () => window.removeEventListener('keydown', handleEscKey)
  }, [onCancel])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm(name)
    }
  }

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2147483647
      }}
      onClick={(e) => {
        // Close when clicking background (outside the modal)
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
    >
      <div 
        ref={modalRef}
        style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)',
          maxWidth: '500px',
          width: '100%'
        }}
      >
        <h2 style={{
          fontSize: '18px',
          fontWeight: 'bold',
          marginBottom: '16px'
        }}>What do you want me to learn on this page?</h2>
        <input
          style={{
            width: '100%',
            border: '1px solid #d1d5db',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '16px',
            boxSizing: 'border-box'
          }}
          placeholder="e.g., Select a vendor"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <button
            onClick={onCancel}
            style={{
              backgroundColor: '#f3f4f6',
              color: '#374151',
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              fontWeight: '500',
              cursor: 'pointer'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(name)}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              fontWeight: '500',
              cursor: 'pointer'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            disabled={!name.trim()}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function YeshieUI() {
  const [showModal, setShowModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault()
        
        // Don't show modal if already showing or processing
        if (showModal || isProcessing) return
        
        if (isLearning()) {
          setIsProcessing(true)
          // Stop the learning session and then show toast
          toggleLearnMode(() => Promise.resolve(""))
            .then((response) => {
              if (response.success) {
                if (response.action === 'stop' && response.result) {
                  const { result } = response;
                  const actionCount = result._meta?.actionCount || 0;
                  const message = `Learned "${result.procedureName}" with ${actionCount} actions. Result copied to clipboard.`;
                  setToast(message);
                } else {
                  setToast(response.message);
                }
              } else {
                setToast("Learn session ended.");
              }
              // Auto dismiss the toast after 2 seconds
              setTimeout(() => setToast(null), 2000);
            })
            .finally(() => setIsProcessing(false));
        } else {
          setShowModal(true);
        }
      }
    }
    
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [showModal, isProcessing])

  const beginLearn = async (name: string) => {
    if (!name.trim() || isProcessing) return
    
    setIsProcessing(true)
    setShowModal(false)
    
    try {
      const response = await toggleLearnMode(() => Promise.resolve(name))
      if (response.success) {
        setToast(response.message)
      } else {
        setToast("Learning mode cancelled")
      }
      setTimeout(() => setToast(null), 2000)
    } catch (error) {
      console.error("Error starting learn mode:", error)
      setToast("Error starting learn mode")
      setTimeout(() => setToast(null), 2000)
    } finally {
      setIsProcessing(false)
    }
  }

  const cancelLearn = () => {
    setShowModal(false)
  }

  return (
    <>
      {showModal && <LearnPromptModal onConfirm={beginLearn} onCancel={cancelLearn} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  )
}
