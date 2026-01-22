# Worker Task Pickup: OLD CODE vs CURRENT CODE Comparison

## Summary
Analysis comparing commit `2f10ef5cfeb1be6fc57fb662fa7c383069160a40` (working) with current code to identify why workers cannot pick up tasks from DynamoDB.

---

## 🔴 CRITICAL DIFFERENCES FOUND

### Issue 1: Worker Assignment Field Name Mismatch

#### OLD CODE (2f10ef5 - WORKING ✅)
In `src/worker.ts` line 139 and `scripts/check-worker-schedule.ts`:
```typescript
// Worker uses: WORKER_ID
const WORKER_ID = workerId || process.env.WORKER_ID || 'default-worker';

// Script checks: assignedWorker (WITHOUT "Id" suffix)
FilterExpression: 'attribute_exists(assignedWorker) AND assignedWorker = :workerId'
```

In `src/queue/dynamodb-queue.ts` (old):
- Jobs created with: `assignedWorker` field (not `assignedWorkerId`)
- Check script looks for: `assignedWorker`

#### CURRENT CODE (NOW - BROKEN ❌)
In `src/queue/dynamodb-queue.ts`:
```typescript
// Line 37-38: Job item has DIFFERENT field names
assignedWorkerId: job.assignedWorkerId || null,  // ← CHANGED TO "assignedWorkerId"
assignedAt: job.assignedAt ? job.assignedAt.toISOString() : null,

// Line 247-250: In getNextJobForWorker()
if (item.assignedWorkerId === workerId) return true;
if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
```

**THE PROBLEM:** The database was created/populated with field name `assignedWorker`, but current code queries `assignedWorkerId`. These don't match!

### Impact
- Workers query jobs with condition: `item.assignedWorkerId === workerId`
- But database has: `assignedWorker` (not `assignedWorkerId`)
- Result: **All comparisons return false**, no jobs match, workers get nothing

---

### Issue 2: Worker ID Generation Changes

#### OLD CODE (2f10ef5 - WORKING ✅)
```typescript
// worker.ts line ~460
const workerId = 
  process.env.WORKER_ID || 
  (process.env.NODE_APP_INSTANCE ? `worker-${process.env.NODE_APP_INSTANCE}` : null) ||
  `worker-${i}`;  // ← Falls back to thread index
```

#### CURRENT CODE (NOW - UNCHANGED but context matters)
```typescript
// worker.ts line ~650-655
const workerId = 
  process.env.WORKER_ID || 
  (process.env.NODE_APP_INSTANCE ? `worker-${process.env.NODE_APP_INSTANCE}` : null) ||
  `worker-${i}`;  // ← Same logic
```

**No change here, but combined with Issue #1, if worker IDs don't match database assignments, workers are dead in water.**

---

### Issue 3: Job Query Filtering Logic

#### OLD CODE (2f10ef5 - WORKING ✅)
```typescript
// src/queue/dynamodb-queue.ts - getNextJobForWorker()
// Query for jobs where:
// - assignedWorker = workerId OR assignedWorker is null (unassigned)
// - status = pending
// - scheduledTime <= now (if not ignoring scheduled time)

const item = result.Items.find(
  (item) => {
    // Check assignedWorker field (without "Id")
    if (item.assignedWorker === workerId) return true;
    if (!item.assignedWorker || item.assignedWorker === null) return true;
    return false;
  }
);
```

#### CURRENT CODE (NOW - BROKEN ❌)
```typescript
// src/queue/dynamodb-queue.ts lines 247-250
const item = result.Items.find(
  (item) => {
    // Check assignedWorkerId field (WITH "Id" - MISMATCH!)
    if (item.assignedWorkerId === workerId) return true;
    if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
    return false;
  }
);
```

**The filtering logic is correct, but the field name is WRONG.**

---

## 📊 Side-by-Side Comparison: Key Functions

### getNextJobForWorker()

```
OLD CODE (WORKING)                    | NEW CODE (BROKEN)
─────────────────────────────────────────────────────────────
Query GSI1 for STATUS#pending         | Query GSI1 for STATUS#pending ✓
Limit: 50 items                       | Limit: 50 items ✓
Filter by status = pending            | Filter by status = pending ✓
─────────────────────────────────────────────────────────────
Check: item.assignedWorker            | Check: item.assignedWorkerId ✗
       === workerId                   |        === workerId
─────────────────────────────────────────────────────────────
Check: !item.assignedWorker           | Check: !item.assignedWorkerId ✗
       (unassigned jobs)              |        (unassigned jobs)
─────────────────────────────────────────────────────────────
Result: FINDS matching jobs ✓         | Result: FINDS NO jobs ✗
```

---

## 🔍 Root Cause Analysis

