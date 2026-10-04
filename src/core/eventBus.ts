/**
 * @file eventBus.ts
 * @description The workspace's pub/sub event bus.
 */

// Event Bus class for pub-sub communication between panels
export class PanelEventBus {
  private listeners: Record<string, ((data: any) => void)[]> = {};

  subscribe(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  publish(event: string, data: any): void {
    if (this.listeners[event]) {
      // One subscriber that throws must not stop delivery to the rest (7.4.1), nor the action
      // that published — loadLayout, a close — halfway through.
      for (const cb of this.listeners[event]) {
        try {
          cb(data);
        } catch (e) {
          console.error(`[react-dockable-desktop] A subscriber to "${event}" threw:`, e);
        }
      }
    }
  }
}
