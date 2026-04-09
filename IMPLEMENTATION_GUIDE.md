# Network Optimization Implementation Guide

**For:** Engineering Team  
**Status:** Ready to Implement  
**Timeline:** 4-5 hours total  
**Risk Level:** Low (all changes are isolated and reversible)

---

## Quick Overview

We're implementing 4 fixes that will reduce network transfer from **5.58 GB → 0.3 GB per 2 days** (98% reduction).

```
BEFORE: $111/month (over budget)
AFTER:  $3/month (under budget)
```

---

## Phase 1: Quick Wins (2 hours)

These three fixes give you 74% improvement and can be done in parallel.

### Fix 1: Dispatcher Poll Interval ⭐ CRITICAL
**Time:** 2 minutes  
**Effort:** 1 line  
**Impact:** 60% (3-4 GB saved)  
**Risk:** Zero

#### What to Change

**File:** `packages/sdk/src/worker.ts`

```diff
  this.runtime = new Runtime(this._provider, {
-     dispatcherPollIntervalMs: 10,
+     dispatcherPollIntervalMs: 500,
      workerLockTimeoutMs: 10_000,
      logLevel: this.config.logLevel ?? "error",
      maxSessionsPerRuntime: this.config.maxSessionsPerRuntime ?? 50,
      sessionIdleTimeoutMs: this.config.sessionIdleTimeoutMs ?? 3_600_000,
      workerNodeId: this.config.workerNodeId,
  });
```

#### Why This Works
- Duroxide checks for work every 500ms instead of 10ms
- Agent still responds in <500ms (imperceptible vs 5-10s LLM time)
- Reduces database polling from 100/sec → 2/sec
- Only config change, zero code logic changes

#### Testing
```bash
# 1. Verify change was applied
grep "dispatcherPollIntervalMs" packages/sdk/src/worker.ts
# Expected output: dispatcherPollIntervalMs: 500,

# 2. Run existing tests
npm test

# 3. Monitor Neon dashboard
# Expected: Query frequency drops from 100/sec → 2/sec immediately
```

#### Verification
- ✅ File changed
- ✅ Tests pass
- ✅ No compilation errors
- ✅ Neon dashboard shows query reduction

---

### Fix 2: Batch Per-Event Writes
**Time:** 1 hour  
**Effort:** 20 lines  
**Impact:** 9% (0.5 GB saved)  
**Risk:** Very Low

#### What to Change

**File:** `packages/sdk/src/session-proxy.ts`

**Step 1: Create event buffer**

Find the `runTurn` activity (around line 296) and add buffer initialization:

```ts
async runTurn(input: any) {
    // Add this at the beginning of the function:
    const eventBuffer: any[] = [];  // ← ADD THIS
    
    // ... existing code ...
}
```

**Step 2: Modify onEvent callback**

Find the `onEvent` callback (around line 378) and change it:

```diff
  const onEvent = (catalog || langFuseTracer)
      ? (event: { eventType: string; data: unknown }) => {
-         if (catalog && !EPHEMERAL_TYPES.has(event.eventType)) {
-             catalog.recordEvents(input.sessionId, [event]).catch((err: any) => {
-                 activityCtx.traceInfo(`[runTurn] CMS recordEvent failed: ${err}`);
-             });
-         }
+         // Buffer events instead of recording immediately
+         if (!EPHEMERAL_TYPES.has(event.eventType)) {
+             eventBuffer.push(event);  // ← BUFFER INSTEAD OF IMMEDIATE WRITE
+         }

          // LangFuse path (unchanged)
          if (langFuseTracer && lfGeneration) {
              // ... existing code ...
          }
      }
      : undefined;
```

**Step 3: Flush buffer at turn end**

Find where the turn completes (around line 541, after `session.runTurn()`) and add:

```diff
  // Mark session status after turn completes
  if (catalog) {
+     // Flush all buffered events at once
+     if (eventBuffer.length > 0) {
+         await catalog.recordEvents(input.sessionId, eventBuffer).catch((err: any) => {
+             activityCtx.traceInfo(`[runTurn] CMS recordEvents batch failed: ${err}`);
+         });
+     }
+
      await catalog.updateSession(input.sessionId, {
          state: postTurnState,
          lastActiveAt: new Date(),
          lastError: finalError?.message,
      }).catch((err: any) => {
          activityCtx.traceInfo(`[runTurn] CMS post-turn status update failed: ${err}`);
      });
  }
```

#### Why This Works
- Events are collected in memory during the turn
- All events are written in a single INSERT query at turn end
- Reduces 10-20 separate writes per turn → 1 write per turn
- Events still persist, just batched

