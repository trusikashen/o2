# SIDE-BY-SIDE COMPARISON: OLD vs CURRENT Worker Task Pickup

## Key Finding: Field Name Mismatch

The workers cannot pick up tasks because the code queries for a field name that doesn't exist in the database.

---

## 🔴 THE BREAKING CHANGE

### Database Schema (What Exists)
```json
{
  "PK": "JOB#worker-task-123",
  "SK": "META",
  "jobId": "worker-task-123",
  "botId": "adsterra-bot-1", 
  "status": "pending",
  "assignedWorker": "worker-0",        ← FIELD NAME IN DB
  "assignedAt": "2026-01-22T10:00:00Z"
}
```

### Code Query (What It Looks For)
```typescript
if (item.assignedWorkerId === workerId)  ← FIELD NAME IN CODE (DIFFERENT!)
```

**Result:** `null` or `undefined` in the code, job is never matched, worker gets no tasks.

---

## Comparison Table: Query Logic

| Aspect | Commit 2f10ef5 (✅ WORKING) | Current Code (❌ BROKEN) | Fix (✅ PATCHED) |
|--------|---------|---------|---------|
| **Field Checked** | `assignedWorker` | `assignedWorkerId` | `assignedWorker \|\| assignedWorkerId` |
| **Database Match** | ✅ YES (field exists) | ❌ NO (field doesn't exist) | ✅ YES (checks both) |
| **Unassigned Check** | `!item.assignedWorker` | `!item.assignedWorkerId` | `!assignedWorkerId` |
| **Comparison** | `item.assignedWorker === workerId` | `item.assignedWorkerId === workerId` | `assignedWorkerId === workerId` |
| **Result** | ✅ Finds jobs | ❌ Finds nothing | ✅ Finds jobs |

---

## Code Comparison: getNextJobForWorker()

### COMMIT 2f10ef5 (WORKING ✅)
```typescript
export async function getNextJobForWorker(
  workerId: string,
  ignoreScheduledTime = false
): Promise<SessionJob | null> {
  const now = new Date().toISOString();

  let result;
  if (ignoreScheduledTime) {
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
        },
        Limit: 50,
        ScanIndexForward: true,
      })
    );
  } else {
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status AND GSI1SK <= :now',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
          ':now': now,
        },
        Limit: 50,
        ScanIndexForward: true,
      })
    );
  }

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  // ✅ CORRECT: Checks 'assignedWorker' (old field name that exists in DB)
  const item = result.Items.find(
    (item) => {
      if (item.assignedWorker === workerId) return true;         // ← OLD FIELD NAME
      if (!item.assignedWorker || item.assignedWorker === null) return true;
      return false;
    }
  );

  if (!item) {
    return null;
  }

  return {
    id: item.jobId,
    botId: item.botId,
    sessionNumber: item.sessionNumber,
    runId: item.runId,
    scheduledTime: new Date(item.scheduledTime),
    status: item.status,
    distribution: item.distribution || undefined,
  };
}
```

---

### CURRENT CODE (BROKEN ❌)
```typescript
export async function getNextJobForWorker(
  workerId: string,
  ignoreScheduledTime = false
): Promise<SessionJob | null> {
  const now = new Date().toISOString();

  let result;
  if (ignoreScheduledTime) {
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
        },
        Limit: 50,
        ScanIndexForward: true,
      })
    );
  } else {
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status AND GSI1SK <= :now',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
          ':now': now,
        },
        Limit: 50,
        ScanIndexForward: true,
      })
    );
  }

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  // ❌ BROKEN: Checks 'assignedWorkerId' (field name that DOESN'T exist in DB)
  const item = result.Items.find(
    (item) => {
      if (item.assignedWorkerId === workerId) return true;      // ← NEW FIELD NAME (MISMATCH!)
      if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
      return false;
    }
  );

  if (!item) {
    return null;
  }

  return {
    id: item.jobId,
    botId: item.botId,
    sessionNumber: item.sessionNumber,
    runId: item.runId,
    scheduledTime: new Date(item.scheduledTime),
    status: item.status,
    distribution: item.distribution || undefined,
  };
}
```

---

### FIXED CODE (PATCHED ✅)
```typescript
export async function getNextJobForWorker(
  workerId: string,
  ignoreScheduledTime = false
): Promise<SessionJob | null> {
  const now = new Date().toISOString();

  let result;
  if (ignoreScheduledTime) {
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
        },
        Limit: 50,
        ScanIndexForward: true,
      })
    );
  } else {
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status AND GSI1SK <= :now',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
          ':now': now,
        },
        Limit: 50,
        ScanIndexForward: true,
      })
    );
  }

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  // ✅ FIXED: Checks BOTH field names for backward compatibility
  // Support both old field name (assignedWorker) and new field name (assignedWorkerId)
  const item = result.Items.find(
    (item) => {
      // Support both old field name (assignedWorker) and new field name (assignedWorkerId)
      const assignedWorkerId = item.assignedWorkerId || item.assignedWorker;  // ← ACCEPTS BOTH
      
      // If job is assigned to this worker, return it
      if (assignedWorkerId === workerId) return true;
      // If job is unassigned, return it (backward compatibility)
      if (!assignedWorkerId) return true;
      // Don't return jobs assigned to other workers
      return false;
    }
  );

  if (!item) {
    return null;
  }

  return {
    id: item.jobId,
    botId: item.botId,
    sessionNumber: item.sessionNumber,
    runId: item.runId,
    scheduledTime: new Date(item.scheduledTime),
    status: item.status,
    distribution: item.distribution || undefined,
  };
}
```

---

## The Critical Filter Logic Comparison

### Old (✅ WORKS)
```typescript
if (item.assignedWorker === workerId) return true;
```
- Checks: `"worker-0" === "worker-0"` → **TRUE** ✓
- Result: Job is found and returned

### Current (❌ FAILS)
```typescript
if (item.assignedWorkerId === workerId) return true;
```
- Checks: `undefined === "worker-0"` → **FALSE** ✗
- Result: Job is rejected, worker gets NULL

### Fixed (✅ WORKS)
```typescript
const assignedWorkerId = item.assignedWorkerId || item.assignedWorker;
if (assignedWorkerId === workerId) return true;
```
- Checks: `("undefined" || "worker-0") === "worker-0"` → **TRUE** ✓
- Result: Job is found and returned

---

## Real Database Record Example

### What's Actually in DynamoDB
```json
{
  "PK": {
    "S": "JOB#session-0-2026-01-22"
  },
  "SK": {
    "S": "META"
  },
  "jobId": {
    "S": "session-0-2026-01-22"
  },
  "status": {
    "S": "pending"
  },
  "assignedWorker": {
    "S": "worker-0"           ← THIS FIELD EXISTS
  },
  "assignedWorkerId": {
    "NULL": true              ← THIS FIELD IS NULL or DOESN'T EXIST
  },
  "botId": {
    "S": "adsterra-bot-1"
  },
  "scheduledTime": {
    "S": "2026-01-22T10:00:00.000Z"
  }
}
```

### Query on Broken Code
```typescript
// Looking for: item.assignedWorkerId === "worker-0"
// Finds: assignedWorkerId is NULL or undefined
// Result: false !== true
// Output: Job REJECTED ❌
```

### Query on Fixed Code
```typescript
// Looking for: (item.assignedWorkerId || item.assignedWorker) === "worker-0"
// Finds: assignedWorker === "worker-0"
// Result: true === true  
// Output: Job ACCEPTED ✅
```

---

## Summary of Changes

| Metric | Old (2f10ef5) | Current (Broken) | Fixed |
|--------|---|---|---|
| Query Field | `assignedWorker` | `assignedWorkerId` | Both (fallback) |
| DB Compatibility | ✅ 100% | ❌ 0% | ✅ 100% |
| Finds Jobs | ✅ YES | ❌ NO | ✅ YES |
| Workers Active | ✅ Processing | ❌ Idle | ✅ Processing |
| Code Changes | N/A | N/A | 5 lines |
| Migration Needed | N/A | N/A | NO |
| Backward Compat | ✅ N/A | ✅ N/A | ✅ YES |

---

## How Workers Behave

### With Broken Code (Current)
```
Worker: "Looking for my job..."
Query: "SELECT * FROM jobs WHERE status='pending'"
Result: [Job1, Job2, Job3]

For each job:
  Check: "Is this job for me?"
  Look for: job.assignedWorkerId
  Find: undefined/null
  Think: "This isn't for me" ❌
  
Final: No jobs found
Worker: "💤 Sleeping... No tasks available"
Loop: Repeat forever
```

### With Fixed Code
```
Worker: "Looking for my job..."
Query: "SELECT * FROM jobs WHERE status='pending'"
Result: [Job1, Job2, Job3]

For each job:
  Check: "Is this job for me?"
  Look for: job.assignedWorkerId || job.assignedWorker
  Find: "worker-0"
  Think: "This IS for me!" ✅
  
Final: Job found!
Worker: "🚀 Session 1: Starting..."
Loop: Process job → Complete → Get next
```

---

## Files Modified

**File:** `src/queue/dynamodb-queue.ts`
**Function:** `getNextJobForWorker()`
**Lines Changed:** ~247-257
**Change Type:** Backward compatibility patch

---

## Testing the Fix

### Before Testing
```bash
# Worker logs show:
❌ "💤 No jobs available, polling again in 5000ms..."
❌ "💤 No jobs available, polling again in 5000ms..."
# Repeats forever - no jobs processed
```

### After Applying Fix
```bash
# Worker logs should show:
✅ "🚀 [botId] Session 1: Starting..."
✅ "✅ [botId] Session 1: Completed in 2.5s"
✅ "🚀 [botId] Session 2: Starting..."
# Tasks being processed normally
```

