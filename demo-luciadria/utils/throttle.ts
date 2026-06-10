export interface ThrottleOptions {
    leading?: boolean;
    trailing?: boolean;
}

export interface ThrottledFunction<T extends (...args: any[]) => void> {
    (...args: Parameters<T>): void;
    cancel(): void;
    flush(): void;
}

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds. Mimics Lodash's architecture.
 */
export function throttle<T extends (...args: any[]) => void>(
    func: T,
    wait: number,
    options: ThrottleOptions = {}
): ThrottledFunction<T> {
    // Lodash defaults: both leading and trailing are true
    const leading = options.leading !== false;
    const trailing = options.trailing !== false;

    // We reuse a robust debounce implementation under the hood,
    // leveraging `maxWait` to turn it into a throttle.
    return debounce(func, wait, {
        leading,
        trailing,
        maxWait: wait,
    });
}

interface DebounceOptions {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
}

/**
 * Internal helper: Full-featured debounce that supports maxWait, leading, and trailing.
 */
function debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number,
    options: DebounceOptions = {}
): ThrottledFunction<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;
    let lastThis: any = null;
    let result: any = null;

    let lastCallTime: number | null = null;
    let lastInvokeTime = 0;

    const leading = !!options.leading;
    const trailing = options.trailing !== false;
    const maxWait = options.maxWait !== undefined ? Math.max(options.maxWait, wait) : null;

    // Determines if the function is allowed to run at the current moment
    function shouldInvoke(time: number): boolean {
        if (lastCallTime === null) return true;

        const timeSinceLastCall = time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;

        // Invoke if:
        // 1. It's the first call
        // 2. We've waited longer than the `wait` timeout
        // 3. System clock changed backwards
        // 4. We hit the `maxWait` threshold (the core throttle mechanism)
        return (
            timeSinceLastCall >= wait ||
            timeSinceLastCall < 0 ||
            (maxWait !== null && timeSinceLastInvoke >= maxWait)
        );
    }

    function invokeFunc(time: number): any {
        const args = lastArgs;
        const thisArg = lastThis;

        lastArgs = null;
        lastThis = null;
        lastInvokeTime = time;

        if (args) {
            result = func.apply(thisArg, args);
        }
        return result;
    }

    function startTimer(pendingFunc: () => void, waitTime: number): ReturnType<typeof setTimeout> {
        return setTimeout(pendingFunc, waitTime);
    }

    function remainingWait(time: number): number {
        if (lastCallTime === null) return 0;

        const timeSinceLastCall = time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;
        const timeWaiting = wait - timeSinceLastCall;

        // If throttling (maxWait exists), calculate if the maxWait boundary happens sooner than the debounce wait
        if (maxWait !== null) {
            const maxWaitingTime = maxWait - timeSinceLastInvoke;
            return Math.min(timeWaiting, maxWaitingTime);
        }

        return timeWaiting;
    }

    function trailingEdge(time: number): any {
        timeoutId = null;

        // Only invoke on trailing edge if we have args saved (meaning it was called during the wait period)
        if (trailing && lastArgs) {
            return invokeFunc(time);
        }

        lastArgs = null;
        lastThis = null;
        return result;
    }

    function timerExpired(): void {
        const time = Date.now();
        if (shouldInvoke(time)) {
            trailingEdge(time);
            return;
        }
        // Otherwise, restart the timer for the remaining duration
        timeoutId = startTimer(timerExpired, remainingWait(time));
    }

    function leadingEdge(time: number): any {
        // Reset any existing maxWait timers
        lastInvokeTime = time;
        // Start the timer for the trailing edge
        timeoutId = startTimer(timerExpired, wait);
        // Invoke immediately if leading option is true
        return leading ? invokeFunc(time) : result;
    }

    // --- The returned throttled function ---
    function throttled(this: any, ...args: Parameters<T>): void {
        const time = Date.now();
        const isInvoking = shouldInvoke(time);

        lastArgs = args;
        lastThis = this;
        lastCallTime = time;

        if (isInvoking) {
            if (timeoutId === null) {
                leadingEdge(lastCallTime);
                return;
            }
            if (maxWait !== null) {
                // Handle consecutive invocations inside a throttle loop
                clearTimeout(timeoutId);
                timeoutId = startTimer(timerExpired, wait);
                invokeFunc(lastCallTime);
                return;
            }
        }

        if (timeoutId === null) {
            timeoutId = startTimer(timerExpired, wait);
        }
    }

    // --- Utility Methods ---
    throttled.cancel = function(): void {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        lastInvokeTime = 0;
        lastArgs = null;
        lastThis = null;
        lastCallTime = null;
        timeoutId = null;
    };

    throttled.flush = function(): any {
        return timeoutId === null ? result : trailingEdge(Date.now());
    };

    return throttled;
}
