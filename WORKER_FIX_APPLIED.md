# 🔧 Worker Task Pickup Fix - Status

## Problem Identified

**AWS workers were not picking up tasks from the DynamoDB queue**

### Root Cause

**Field Name Mismatch Between Old and Current Code:**

| Aspect                        | Value                |
| ----------------------------- | -------------------- |
| **Old field name (working)**  | `assignedWorker`     |
| **New field name (broken)**   | `assignedWorkerId`   |
| **Database has**              | `assignedWorker`     |
| **Code was querying**         | `assignedWorkerId`   |

When old code created jobs, it stored the field as `assignedWorker`. When new code tried to read those jobs, it looked for `assignedWorkerId`, so the query always failed.

---

## Fix Applied ✅

### File: `src/queue/dynamodb-queue.ts`

#### 1. getNextJobForWorker() Function (Lines ~248-252)

✅ Already fixed with backward compatibility:

```typescript
// Support both old field name (assignedWorker) and new field name (assignedWorkerId)
const assignedWorkerId = item.assignedWorkerId || item.assignedWorker;

if (assignedWorkerId === workerId) return true;
if (!assignedWorkerId) return true;  // Unassigned jobs
```

#### 2. markJobActive() Function (Line ~301)

✅ Just fixed - Updated condition expression:

**Before:**

```typescript
ConditionExpression: '#status = :pending AND (assignedWorkerId = :workerId OR attribute_not_exists(assignedWorkerId))'
```

**After:**

```typescript
ConditionExpression: '#status = :pending AND (assignedWorkerId = :workerId OR assignedWorker = :workerId OR (attribute_not_exists(assignedWorkerId) AND attribute_not_exists(assignedWorker)))'
```

This allows jobs to be claimed if they have EITHER field name or if both are unset.

---

## How It Works Now

1. **Worker queries for pending jobs** using `getNextJobForWorker('worker-0')`
2. **Query checks both field names**: `assignedWorker` OR `assignedWorkerId`
3. **Returns job if:**
   - Assigned to this worker (`assignedWorker === 'worker-0'` OR `assignedWorkerId === 'worker-0'`)
   - OR job is unassigned (both fields null/missing)
4. **Worker claims job** using `markJobActive()` which:
   - Verifies job is in pending state
   - Verifies job is either assigned to this worker OR unassigned (both field variants)
   - Updates job to active and sets `assignedWorkerId` (new field name)

---

## Backward Compatibility ✅

- **Old jobs** with `assignedWorker` field → Still work
- **New jobs** with `assignedWorkerId` field → Still work
- **Mixed environment** → Works seamlessly

---

## Testing

Run the verification script to confirm:

```bash
npx ts-node scripts/verify-worker-fix.ts worker-0
```

This will:

1. Show sample pending jobs and their field names
2. Simulate worker task selection
3. Report how many tasks would be picked up

---

## Expected Result

✅ AWS workers should now:

- Find pending tasks in DynamoDB
- Pick them up and execute them
- Mark them as active
- Complete them successfully

---

## Summary

The issue was a simple but critical field name mismatch. The fix ensures workers check for BOTH field name variants, providing full backward compatibility with existing data while supporting the new naming convention.