### DynamoDB Table State
Your DynamoDB table has jobs with these fields:
```json
{
  "PK": "JOB#abc123",
  "SK": "META",
  "assignedWorker": "worker-0",      // ← OLD field name
  "assignedWorkerId": null,          // ← NEW field name (probably never set)
  "status": "pending",
  ...
}
```

### What Happens When Workers Query
1. Worker requests job for "worker-0"
2. Query executes: `item.assignedWorkerId === "worker-0"`
3. Database returns: `item.assignedWorkerId = null` (or doesn't exist)
4. Comparison: `null === "worker-0"` → **FALSE** ✗
5. Result: Job is skipped
6. Worker gets nothing, logs no error

---

## ⚠️ How This Breaks Worker Pickup

### Worker Logic Flow (CURRENT - BROKEN)

```
Worker starts
   ↓
Load run config (pacingMode = 'human')
   ↓
ignoreScheduledTimeFlag = false
   ↓
Call getNextJobForWorker('worker-0', false)
   ↓
Query GSI1: WHERE GSI1PK = 'STATUS#pending' AND GSI1SK <= now
   ↓
Returns: [Job1, Job2, Job3] with 50-item limit
   ↓
Filter jobs in-memory:
   - Item 1: item.assignedWorkerId (doesn't exist/null) === 'worker-0' → FALSE
   - Item 2: item.assignedWorkerId (doesn't exist/null) === 'worker-0' → FALSE
   - Item 3: item.assignedWorkerId (doesn't exist/null) === 'worker-0' → FALSE
   ↓
No matching item found
   ↓
Return NULL ✗
   ↓
Worker logs: "No jobs available"
   ↓
Worker sleeps 5 seconds
   ↓
REPEAT → Never gets jobs!
```

---

## ✅ THE FIX

**Option A: Fix the Field Name in Query Code (RECOMMENDED)**

Change in `src/queue/dynamodb-queue.ts`, `getNextJobForWorker()` function, line ~247:

```typescript
// BEFORE (BROKEN):
const item = result.Items.find(
  (item) => {
    if (item.assignedWorkerId === workerId) return true;
    if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
    return false;
  }
);

// AFTER (FIXED):
const item = result.Items.find(
  (item) => {
    // Check BOTH old and new field names for compatibility
    const assigned = item.assignedWorker || item.assignedWorkerId;
    if (assigned === workerId) return true;
    if (!assigned) return true; // unassigned jobs
    return false;
  }
);
```

**Option B: Fix at Job Creation**

When new jobs are added, ensure they use the old field name:

```typescript
// In addJob()
item.assignedWorker = job.assignedWorker || job.assignedWorkerId || null;  // ← Support both names
item.assignedWorkerId = job.assignedWorker || job.assignedWorkerId || null; // ← Dual set
```

---

## 📋 Detailed Line-by-Line Comparison

### getNextJobForWorker() - Old vs Current

**OLD (WORKING - 2f10ef5):**
```typescript
// Field checking in filter
if (item.assignedWorker === workerId) return true;
if (!item.assignedWorker || item.assignedWorker === null) return true;
```

**CURRENT (BROKEN):**
```typescript
// Field checking in filter  
if (item.assignedWorkerId === workerId) return true;
if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
```

**DIFFERENCE:** `assignedWorker` vs `assignedWorkerId`

---

## 🎯 Summary Table

| Aspect | Old Code (✅ Working) | Current Code (❌ Broken) | Impact |
|--------|------|------|--------|
| **Field in DB** | `assignedWorker` | `assignedWorker` (unchanged) | Database still has old name |
| **Field in Query** | `item.assignedWorker` | `item.assignedWorkerId` | MISMATCH! |
| **Worker ID Gen** | Same | Same | No change |
| **GSI Query** | GSI1 | GSI1 | No change |
| **Status Filter** | `STATUS#pending` | `STATUS#pending` | No change |
| **Time Filter** | `GSI1SK <= now` | `GSI1SK <= now` | No change |
| **Result** | Jobs found ✓ | No jobs found ✗ | CRITICAL BUG |

---

## 🚀 Recommended Action

1. **Immediate Fix:** Update `getNextJobForWorker()` to check both field names:
   ```typescript
   const assigned = item.assignedWorker || item.assignedWorkerId;
   if (assigned === workerId || !assigned) return true;
   ```

2. **Longer Term:** Migrate all jobs to use `assignedWorkerId` consistently (new field name):
   ```bash
   # Scan all jobs and update old field name to new one
   ```

3. **Verify:** After fix, workers should start picking up tasks:
   ```bash
   npx ts-node scripts/check-worker-schedule.ts worker-0
   # Should show: "Found N tasks for worker-0"
   ```

---

## 📝 Files Affected

- `src/queue/dynamodb-queue.ts` - getNextJobForWorker() function (line 247-250)
- `src/worker.ts` - Uses getNextJobForWorker() (line ~650)
- Database records - Have `assignedWorker` field, not `assignedWorkerId`

