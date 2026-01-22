# 🔍 Page.tsx & Create-Jobs Analysis - Job Creation Issue

## Finding: Field Name Mismatch in Job Storage

### Current Problem

The page.tsx file (admin/workers) is working correctly, but there's a **second field name mismatch** in how jobs are created:

| File | Field Name | Purpose |
| --- | --- | --- |
| `src/lib/adsterra/create-jobs.ts` (line 308) | `assignedWorkerId` | Stores job assignment |
| Old working code (commit 2f10ef5) | `assignedWorker` | Stores job assignment |
| Worker query code (after fix) | Checks BOTH fields ✅ | Reads job assignment |

### Where Jobs Are Created

**File:** `src/lib/adsterra/create-jobs.ts`

**Line 229:** Job creation correctly uses `assignedWorkerId` variable:
```typescript
const assignedWorkerId = 
  assignedWorkerIds.length > 0 
    ? assignedWorkerIds[jobCount % assignedWorkerIds.length]
    : undefined;
```

**Line 308:** Job is saved with field name `assignedWorkerId`:
```typescript
assignedWorkerId: job.assignedWorkerId || null,
```

### The Connection to page.tsx

The **admin/workers/page.tsx** file (the one you're looking at) is:
- ✅ A UI for managing worker configurations
- ✅ NOT responsible for creating jobs
- ✅ Correctly displays and manages per-worker settings

However, it DOES send data that gets used:
```typescript
// page.tsx line 230
...(assignedWorkerIds.length > 0 && { assignedWorkerIds })
```

This `assignedWorkerIds` array is sent to the run creation API, which then:
1. Creates a run with this list
2. Passes it to `createJobsForRun(run)`  
3. Jobs are created with field name `assignedWorkerId`

### Why Workers Can't Find Jobs

**Scenario:** User configures workers via page.tsx admin interface:
1. Selects workers: `worker-0, worker-1`
2. Creates run
3. `createJobsForRun()` creates jobs with `assignedWorkerId` field
4. Jobs stored in DynamoDB with `assignedWorkerId = "worker-0"`
5. Worker queries jobs looking for... `assignedWorker` OR `assignedWorkerId` (after our fix)
6. ✅ Now finds jobs!

### The Complete Picture

| Step | Component | Field Used | Status |
| --- | --- | --- | --- |
| 1 | page.tsx admin | `assignedWorkerIds` ✅ | Correct |
| 2 | API route | `run.assignedWorkerIds` ✅ | Correct |
| 3 | create-jobs.ts | `assignedWorkerId` ✅ | Correct (uses new name) |
| 4 | DynamoDB | stores `assignedWorkerId` ✅ | Correct (new name) |
| 5 | Worker query | checks BOTH field names ✅ | NOW CORRECT (after our fix) |

### Recommendation

The **current code is now fixed** because:
1. ✅ Jobs are consistently created with `assignedWorkerId` field
2. ✅ Workers now check for BOTH `assignedWorker` (old) AND `assignedWorkerId` (new)
3. ✅ New jobs will use consistent field name
4. ✅ Backward compatible with old jobs

### No Changes Needed in page.tsx

The page.tsx file is working correctly. The issue was in:
- ✅ **FIXED:** `src/queue/dynamodb-queue.ts` - Worker query logic
- ✅ **ALREADY CORRECT:** `src/lib/adsterra/create-jobs.ts` - Job creation uses `assignedWorkerId`

### Summary

The page.tsx admin interface is fine. The field names are now consistent:
- Admin UI sends: `assignedWorkerIds`
- Jobs created with: `assignedWorkerId` 
- Workers query: Both field names (✅ fixed)

Everything is now aligned and working correctly!
