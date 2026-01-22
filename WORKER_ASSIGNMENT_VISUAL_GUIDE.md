# Worker Assignment System - Visual Guide

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        FRONTEND / API                         │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ POST /api/adsterra/runs
                   │ {name, config, assignedWorkerIds}
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                   Run Creation & Storage                      │
│              (src/app/api/adsterra/runs/route.ts)            │
│                                                               │
│  Store in DynamoDB:                                          │
│  - run.id, config, status: "pending"                         │
│  - assignedWorkerIds: ["worker-0", "worker-1"]  // optional  │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ POST /api/adsterra/runs/[runId]/start
                   ▼
┌──────────────────────────────────────────────────────────────┐
│              Job Generation & Distribution                    │
│           (src/lib/adsterra/create-jobs.ts)                  │
│                                                               │
│  For each job (1000 total):                                  │
│    IF assignedWorkerIds = ["worker-0", "worker-1"]          │
│      - Job 0: assignedWorkerId = "worker-0"                 │
│      - Job 1: assignedWorkerId = "worker-1"                 │
│      - Job 2: assignedWorkerId = "worker-0" (round-robin)   │
│      - Job 3: assignedWorkerId = "worker-1"                 │
│    ELSE                                                       │
│      - assignedWorkerId = null (any worker can claim)        │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ Store in DynamoDB AdsterraJobs table
                   │ {id, status: "pending", assignedWorkerId}
                   ▼
        ┌──────────────────────────────┐
        │   DynamoDB AdsterraJobs      │
        │  ┌────────────────────────┐  │
        │  │ Job 0 | pending|w0|null│  │
        │  │ Job 1 | pending|w1|null│  │
        │  │ Job 2 | pending|w0|null│  │
        │  │ Job 3 | pending|w1|null│  │
        │  │ ...                    │  │
        │  └────────────────────────┘  │
        └──────────────────────────────┘
        │    │    │    │    │    │    │
        │    │    │    │    │    │    │
        ▼    ▼    ▼    ▼    ▼    ▼    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WORKER INSTANCES (15 total)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Worker-0   │  │  Worker-1   │  │  Worker-2   │  ...        │
│  │ (PM2 id: 0) │  │ (PM2 id: 1) │  │ (PM2 id: 2) │             │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤           │
│  │ workerId:   │  │ workerId:   │  │ workerId:   │             │
│  │ \"worker-0\" │  │ \"worker-1\" │  │ \"worker-2\" │             │
│  │             │  │             │  │             │             │
│  │ getNextJob()│  │ getNextJob()│  │ getNextJob()│             │
│  │ (filters)   │  │ (filters)   │  │ (filters)   │             │
│  │             │  │             │  │             │             │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
        ▲    ▲                    │    ▲
        │    │                    │    │
        │    │  getNextJob(w0)    │    │
        │    │  Query jobs where  │    │
        │    │  assignedWorkerId  │    │
        │    │  = \"worker-0\" OR  │    │
        │    │  = null            │    │
        │    │                    ▼    │
        │    └────────────────────────┘
        │
        │  markJobActive(jobId, "worker-0")
        │  Set: assignedWorkerId = "worker-0"
        │       assignedAt = now
        │       status = "active\"
        │
        └────────────────────────────────
            Process job, return to "completed"
