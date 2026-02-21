type MessageHandler = (data: Record<string, unknown>) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, MessageHandler[]> = new Map();
  private url: string;
  private reconnectDelay = 2000;
  private shouldReconnect = true;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    // Clean up previous WebSocket instance to prevent memory leaks
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }

    this.shouldReconnect = true;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected to bridge');
      this.listeners.get('ws:connected')?.forEach(fn => fn({}));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        const handlers = this.listeners.get(msg.type);
        if (handlers) {
          handlers.forEach((fn) => fn(msg));
        }
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };

    this.ws.onclose = () => {
      this.listeners.get('ws:disconnected')?.forEach(fn => fn({}));
      if (this.shouldReconnect) {
        console.log('[WS] Disconnected, reconnecting...');
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  on(type: string, callback: MessageHandler): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  off(type: string, callback: MessageHandler): void {
    const handlers = this.listeners.get(type);
    if (handlers) {
      const idx = handlers.indexOf(callback);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }

  /** Replay a message through registered handlers (for buffered messages). */
  emit(type: string, data: Record<string, unknown>): void {
    const handlers = this.listeners.get(type);
    if (handlers) {
      handlers.forEach((fn) => fn(data));
    }
  }

  send(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send, not connected');
    }
  }
}
