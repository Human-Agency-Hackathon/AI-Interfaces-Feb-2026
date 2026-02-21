/**
 * Test setup file for client-side tests
 * Referenced in vite.config.ts
 */

import { beforeAll, afterEach, afterAll } from 'vitest';

// Mock WebSocket globally for tests that need it
global.WebSocket = class MockWebSocket {
  constructor(public url: string) {}
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
} as any;

// Clean up after each test
afterEach(() => {
  // Clear any DOM modifications
  document.body.innerHTML = '';
});

beforeAll(() => {
  // Setup test environment
  console.log('🧪 Client test environment initialized');
});

afterAll(() => {
  console.log('✅ Client tests completed');
});