```

---

## Job Assignment Flow (Detailed)

```
CREATE CAMPAIGN REQUEST
│
├─ name: \"Campaign for Worker-0\"
├─ config: {...}
└─ assignedWorkerIds: [\"worker-0\"]  ◄─ KEY PARAMETER
│
▼
API Handler (src/app/api/adsterra/runs/route.ts)
│
├─ Validate request
├─ Store run in DynamoDB
│  └─ assignedWorkerIds: [\"worker-0\"]  ◄─ STORED IN RUN
│
▼
User clicks \"Start\" button
│
▼
START ENDPOINT (src/app/api/adsterra/runs/[runId]/start/route.ts)
│
├─ Load run from DynamoDB
│  └─ assignedWorkerIds: [\"worker-0\"]  ◄─ READ FROM RUN
│
▼
createJobsForRun(run)
│
├─ For each job in campaign:
│
│  assignedWorkerIds = run.assignedWorkerIds  // [\"worker-0\"]
│  assignedWorkerId = assignedWorkerIds[jobIndex % length]
│  
│  // Job 0: 0 % 1 = 0 → \"worker-0\"
│  // Job 1: 1 % 1 = 0 → \"worker-0\"
│  // Job 2: 2 % 1 = 0 → \"worker-0\"
│
├─ Create DynamoDB item:
│  {
│    PK: \"JOB#run-bot-0-session-1\",
│    SK: \"META\",
│    status: \"pending\",
│    assignedWorkerId: \"worker-0\",  ◄─ SET HERE
│    assignedAt: null,
│    scheduledTime: \"2026-01-20T15:00:00Z\",
│    ...
│  }
│
▼
DynamoDB Table: AdsterraJobs
│
├─ [Job 0] status:pending, assignedWorkerId:worker-0, assignedAt:null
├─ [Job 1] status:pending, assignedWorkerId:worker-0, assignedAt:null
└─ [Job 2] status:pending, assignedWorkerId:worker-0, assignedAt:null
│
▼
WORKER PROCESSES JOB
│
worker-0 thread starts
│  
├─ Generate workerId = \"worker-0\"  (from WORKER_ID env or PM2)
│
├─ getNextJobForWorker(\"worker-0\")
│  └─ Query: WHERE (assignedWorkerId = \"worker-0\" OR assignedWorkerId = null)
│     └─ AND status = \"pending\"
│     └─ ORDER BY scheduledTime ASC
│     └─ LIMIT 1
│
├─ Found: Job 0 (assignedWorkerId: \"worker-0\")
│
├─ markJobActive(\"job-id\", \"worker-0\")
│  └─ UpdateCommand:
│     ├─ SET status = \"active\"
│     ├─ SET assignedWorkerId = \"worker-0\"  ◄─ CONFIRMED/UPDATED
│     └─ SET assignedAt = now()  ◄─ TIMESTAMP SET
│
├─ DynamoDB updates:
│  [Job 0] status:active, assignedWorkerId:worker-0, assignedAt:2026-01-20T15:05:30Z
│
├─ Process job (execute bot session)
│
├─ markJobCompleted(\"job-id\")
│  └─ SET status = \"completed\"
│
└─ DynamoDB updates:
   [Job 0] status:completed, assignedWorkerId:worker-0, assignedAt:2026-01-20T15:05:30Z
```

---

## Multi-Worker Assignment Example

```
REQUEST:
  assignedWorkerIds: [\"worker-0\", \"worker-1\", \"worker-2\"]

DISTRIBUTION (6 jobs):
  Job 0: 0 % 3 = 0 → worker-0
  Job 1: 1 % 3 = 1 → worker-1
  Job 2: 2 % 3 = 2 → worker-2
  Job 3: 3 % 3 = 0 → worker-0  ◄─ BACK TO WORKER-0
  Job 4: 4 % 3 = 1 → worker-1
  Job 5: 5 % 3 = 2 → worker-2

RESULT IN DYNAMODB:
  ┌─────────────────────────────────────┐
  │ Job | assignedWorkerId              │
  ├─────────────────────────────────────┤
  │  0  │ worker-0                       │
  │  1  │ worker-1                       │
  │  2  │ worker-2                       │
  │  3  │ worker-0                       │
  │  4  │ worker-1                       │
  │  5  │ worker-2                       │
  └─────────────────────────────────────┘

WORKER CLAIMING:
  Worker-0 → Gets jobs 0, 3 (only gets jobs assigned to it)
  Worker-1 → Gets jobs 1, 4
  Worker-2 → Gets jobs 2, 5
  Worker-3 → Gets nothing (not in assignedWorkerIds)
```

---

## Query Patterns

### Pattern 1: Get Jobs for Specific Worker
```sql
Query AdsterraJobs:
  WHERE assignedWorkerId = "worker-0"
  AND status = "pending"
  
Result: All jobs assigned to worker-0
```

### Pattern 2: Get Unassigned Jobs (Any Worker)
```sql
Query AdsterraJobs:
  WHERE assignedWorkerId = null
  AND status = "pending"
  
Result: All jobs available to any worker
```

### Pattern 3: Worker's Logic
```typescript
getNextJobForWorker(workerId) {
  // Query for:
  // (assignedWorkerId = workerId) OR (assignedWorkerId = null)
  
  // This allows:
  // - Priority: jobs assigned specifically to this worker
  // - Fallback: any unassigned jobs if no specific assignments
}
```

### Pattern 4: Monitor Job Assignments
```sql
Query AdsterraJobs:
  WHERE status = "active"
  
Result: See which worker is processing each job
  {jobId, assignedWorkerId, assignedAt, status}
```

---

## Backward Compatibility

```
OLD CAMPAIGN (before this change):
  Request: {name, config}  ← No assignedWorkerIds
  
  Result: 
    assignedWorkerId = null for ALL jobs
    
  Any worker can claim them:
    getNextJobForWorker(workerId) returns both:
    - Jobs assigned to this worker (none)
    - Unassigned jobs (all of them)
    
  ✅ WORKS EXACTLY AS BEFORE

NEW CAMPAIGN (with this change):
  Request: {name, config, assignedWorkerIds}
  
  Result:
    assignedWorkerId = specific worker for each job
    
  Only that worker claims them:
    getNextJobForWorker(workerId) returns:
    - Jobs assigned to this worker
    - Plus any unassigned jobs
    
  ✅ NEW CAPABILITY WITHOUT BREAKING OLD BEHAVIOR
```

---

## Environment Variables for Worker ID

```
Priority Order:
1. WORKER_ID environment variable
   WORKER_ID=worker-5
   → workerId = "worker-5"

2. PM2 NODE_APP_INSTANCE
   pm2 start app.js -i max
   → NODE_APP_INSTANCE = 0,1,2,...
   → workerId = "worker-0", "worker-1", etc.

3. Thread Index (Fallback)
   → workerId = "worker-0" for thread 0
   → workerId = "worker-1" for thread 1
   → etc.
```

---

## State Transitions

```
┌──────────────┐
│   PENDING    │  assignedWorkerId: null
│              │  assignedAt: null
└────────┬─────┘
         │
         │ markJobActive(jobId, "worker-0")
         ▼
┌──────────────────────────────┐
│        ACTIVE                │
│                              │
│  assignedWorkerId: worker-0  │
│  assignedAt: 2026-01-20...   │  ◄─ TIMESTAMP RECORDED
└────────┬───────────┬─────────┘
         │           │
         │           │ markJobFailed()
         │           ▼
         │        ┌──────────┐
         │        │  FAILED  │
         │        └──────────┘
         │
         │ markJobCompleted()
         ▼
    ┌──────────────┐
    │  COMPLETED   │
    └──────────────┘
```

---

## Real-World Scenario

```
YOUR SETUP:
  15 workers deployed in AWS
  Each needs different configuration/smart link

BEFORE THIS IMPLEMENTATION:
  - All workers claim jobs randomly
  - Can't control which worker processes which job
  - Difficult to assign unique configs per worker

AFTER THIS IMPLEMENTATION:
  Create campaign: {name, config, assignedWorkerIds: ["worker-5"]}
    ↓
  1000 jobs created all with assignedWorkerId: \"worker-5\"
    ↓
  Only worker-5 claims these jobs
    ↓
  worker-5 loads its unique config (future: from WorkerConfig table)
    ↓
  worker-5 uses its specific smart link
    ↓
  Different results from other workers!
```

---

**This system gives you full control over worker assignment while maintaining backward compatibility!** ✨
