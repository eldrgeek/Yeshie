import React, { useEffect, useState } from 'react';

interface PromptDialogHelperProps {
  isOpen: boolean;
  isReady: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

/**
 * Component that adds a prompt dialog button to the sidebar
 * for entering text without focus issues
 */
export default function PromptDialogHelper({ isOpen, isReady, setIsOpen }: PromptDialogHelperProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [chatGPTInput, setChatGPTInput] = useState<HTMLTextAreaElement | null>(null);
  
  useEffect(() => {
    if (!isReady) return;

    console.log('PromptDialogHelper: Initializing with isOpen:', isOpen);
    
    // Initialize ChatGPT input element
    const chatGPTInput = document.querySelector('textarea[placeholder*="ChatGPT"]') as HTMLTextAreaElement;
    if (chatGPTInput) {
      console.log('PromptDialogHelper: Found ChatGPT input element');
      setChatGPTInput(chatGPTInput);
    } else {
      console.log('PromptDialogHelper: ChatGPT input element not found');
    }

    // Add event listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      console.log('PromptDialogHelper: Cleaning up');
      window.removeEventListener('keydown', handleKeyDown);
      setChatGPTInput(null);
    };
  }, [isReady, isOpen]);
  
  // This component doesn't render anything
  return null;
} 