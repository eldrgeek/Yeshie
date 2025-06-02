import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SpeechInput, processTranscriptSegmentImpl, shouldPrependSpace } from '../../../extension/components/SpeechEditor';

// Simple smoke test to ensure component renders and accepts text

describe('SpeechInput', () => {
  it('renders textarea and accepts typing', () => {
    const { getByPlaceholderText } = render(<SpeechInput initialText="" />);
    const textarea = getByPlaceholderText(/enter text/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(textarea.value).toBe('hello');
  });

  it('processes punctuation without leading space when spoken separately', () => {
    const segment = 'period';
    const result = processTranscriptSegmentImpl(segment, 'Hello world', { isAllCaps: false });
    const needsSpace = shouldPrependSpace('Hello world', result);
    const final = 'Hello world' + (needsSpace ? ' ' : '') + result;
    expect(final).toBe('Hello world.');
  });

  it('preserves newline command', () => {
    const segment = 'new line';
    const result = processTranscriptSegmentImpl(segment, 'Hello', { isAllCaps: false });
    expect(result).toBe('\n');
  });

  it('handles "literally" command in one utterance', () => {
    const segment = 'literally period';
    const result = processTranscriptSegmentImpl(segment, 'Test ', { isAllCaps: false });
    const needsSpace = shouldPrependSpace('Test ', result);
    const final = 'Test ' + (needsSpace ? ' ' : '') + result;
    expect(final).toBe('Test period');
  });
});
