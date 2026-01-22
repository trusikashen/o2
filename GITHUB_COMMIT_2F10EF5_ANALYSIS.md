# Analysis of GitHub Commit 2f10ef5 - Worker Assignment System

**Repository:** https://github.com/arajinverjin6-jpg/o2  
**Commit:** 2f10ef5cfeb1be6fc57fb662fa7c383069160a40  
**Date Analyzed:** January 22, 2026

---

## Executive Summary

Commit 2f10ef5 contains the **original working implementation** of the worker assignment system. The key finding is:

**Field Name Used: `assignedWorkerId`** (when storing jobs in DynamoDB)

This commit shows how jobs are created, how workers are assigned, and what fields are used throughout the system.

---

## Key Files Analyzed

1. **`src/app/admin/workers/page.tsx`** - Admin UI for managing per-worker configurations (550 lines)
2. **`src/lib/adsterra/create-jobs.ts`** - Job creation logic with worker distribution (342 lines)
3. **`src/queue/dynamodb-queue.ts`** - Queue management and worker task pickup (564 lines)
4. **`src/app/admin/workers/page.tsx`** - Worker configuration admin interface

---

## 1. How Jobs/Tasks Are Created

### Location: `src/lib/adsterra/create-jobs.ts`

#### Job Creation Loop
```typescript
// Lines 202-250: Main job creation loop
for (let botIndex = 0; botIndex < actualTotalBots && jobCount < jobsToCreate; botIndex++) {
  const botId = `bot-${String(botIndex).padStart(5, '0')}`;
  
  // Calculate sessions for this bot
  const sessionsForThisBot = actualSessionsPerBot + (botIndex < remainder ? 1 : 0);
  
  for (let sessionNum = 1; sessionNum <= sessionsForThisBot && jobCount < jobsToCreate; sessionNum++) {
    let scheduledTime: Date;
    
    if (pacingMode === 'fast') {
      // Fast mode: start immediately
      scheduledTime = new Date(nowMs);
    } else {
      // Human mode: spread over configured window with multiple layers of jitter
      // ... jitter calculation ...
    }
    
    const jobId = `${run.id}-${botId}-session-${sessionNum}`;
    
    // Push job to array
    jobs.push({
      id: jobId,
      botId,
      sessionNumber: sessionNum,
      runId: run.id,
      scheduledTime,
      status: 'pending',
      assignedWorkerId,  // ← WORKER ASSIGNMENT FIELD
      warmUpSites,
      referrer,
      sessionSeed,
      ctrEnabled,
      swipeCount,
    });
    
    jobCount++;
  }
}
```

### Worker Assignment Logic
```typescript
// Lines 190-195: Round-robin worker distribution
const assignedWorkerIds = run.assignedWorkerIds || [];

// ... in job loop:
const assignedWorkerId = 
  assignedWorkerIds.length > 0 
    ? assignedWorkerIds[jobCount % assignedWorkerIds.length]
    : undefined;
```

**Key Points:**
- If `assignedWorkerIds` is specified in the run, jobs are distributed **round-robin**
- If not specified, `assignedWorkerId` is `undefined` (unassigned - any worker can claim)
- Each job gets `assignedWorkerId` field set

---

## 2. How Worker IDs Are Assigned to Tasks

### Worker Assignment at Job Creation Time

```typescript
// src/lib/adsterra/create-jobs.ts, Line 190-195
const assignedWorkerIds = run.assignedWorkerIds || [];

// ... then in loop (Line 171-174):
const assignedWorkerId = 
  assignedWorkerIds.length > 0 
    ? assignedWorkerIds[jobCount % assignedWorkerIds.length]  // ← Round-robin distribution
    : undefined;  // ← Unassigned if no workers specified
```

### Claiming Jobs by Worker