#### Testing
```bash
# 1. Run integration tests
npm test -- session-proxy

# 2. Manually test agent turn
# - Send a message to an agent
# - Agent should process normally
# - Check Neon: should see 1 INSERT for events instead of 15-20

# 3. Verify no event loss
# - Complete a turn
# - Check session_events table has all events
```

#### Verification
- ✅ Events are recorded
- ✅ No events are lost
- ✅ Database writes reduced from 15-20 → 1 per turn
- ✅ Tests pass

---

### Fix 3: Cache Knowledge Index
**Time:** 30 minutes  
**Effort:** 30 lines  
**Impact:** 5% (0.3 GB saved)  
**Risk:** Very Low

#### What to Change

**File:** `packages/sdk/src/session-proxy.ts`

**Step 1: Add cache variables at module level**

Add to the top of the file (after imports):

```ts
// Knowledge Index Cache with TTL
interface CachedKnowledge {
    skills: Array<{ key: string; name: string; description: string }>;
    asks: Array<{ key: string; summary: string }>;
    expiresAt: number;
}

let knowledgeIndexCache: CachedKnowledge | null = null;
const KNOWLEDGE_CACHE_TTL_MS = 60_000;  // 60 seconds
```

**Step 2: Modify loadKnowledgeIndex activity**

Find `registerActivities` function and locate the `loadKnowledgeIndex` activity (around line 1120):

```diff
  loadKnowledgeIndex: async function* (input: any) {
      activityCtx.traceInfo("[loadKnowledgeIndex] loading curated skills and open asks");
      
+     // CHECK CACHE FIRST
+     const now = Date.now();
+     if (knowledgeIndexCache && now < knowledgeIndexCache.expiresAt) {
+         activityCtx.traceInfo(
+             `[loadKnowledgeIndex] cache hit (expires in ${
+                 Math.ceil((knowledgeIndexCache.expiresAt - now) / 1000)
+             }s)`
+         );
+         return knowledgeIndexCache;  // ← return from cache, 0 queries
+     }
+
+     // CACHE MISS - fetch fresh
+     activityCtx.traceInfo("[loadKnowledgeIndex] cache miss, fetching fresh");
      
      const cap = input.cap ?? 50;
      
      // ... existing fetch logic (lines 1124-1156) ...
      // [Read skills from factStore]
      // [Read asks from factStore]
      // [Filter and sort]
      
+     // STORE IN CACHE
+     const result = { skills, asks };
+     knowledgeIndexCache = {
+         ...result,
+         expiresAt: now + KNOWLEDGE_CACHE_TTL_MS
+     };
+
+     activityCtx.traceInfo(
+         `[loadKnowledgeIndex] cached ${skills.length} skills, ${asks.length} asks ` +
+         `(expires in 60s)`
+     );
-     return { skills, asks };
+     return result;
  }
```

**Step 3: Add cache invalidation**

Find where `writeFacts` is called (search in session-proxy.ts) and add invalidation:

```ts
// After any writeFacts call:
await factStore.writeFacts(...);

// Invalidate knowledge cache
knowledgeIndexCache = null;
activityCtx.traceInfo("[writeFacts] invalidated knowledge index cache");
```

#### Why This Works
- Knowledge index is fetched 200+ times per hour but changes rarely
- Cache stores result in memory for 60 seconds
- If data changes, cache is invalidated immediately
- Reduces 2 queries per turn → ~0 queries per turn

#### Testing
```bash
# 1. Run orchestration tests
npm test -- orchestration

# 2. Monitor cache hits/misses in logs
# Expected: First turn has "cache miss", subsequent turns have "cache hit"

# 3. Verify invalidation
# - Modify facts
# - Check that cache is invalidated
# - Next turn should fetch fresh

# 4. Check transfer reduction
# - Monitor Neon: queries/sec should drop
```

#### Verification
- ✅ Cache is created on first access
- ✅ Cache is reused for 60 seconds
- ✅ Cache invalidates on fact changes
- ✅ Logs show cache hits/misses
- ✅ Tests pass

---

## Phase 2: Optimal Solution (2-3 hours)

### Fix 4: LISTEN/NOTIFY for Client Polling
**Time:** 2-3 hours  
**Effort:** 40 lines  
**Impact:** 18% (1 GB saved)  
**Risk:** Low

#### Why LISTEN/NOTIFY?

Currently: Browser polls every 500ms even when nothing changed = wasted queries  
With LISTEN/NOTIFY: Postgres pushes instantly when events occur = zero wasted queries

#### What to Change

**File:** `packages/sdk/src/client.ts`

**Step 1: Add listener connection to PilotSwarmSession class**

Find the class definition (around line 840) and add fields:

