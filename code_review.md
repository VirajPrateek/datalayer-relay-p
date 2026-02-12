# Datalayer Relay Code Review & Performance Forecast

## 1. Code Review: Consent Mode & Logic

### Consent Logic Analysis
The implementation properly hooks into OneTrust's `OneTrustLoaded` and `OneTrustGroupsUpdated` events.
- **Strengths**:
  - Uses `bufferedEvents` to prevent tracking before consent is determined.
  - Correctly maps OneTrust groups (C0002, C0004) to GCM v2 types (`analytics_storage`, `ad_storage`, etc.).
  - Handles updates dynamically.

### Critical Logic Findings
1.  **Infinite Buffering Risk**: `consentInitialized` defaults to `false`. If the `OneTrustLoaded` event never fires (e.g., ad blocker, script error, misconfiguration), `bufferedEvents` will grow indefinitely. This is a **memory leak** and data loss risk (events are never sent).
2.  **Single Point of Failure**: The `dl.push` override calls `processDataLayerObject`. If `processDataLayerObject` throws an error (e.g., `safeStringify` fails on a weird proxy object), the execution stops, and **`originalPush` is never called**. This breaks the site's native GTM/datalayer functionality.
3.  **Retry Loop**: The retry mechanism tries to resend failed events *immediately* in the same flush cycle. If the failure is persistent (e.g., `relay_gtag` is missing), this could technically perform a busy-wait loop if not carefully managed (though purely pushing to an array likely won't throw repeatedly in a way that causes an infinite loop, it's still inefficient).

## 2. High Volume Traffic & Performance Forecast

### Forecasting Failures
Under high load (e.g., 100s of events per second):

1.  **Main Thread Blocking (The "Jank" Factor)**
    - `flushEventQueue` processes **all** queued events in a generic `while(eventQueue.length)` loop.
    - If 500 events are buffered (waiting for consent) and consent suddenly grants, the loop runs 500 times synchronously.
    - Inside the loop, `splitAndBundleParams` -> `safeStringify` is CPU intensive.
    - **Result**: The UI will freeze (jank) for the user right when consent is accepted.

2.  **Memory Usage**
    - `bufferedEvents` stores the raw parameter objects.
    - `persistentState` stores historical keys.
    - If traffic is high and consent is slow, the browser memory footprint will spike.

3.  **GTAG Overload**
    - Pushing 500 events instantly to `window[RELAY_DATALAYER_NAME]` means the GTAG script (loaded from SST) has to process them all.
    - If the SST endpoint (Client) is overloaded, GTAG might queue network requests. Browsers have limits on how many requests can be pending per domain (usually 6).
    - **Result**: Network request waterfall, potential lost hits if the browser tab closes before the queue drains.

## 3. Optimization Strategy

To ensure optimal site performance and stability:

1.  **Safety Valve**: Wrap logic in `try-catch` to ensure `originalPush` always runs.
2.  **Consent Safegaurd**: Add a timeout (e.g., 5 seconds). If OneTrust doesn't answer, initialize with defaults (or denied) to flush the buffer and stop the memory leak.
3.  **Time Slicing (Optimization)**: Modify `flushEventQueue` to process events in chunks (e.g., 50ms budget) and yield back to the main thread if it takes too long.
4.  **Debounced Persistence**: Persistence cleanup (`enforcePersistentLimit`) involves sorting. It shouldn't run on every single event if we are hammering the datalayer.