```typescript
// src/queue/dynamodb-queue.ts - getNextJobForWorker() function
// Lines ~230-260

export async function getNextJobForWorker(
  workerId: string,
  ignoreScheduledTime = false
): Promise<SessionJob | null> {
  // Query for pending jobs
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :status',
      ExpressionAttributeValues: {
        ':status': 'STATUS#pending',
      },
      Limit: 50, // Get batch of pending jobs
      ScanIndexForward: true, // Oldest first
    })
  );

  // Filter for jobs assigned to this worker (or unassigned)
  const item = result.Items.find(
    (item) => {
      // If job is assigned to this worker, return it
      if (item.assignedWorkerId === workerId) return true;
      // If job is unassigned, return it (backward compatibility)
      if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
      // Don't return jobs assigned to other workers
      return false;
    }
  );
  
  if (!item) return null;
  
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

## 3. Fields Stored When Creating Tasks

### In Database (DynamoDB - `src/lib/adsterra/create-jobs.ts`)

```typescript
// Lines 306-328: What gets stored in DynamoDB
const item: any = {
  PK: `JOB#${job.id}`,
  SK: 'META',
  jobId: job.id,
  botId: job.botId,
  sessionNumber: job.sessionNumber,
  runId: job.runId,
  scheduledTime: job.scheduledTime.toISOString(),
  status: job.status || 'pending',
  createdAt: nowISO,
  updatedAt: nowISO,
  // GSI for querying by status and scheduled time
  GSI1PK: `STATUS#${job.status || 'pending'}`,
  GSI1SK: job.scheduledTime.toISOString(),
  // GSI for querying by run
  GSI2PK: `RUN#${job.runId}`,
  GSI2SK: job.scheduledTime.toISOString(),
  // Worker assignment
  assignedWorkerId: job.assignedWorkerId || null,  // ← FIELD NAME
  assignedAt: null, // Will be set when worker claims
  // Realistic session fields
  warmUpSites: job.warmUpSites || [],
  referrer: job.referrer || '',
  sessionSeed: job.sessionSeed || '',
  ctrEnabled: job.ctrEnabled || false,
  swipeCount: job.swipeCount || 10,
};

// Include distribution if present
if (job.distribution) {
  item.distribution = job.distribution;
}
```

### Key Fields for Worker Assignment

| Field | Type | Value | Purpose |
|-------|------|-------|---------|
| `assignedWorkerId` | string \| null | "worker-0", "worker-1", etc. or null | Specifies which worker should process this job |
| `assignedAt` | ISO string \| null | null initially, set when worker claims | Timestamp when job was assigned to worker |

---

## 4. Smart Link URL Usage

### In Admin UI (`src/app/admin/workers/page.tsx`)

```typescript
// Lines 193-203: Smart Link URL field in worker configuration form
<div>
  <label className="block text-sm font-medium text-slate-300 mb-2">
    Smart Link URL *
  </label>
  <input
    type="url"
    placeholder="https://example.adsterra.com/..."
    value={formData.adsterraUrl || ''}
    onChange={(e) => setFormData(prev => ({ ...prev, adsterraUrl: e.target.value }))}
    required
    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
  />
  <p className="text-sm text-slate-400 mt-1">Unique smart link for this worker</p>
</div>
```

### Worker Configuration Type

```typescript
// From WorkerConfig interface
interface WorkerConfig {
  workerId: string;        // "worker-0", "worker-1", etc.
  adsterraUrl: string;     // Smart link URL - THE KEY FIELD
  browserHeadless?: boolean;
  minScrollWait?: number;  // ms
  maxScrollWait?: number;  // ms
  minAdWait?: number;      // ms
  maxAdWait?: number;      // ms
  pacingMode?: 'human' | 'fast';
  pacingHours?: number;
  distribution?: {
    countries: Record<string, number>;
    devices: Record<string, number>;
    browsers: Record<string, number>;
  };
  createdAt: string;
  updatedAt: string;
}
```

**Smart Link Storage:**
- Each worker has **individual smart link URL** stored in per-worker configuration
- Field name: `adsterraUrl` in WorkerConfig
- Used when worker processes a job assigned to them
- Different smart links per worker for tracking/attribution purposes

---

## 5. Worker Assignment Logic

### Run Creation with Worker Assignment

```typescript
// From src/app/adsterra/page.tsx - Frontend campaign creation
const response = await fetch('/api/adsterra/runs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Campaign Name',
    config: { /* ... */ },
    assignedWorkerIds: ['worker-0', 'worker-1', 'worker-2']  // ← Optional
  })
});
```

### Job Distribution When Workers Specified

```typescript
// From src/lib/adsterra/create-jobs.ts, Lines 259-264
// If assignedWorkerIds are specified, distribute jobs round-robin across workers
// Otherwise, leave unassigned so any worker can claim them

const assignedWorkerId =
  assignedWorkerIds.length > 0
    ? assignedWorkerIds[jobCount % assignedWorkerIds.length]  // Round-robin: job 0→worker-0, job 1→worker-1, job 2→worker-0, etc.
    : undefined;
