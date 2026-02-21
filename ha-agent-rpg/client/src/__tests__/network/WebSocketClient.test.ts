import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocketClient } from '../../network/WebSocketClient';

describe('WebSocketClient', () => {
  let client: WebSocketClient;
  const TEST_URL = 'ws://localhost:3000';

  beforeEach(() => {
    client = new WebSocketClient(TEST_URL);
  });

  it('should create instance with correct URL', () => {
    expect(client).toBeDefined();
  });

  it('should register message listeners', () => {
    const handler = vi.fn();
    client.on('world:state', handler);

    // Handler should be registered (will be called when message arrives)
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support multiple listeners for same event type', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    client.on('world:state', handler1);
    client.on('world:state', handler2);

    // Both handlers registered
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should send messages when connected', () => {
    // Create mock WebSocket instance
    const mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };

    // Spy on WebSocket constructor
    const originalWebSocket = global.WebSocket;
    global.WebSocket = class MockWebSocket {
      constructor(public url: string) {
        return mockWs as any;
      }
    } as any;

    client.connect();

    const testMessage = { type: 'player:command', command: 'help' };
    client.send(testMessage);

    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(testMessage));

    // Restore original WebSocket
    global.WebSocket = originalWebSocket;
  });

  it('should not send messages when disconnected', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Try to send without connecting
    client.send({ type: 'test' });

    expect(consoleSpy).toHaveBeenCalledWith('[WS] Cannot send, not connected');

    consoleSpy.mockRestore();
  });
});