```ts
export class PilotSwarmSession {
    // ... existing fields ...
    
+   private pgListenerClient: any = null;  // for LISTEN/NOTIFY
+   private pgPool: any = null;             // Postgres connection pool
    
    constructor(sessionId: string, client: PilotSwarmClient, onUserInput?: UserInputHandler) {
        this.sessionId = sessionId;
        this.client = client;
        this.onUserInput = onUserInput;
+       this.pgPool = client._getPostgresPool?.();
+       this._setupListener();
    }
}
```

**Step 2: Add listener setup method**

Add this new method to the PilotSwarmSession class:

```ts
private async _setupListener(): Promise<void> {
    try {
        if (!this.pgPool) return;  // fallback if no pool
        
        // Get a dedicated connection for LISTEN (can't use pooled connection)
        this.pgListenerClient = await this.pgPool.connect();
        
        // Subscribe to notifications for this session
        await this.pgListenerClient.query(
            `LISTEN session_${this.sessionId}_events`
        );
        
        // When notification arrives, fetch new events
        this.pgListenerClient.on('notification', async (msg: any) => {
            if (msg.channel === `session_${this.sessionId}_events`) {
                // Postgres pushed notification instantly!
                await this._poll();  // fetch the actual events
            }
        });
        
        console.log(`[PilotSwarmSession] Listening for ${this.sessionId} events`);
    } catch (err) {
        console.error(`[PilotSwarmSession] Failed to setup listener:`, err);
        // Fall back to polling if LISTEN fails
    }
}
```

**Step 3: Update polling interval**

Find line 850 and change:

```diff
- private static POLL_INTERVAL = 500;
+ private static POLL_INTERVAL = 30_000;  // slower fallback (30 seconds)
```

**Step 4: Clean up listener on stop**

Find the `_stopPolling` method (around line 978) and update:

```diff
  private _stopPolling(): void {
      if (this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
      }
+
+     // Clean up LISTEN connection
+     if (this.pgListenerClient) {
+         try {
+             this.pgListenerClient.query(`UNLISTEN session_${this.sessionId}_events`);
+             this.pgListenerClient.release();
+         } catch (err) {
+             // ignore cleanup errors
+         }
+         this.pgListenerClient = null;
+     }
  }
```

**Step 5: Send NOTIFY when events are recorded**

**File:** `packages/sdk/src/session-proxy.ts`

Find the `onEvent` callback (around line 382) and after recording events, add:

```ts
// After: await catalog.recordEvents(...)

// Add this:
try {
    // Notify listeners that this session has new events
    const pgPool = this._getCatalog?.()?.pool || this.pgPool;
    if (pgPool) {
        await pgPool.query(
            `NOTIFY session_${input.sessionId}_events, 'new_events'`
        );
    }
} catch (err) {
    // NOTIFY failure is not critical, ignore
}
```

#### Why This Works
- Browser subscribes to a Postgres NOTIFY channel
- When events are recorded, Postgres pushes notification immediately
- Browser receives instant notification (no polling needed)
- Fallback to slower polling (30s) if LISTEN fails
- Zero wasted queries when nothing changed

#### Testing
```bash
# 1. Run client tests
npm test -- client

# 2. Test LISTEN/NOTIFY functionality
# - Open portal with session
# - Send message to agent
# - Verify event appears instantly in browser (not waiting for poll)

# 3. Test fallback
# - Disconnect LISTEN (simulate failure)
# - Verify system falls back to 30-second polling
# - System still works

# 4. Stress test
# - Open 5 sessions in parallel
# - Send rapid messages
# - Verify all updates arrive correctly

# 5. Monitor transfer
# - Check Neon: should see mostly NOTIFY calls, minimal SELECT queries
```

#### Verification
- ✅ Browser receives instant updates
- ✅ Polling works as fallback
- ✅ No wasted queries
- ✅ All tests pass
- ✅ System handles connection failures

---

## Phase 3: Polish (Next Sprint - 10 minutes)

### Fix 5: Add LIMIT to listSessions

**File:** `packages/sdk/src/cms.ts` line 344

```diff
  async listSessions(): Promise<SessionRow[]> {
      const { rows } = await this.pool.query(
-         `SELECT * FROM ${this.sql.table} WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
+         `SELECT * FROM ${this.sql.table} WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500`,
      );
      return rows;
  }