```

### Worker Pickup Logic

When a worker starts (e.g., `npm run worker`):

1. Worker generates its ID: `WORKER_ID` from env or PM2 instance
2. Calls `getNextJobForWorker(workerId)`
3. Function queries DynamoDB GSI1 for all pending jobs
4. Filters jobs where:
   - `assignedWorkerId === workerId` (assigned to this worker), OR
   - `assignedWorkerId === null` (unassigned, available to any worker)
5. Returns first matching job (oldest scheduledTime)
6. Worker claims job via `markJobActive(jobId, workerId)`

---

## 6. Complete Job Data Flow

### Campaign Creation (Frontend)
```
User selects workers: [worker-0, worker-2, worker-5]
            ↓
POST /api/adsterra/runs {
  name: "Campaign X",
  config: { /* ... */ },
  assignedWorkerIds: ['worker-0', 'worker-2', 'worker-5']
}
```

### Job Creation (Backend - createJobsForRun)
```
For each bot (bot-00000 to bot-00099):
  For each session per bot:
    jobId = run-id-bot-xxxxx-session-1
    assignedWorkerId = assignedWorkerIds[jobCount % 3]  // Round-robin
    
    Store in DynamoDB:
    {
      PK: "JOB#run-id-bot-xxxxx-session-1",
      SK: "META",
      assignedWorkerId: "worker-0",     // Example for job 0
      assignedAt: null,
      status: "pending",
      ... other fields ...
    }
```

### Worker Task Pickup
```
worker-0 starts running
  ↓
Call getNextJobForWorker("worker-0")
  ↓
Query: SELECT * FROM AdsterraJobs WHERE status="pending" LIMIT 50
  ↓
Filter: Find first where (assignedWorkerId="worker-0" OR assignedWorkerId=null)
  ↓
Returns: Job { id, botId, sessionNumber, runId, scheduledTime, ... }
  ↓
Call markJobActive(jobId, "worker-0")
  ↓
Update DynamoDB:
  status: "pending" → "active"
  assignedWorkerId: "worker-0"  (confirmed)
  assignedAt: now
  ↓
Process job (visit URL, interact, complete)
```

---

## Key Differences from Current Version

### In Commit 2f10ef5 (Working)

**Field Used:** `assignedWorkerId` ✓

```typescript
// Creation
assignedWorkerId: job.assignedWorkerId || null

// Querying
if (item.assignedWorkerId === workerId) return true;
if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
```

### In Current Version (When broken)

**Field Used:** `assignedWorkerId` (same) but different matching logic

```typescript
// Still creation
assignedWorkerId: job.assignedWorkerId || null

