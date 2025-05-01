import React, { useState, useEffect } from 'react'
import { toggleLearnMode } from '../functions/learn'

const styles = {
  toast: {
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
  }
} as const

export default function YeshieUI() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault()
        
        // Don't process if already processing
        if (isProcessing) return
        
        setIsProcessing(true)
        // Toggle learn mode directly
        toggleLearnMode()
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
      }
    }
    
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isProcessing])

  return (
    <div className="yeshie-ui">
      {toast && (
        <div style={styles.toast}>
          {toast}
        </div>
      )}
    </div>
  )
}
