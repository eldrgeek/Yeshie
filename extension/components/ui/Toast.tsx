import React, { useEffect, useState } from 'react';
import './Toast.css'; // Import the CSS for the toast

interface ToastProps {
  message: string;
  duration?: number; // Optional duration in milliseconds
  onClose: () => void; // Callback when toast should close
}

const Toast: React.FC<ToastProps> = ({ message, duration = 3000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      // Wait for fade-out animation before calling onClose
      const closeTimer = setTimeout(onClose, 500); // 500ms matches animation duration
      return () => clearTimeout(closeTimer);
    }, duration);

    // Cleanup function to clear the timer if the component unmounts
    // or if the message/duration changes before the timer finishes
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="toast-notification fade-in-out">
      {message}
    </div>
  );
};

export default Toast; 