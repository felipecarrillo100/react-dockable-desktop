import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  WindowManagerProvider,
  useWindowManagerActions,
  usePanelContext,
} from '../WindowManagerContext';

let testActions: any = null;

const ActionsExtractor: React.FC = () => {
  testActions = useWindowManagerActions();
  return null;
};

// Subscriber component that records received events via a ref
const SubscriberPanel: React.FC<{ onEvent: (data: any) => void; eventName: string }> = ({ onEvent, eventName }) => {
  const { subscribe } = usePanelContext();

  React.useEffect(() => {
    return subscribe(eventName, onEvent);
  }, [subscribe, onEvent, eventName]);

  return <div />;
};

describe('Inter-Panel Event Bus', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    testActions = null;
  });

  afterEach(() => {
    if (root) act(() => { root!.unmount(); });
    if (container) document.body.removeChild(container);
  });

  const mount = (children?: React.ReactNode) => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <WindowManagerProvider>
          <ActionsExtractor />
          {children}
        </WindowManagerProvider>
      );
    });
  };

  it('should deliver a published event to a subscriber', () => {
    const received: any[] = [];
    mount(<SubscriberPanel eventName="test-event" onEvent={(d) => received.push(d)} />);

    act(() => {
      testActions.publish('test-event', { value: 42 });
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ value: 42 });
  });

  it('should deliver the same event to multiple independent subscribers', () => {
    const first: any[] = [];
    const second: any[] = [];

    mount(
      <>
        <SubscriberPanel eventName="multi-event" onEvent={(d) => first.push(d)} />
        <SubscriberPanel eventName="multi-event" onEvent={(d) => second.push(d)} />
      </>
    );

    act(() => {
      testActions.publish('multi-event', { msg: 'hello' });
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toEqual({ msg: 'hello' });
    expect(second[0]).toEqual({ msg: 'hello' });
  });

  it('should not deliver events to subscribers on a different event name', () => {
    const received: any[] = [];

    mount(<SubscriberPanel eventName="channel-a" onEvent={(d) => received.push(d)} />);

    act(() => {
      testActions.publish('channel-b', { value: 99 });
    });

    expect(received).toHaveLength(0);
  });

  it('should stop delivering after unsubscribe', () => {
    const received: any[] = [];
    let unsubscribe: (() => void) | null = null;

    const Subscriber: React.FC = () => {
      const { subscribe } = usePanelContext();
      React.useEffect(() => {
        unsubscribe = subscribe('unsub-event', (d) => received.push(d));
        return unsubscribe;
      }, [subscribe]);
      return <div />;
    };

    mount(<Subscriber />);

    act(() => { testActions.publish('unsub-event', { n: 1 }); });
    expect(received).toHaveLength(1);

    act(() => { unsubscribe!(); });
    act(() => { testActions.publish('unsub-event', { n: 2 }); });

    expect(received).toHaveLength(1);
  });

  it('should deliver multiple publishes sequentially', () => {
    const received: any[] = [];
    mount(<SubscriberPanel eventName="seq-event" onEvent={(d) => received.push(d)} />);

    act(() => {
      testActions.publish('seq-event', { n: 1 });
      testActions.publish('seq-event', { n: 2 });
      testActions.publish('seq-event', { n: 3 });
    });

    expect(received).toHaveLength(3);
    expect(received.map((r: any) => r.n)).toEqual([1, 2, 3]);
  });

  it('should publish without throwing when there are no subscribers', () => {
    mount();
    expect(() => {
      act(() => { testActions.publish('orphan-event', { data: true }); });
    }).not.toThrow();
  });

  it('should publish via useWindowManagerActions and receive via usePanelContext', () => {
    // Verifies the two hooks share the same bus instance
    const received: any[] = [];
    mount(<SubscriberPanel eventName="cross-hook" onEvent={(d) => received.push(d)} />);

    act(() => { testActions.publish('cross-hook', { source: 'actions' }); });

    expect(received).toHaveLength(1);
    expect(received[0].source).toBe('actions');
  });

  it('should support subscribing via useWindowManagerActions.subscribe', () => {
    const received: any[] = [];
    let unsub: (() => void) | null = null;

    const DirectSubscriber: React.FC = () => {
      const { subscribe } = useWindowManagerActions();
      React.useEffect(() => {
        unsub = subscribe('direct-sub', (d) => received.push(d));
        return unsub;
      }, [subscribe]);
      return <div />;
    };

    mount(<DirectSubscriber />);

    act(() => { testActions.publish('direct-sub', { ok: true }); });

    expect(received).toHaveLength(1);
    expect(received[0].ok).toBe(true);
  });

  it('should handle payload of any serialisable shape', () => {
    const received: any[] = [];
    mount(<SubscriberPanel eventName="payload-event" onEvent={(d) => received.push(d)} />);

    const payload = { nested: { arr: [1, 2, 3], flag: true }, str: 'text' };
    act(() => { testActions.publish('payload-event', payload); });

    expect(received[0]).toEqual(payload);
  });
});
