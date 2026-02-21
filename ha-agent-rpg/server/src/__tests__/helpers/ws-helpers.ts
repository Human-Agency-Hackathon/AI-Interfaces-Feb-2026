import WebSocket from 'ws';

export interface TestClient {
  ws: WebSocket;
  messages: any[];
  send(msg: Record<string, unknown>): void;
  waitForMessage(predicate: (msg: any) => boolean, timeoutMs?: number): Promise<any>;
  close(): Promise<void>;
}

export function connectClient(url: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: any[] = [];
    const waiters: Array<{ resolve: (msg: any) => void; predicate: (msg: any) => boolean }> = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(msg)) {
          waiters[i].resolve(msg);
          waiters.splice(i, 1);
        }
      }
    });

    ws.on('open', () => {
      resolve({
        ws,
        messages,
        send(msg) {
          ws.send(JSON.stringify(msg));
        },
        waitForMessage(predicate, timeoutMs = 5000) {
          const existing = messages.find(predicate);
          if (existing) return Promise.resolve(existing);

          return new Promise((res, rej) => {
            const timer = setTimeout(
              () => rej(new Error('Timed out waiting for message')),
              timeoutMs,
            );
            waiters.push({
              resolve: (msg) => {
                clearTimeout(timer);
                res(msg);
              },
              predicate,
            });
          });
        },
        close() {
          return new Promise<void>((res) => {
            if (ws.readyState === WebSocket.CLOSED) {
              res();
              return;
            }
            ws.on('close', () => res());
            ws.close();
          });
        },
      });
    });

    ws.on('error', reject);
  });
}
