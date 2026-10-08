import { WebSocket } from 'ws';

class WsManager {
  private connections = new Map<string, WebSocket>();

  register(sessionId: string, ws: WebSocket): void {
    this.connections.set(sessionId, ws);
  }

  unregister(sessionId: string): void {
    this.connections.delete(sessionId);
  }

  get(sessionId: string): WebSocket | undefined {
    return this.connections.get(sessionId);
  }

  emit(sessionId: string, payload: Record<string, unknown>): void {
    const ws = this.get(sessionId);
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        // Client disconnected mid-send — silently drop
      }
    }
  }

  streamText(sessionId: string, text: string): Promise<void> {
    return new Promise((resolve) => {
      const ws = this.get(sessionId);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }

      const words = text.split(' ');
      let i = 0;

      const next = () => {
        if (i >= words.length) {
          this.emit(sessionId, { type: 'text_end' });
          resolve();
          return;
        }
        const chunk = (i === 0 ? '' : ' ') + words[i++];
        this.emit(sessionId, { type: 'text_chunk', text: chunk });
        setTimeout(next, 40); // ~25 words/sec
      };

      next();
    });
  }
}

export const wsManager = new WsManager();