// But querying would fail if database had old field name
if (item.assignedWorkerId === workerId) return true;  // ✗ Doesn't check for assignedWorker
```

**The Issue:** If old jobs in database used field name `assignedWorker` instead of `assignedWorkerId`, they would never match.

---

## Complete Code Reference

### Exact Query for Getting Worker's Next Job

File: `src/queue/dynamodb-queue.ts`, Function: `getNextJobForWorker()`

```typescript
export async function getNextJobForWorker(
  workerId: string,
  ignoreScheduledTime = false
): Promise<SessionJob | null> {
  const now = new Date().toISOString();

  let result;
  if (ignoreScheduledTime) {
    // Get any pending job for this worker, regardless of scheduled time
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
        },
        Limit: 50,
        ScanIndexForward: true, // Oldest first
      })
    );
  } else {
    // Only get jobs scheduled for now or earlier
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status AND GSI1SK <= :scheduledTime',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
          ':scheduledTime': now,
        },
        Limit: 50,
        ScanIndexForward: true,
      })
    );
  }

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  // Filter for jobs assigned to this worker or unassigned
  // Note: We do NOT return jobs assigned to OTHER workers
  const item = result.Items.find(
    (item) => {
      // If job is assigned to this worker, return it
      if (item.assignedWorkerId === workerId) return true;
      // If job is unassigned, return it (backward compatibility)
      if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
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

### Admin UI Worker Configuration

File: `src/app/admin/workers/page.tsx`

**Main Page Component:**
```typescript
export default function WorkersAdminPage() {
  const [configs, setConfigs] = useState<Record<string, WorkerConfig>>({});
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<string>(WORKER_IDS[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    const response = await fetch('/api/admin/workers');
    const data = await response.json();
    
    const configMap: Record<string, WorkerConfig> = {};
    data.forEach((config: WorkerConfig) => {
      configMap[config.workerId] = config;
    });
    setConfigs(configMap);
  }

  async function saveConfig(workerId: string, updates: Partial<WorkerConfig>) {
    const response = await fetch(`/api/admin/workers/${workerId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    // ... handle response ...
  }

  // UI: Sidebar with 15 workers + form
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Worker List */}
      <div className="lg:col-span-1">
        <h2 className="text-xl font-bold text-white mb-4">Workers</h2>
        {WORKER_IDS.map(id => (
          <button onClick={() => setSelectedWorker(id)}>
            <span className={configs[id] ? '✅ ' : '⭕ '} />
            {id}
          </button>
        ))}
      </div>

      {/* Config Form */}
      <div className="lg:col-span-3">
        <WorkerConfigForm
          workerId={selectedWorker}
          config={configs[selectedWorker]}
          onSave={saveConfig}
        />
      </div>
    </div>
  );
}
```

**Worker Config Form:**
```typescript
function WorkerConfigForm({
  workerId,
  config,
  onSave,
  onDelete,
  saving
}: WorkerConfigFormProps) {
  const [formData, setFormData] = useState<Partial<WorkerConfig>>(config || {});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(workerId, formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Smart Link URL */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Smart Link URL *
        </label>
        <input
          type="url"
          placeholder="https://example.adsterra.com/..."
          value={formData.adsterraUrl || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, adsterraUrl: e.target.value }))}
          required
        />
        <p className="text-sm text-slate-400 mt-1">Unique smart link for this worker</p>
      </div>

      {/* Browser Settings */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          <input
            type="checkbox"
            checked={formData.browserHeadless ?? true}
            onChange={(e) => setFormData(prev => ({ ...prev, browserHeadless: e.target.checked }))}
          />
          Headless Browser
        </label>
      </div>

      {/* Scroll Wait Times */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Scroll Wait Times (ms)</h3>
        <div className="grid grid-cols-2 gap-4">
          <input
            type="number"
            placeholder="2000"
            value={formData.minScrollWait || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, minScrollWait: parseInt(e.target.value, 10) }))}
          />
          <input
            type="number"
            placeholder="5000"
            value={formData.maxScrollWait || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, maxScrollWait: parseInt(e.target.value, 10) }))}
          />
        </div>
      </div>

      {/* Ad Wait Times */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Ad Wait Times (ms)</h3>
        <div className="grid grid-cols-2 gap-4">
          <input
            type="number"
            placeholder="8000"
            value={formData.minAdWait || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, minAdWait: parseInt(e.target.value, 10) }))}
          />
          <input
            type="number"
            placeholder="15000"
            value={formData.maxAdWait || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, maxAdWait: parseInt(e.target.value, 10) }))}
          />
        </div>
      </div>

      {/* Submit Button */}
      <button type="submit" disabled={saving || !formData.adsterraUrl}>
        {saving ? '💾 Saving...' : '💾 Save Configuration'}
      </button>
    </form>
  );
}
```

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Field Name for Worker Assignment** | `assignedWorkerId` |
| **Job Creation Method** | Round-robin distribution across specified workers |
| **Unassigned Jobs** | `assignedWorkerId: undefined` (any worker can claim) |
| **Job Query** | `getNextJobForWorker(workerId)` queries GSI1 for STATUS#pending |
| **Field Check Logic** | Check if `item.assignedWorkerId === workerId` or `item.assignedWorkerId === null` |
| **Worker Config Field** | `adsterraUrl` (smart link URL per worker) |
| **Admin Interface** | `/admin/workers` page with 15 worker configuration forms |
| **Config Storage** | DynamoDB per-worker configuration table |
| **Pacing Modes** | "fast" (immediate) or "human" (spread over configured hours with jitter) |
| **Distribution Supported** | Countries, devices, browsers - per campaign |

---

## Comparison with Current Version

**Commit 2f10ef5 Status:** ✅ **WORKING**
- Field name: `assignedWorkerId` (consistent throughout)
- Worker query logic: Checks for `assignedWorkerId` match OR null (unassigned)
- Job creation: Stores `assignedWorkerId` field correctly
- Round-robin: Distributes jobs properly across assigned workers

**Current Version Issue:** ⚠️ **May have field name mismatch**
- If database records still have `assignedWorker` (old field name)
- But code queries `assignedWorkerId` (new field name)
- Workers cannot find their jobs → stay idle

**Fix:** Check both field names for backward compatibility
```typescript
const assigned = item.assignedWorkerId || item.assignedWorker;
if (assigned === workerId || !assigned) return true;
```