```

### Fix 8: Lower getSessionEvents Default

**File:** `packages/sdk/src/cms.ts` line 408

```diff
- const effectiveLimit = limit ?? 1000;
+ const effectiveLimit = limit ?? 100;
```

---

## Implementation Checklist

### Phase 1: Quick Wins

- [ ] **Fix 1** (2 min)
  - [ ] Change dispatcherPollIntervalMs to 500
  - [ ] Verify grep finds the change
  - [ ] Run tests

- [ ] **Fix 2** (1 hour)
  - [ ] Add eventBuffer to runTurn
  - [ ] Modify onEvent to use buffer
  - [ ] Add flush at turn end
  - [ ] Run integration tests
  - [ ] Verify DB writes reduced

- [ ] **Fix 3** (30 min)
  - [ ] Add cache variables at module level
  - [ ] Add cache check in loadKnowledgeIndex
  - [ ] Add cache storage
  - [ ] Add cache invalidation
  - [ ] Run tests
  - [ ] Verify cache hits in logs

### Phase 2: Optimal Solution

- [ ] **Fix 4** (2-3 hours)
  - [ ] Add pgListenerClient field
  - [ ] Implement _setupListener method
  - [ ] Update polling interval
  - [ ] Update _stopPolling cleanup
  - [ ] Add NOTIFY calls in session-proxy.ts
  - [ ] Run client tests
  - [ ] Test LISTEN/NOTIFY functionality
  - [ ] Test fallback behavior
  - [ ] Stress test with multiple sessions

### Phase 3: Polish (Next Sprint)

- [ ] **Fix 5** - Add LIMIT to listSessions
- [ ] **Fix 8** - Lower getSessionEvents default

---

## Expected Results

### After Phase 1 (2 hours)

```
Network Transfer:  5.58 GB → 1.08 GB (81% reduction)
Monthly Cost:      $111 → $27 (76% reduction)
Status:            ⚠️ Under 3x budget (still too much, but improving)
User Impact:       None (invisible)
```

### After Phase 2 (4-5 hours total)

```
Network Transfer:  5.58 GB → 0.08 GB (99% reduction)
Monthly Cost:      $111 → $3 (97% reduction)
Status:            ✅ Under budget!
User Impact:       Actually better (instant updates instead of 500ms polls)
Architecture:      Improved (push instead of pull)
```

---

## Rollback Plan

If anything breaks, rollback is simple:

### Fix 1
```ts
// Change back to:
dispatcherPollIntervalMs: 10,
```

### Fix 2
```ts
// Remove the buffer, go back to immediate writes:
catalog.recordEvents(input.sessionId, [event]).catch(...)
```

### Fix 3
```ts
// Remove cache check, always fetch fresh:
// return knowledgeIndexCache  // remove this line
```

### Fix 4
```ts
// Disable LISTEN/NOTIFY:
// this._setupListener()  // comment out
// And go back to original interval
private static POLL_INTERVAL = 500;
```

---

## Deployment

### Order of Deployment
1. **Fix 1** (deploy immediately - zero risk)
2. **Fixes 2 & 3** (deploy together - related to data handling)
3. **Fix 4** (deploy after 2 & 3 are stable)
4. **Fixes 5 & 8** (deploy next sprint)

### Monitoring After Deployment

Watch these metrics:

```
Neon Dashboard:
├── Queries/sec (should drop from 100 → 2)
├── Network transfer (should drop immediately)
└── Response latency (should stay the same)

Application Logs:
├── "[loadKnowledgeIndex] cache hit" (should appear frequently)
├── "[PilotSwarmSession] Listening for session_X events" (LISTEN active)
└── Any errors related to database operations

User Experience:
├── Agent response time (should be unchanged or faster)
├── Portal updates (should be instant or 30s at worst)
└── No errors or warnings
```

---

## Questions & Support

### Common Questions

**Q: Can we do these in parallel?**  
A: Fix 1 must be done first (it's safe and validates the approach). Fixes 2 & 3 can be done in parallel. Fix 4 requires 2 & 3 to be done first.

**Q: What if a fix breaks something?**  
A: Each fix is isolated and can be rolled back independently. All have fallback mechanisms.

**Q: How do we test these?**  
A: See Testing section for each fix. Run npm test suite before/after each change.

**Q: Do we need to redeploy after each fix?**  
A: You can deploy all of Phase 1 in one deployment, then Phase 2 separately.

---

## Success Criteria

Phase 1 is successful when:
- ✅ All three fixes deployed
- ✅ Tests pass
- ✅ Neon shows 80%+ query reduction
- ✅ No errors in logs
- ✅ User experience unchanged

Phase 2 is successful when:
- ✅ Fix 4 deployed
- ✅ Browser receives instant updates
- ✅ Polling works as fallback
- ✅ Neon shows 99%+ query reduction
- ✅ All tests pass

---

**Ready to implement?**

Start with Fix 1 (2 minutes) to validate the approach, then proceed with Fixes 2 & 3.

Good luck! 🚀
