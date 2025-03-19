// Test setup file for Vitest
import type {} from 'vitest';
import { vi } from 'vitest';

// Mock global objects as needed
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Set up any other global mocks needed for testing
if (typeof window !== 'undefined') {
  // Create any missing window properties needed for tests
  window.parent = window.parent || window;
  window.postMessage = window.postMessage || vi.fn();

  // Mock socket.io client if needed
  vi.mock('socket.io-client', () => {
    return {
      default: vi.fn(() => ({
        on: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
    };
  });
} 