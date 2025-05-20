import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SpeechInput } from '../../../extension/components/SpeechEditor';

// Simple smoke test to ensure component renders and accepts text

describe('SpeechInput', () => {
  it('renders textarea and accepts typing', () => {
    const { getByPlaceholderText } = render(<SpeechInput initialText="" />);
    const textarea = getByPlaceholderText(/enter text/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(textarea.value).toBe('hello');
  });
});
