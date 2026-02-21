type MessageHandler = (data: Record<string, unknown>) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, MessageHandler[]> = new Map();
  private url: string;
  private reconnectDelay = 2000;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected to bridge');
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
      console.log('[WS] Disconnected, reconnecting...');
      setTimeout(() => this.connect(), this.reconnectDelay);
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  on(type: string, callback: MessageHandler): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  send(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send, not connected');
    }
  }
}
