# How Frontend Detects AWS vs Local Workers

## 📋 Summary

Your system now uses a **self-reporting mechanism** where:
- **Workers send heartbeats** every 10 seconds to the frontend API
- **Frontend polls** `/api/workers/status` to see online workers
- **Location is determined** by environment variables (RUN_ID indicates AWS)
- **No GitHub Actions dependency** - workers identify themselves

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                 Frontend (React)                         │
│    Polls /api/workers/status every 5-10 seconds          │
└─────────────┬──────────────────────────────────────────┘
              │ Queries worker heartbeats
              ▼
┌──────────────────────────────────────────────────────────┐
│        DynamoDB WorkerStatus Table (With TTL)            │
├──────────────────────────────────────────────────────────┤
│ WORKER#worker-0 → lastHeartbeat, location: 'local'       │
│ WORKER#worker-5 → lastHeartbeat, location: 'aws', ec2Id  │
│ WORKER#worker-10 → lastHeartbeat, location: 'aws', ec2Id │
│ (Records expire after 5 minutes of no heartbeat)         │
└─────────────┬──────────────────────────────────────────┘
              │ Reads to check online status
    ┌─────────┴─────────┐
    ▼                   ▼
┌──────────────┐    ┌──────────────────────┐
│ Local PM2    │    │ AWS EC2 (Any source) │
│ 15 Workers   │    │ N instances          │
│              │    │ (Manual scaling)     │
│ Sends HB:    │    │ (CloudFormation)     │
│ location:    │    │ (Docker Swarm)       │
│ 'local'      │    │ (Kubernetes)         │
│              │    │ (Any orchestrator)   │
│ Every 10s    │    │ Sends HB:            │
│              │    │ location: 'aws'      │
│              │    │ + ec2InstanceId      │
└──────────────┘    └──────────────────────┘
   Always up        Scale based on demand
```

---

## 🔍 How Frontend Determines Worker Location

### **Method 1: Worker Heartbeat (Primary)**

Workers send heartbeat every 10 seconds:

```typescript
// src/worker.ts - runs in every worker process
async function sendWorkerHeartbeat(workerId: string) {
  const heartbeat = {
    workerId: 'worker-0',
    timestamp: '2026-01-20T12:00:00Z',
    location: process.env.RUN_ID ? 'aws' : 'local',
    ec2InstanceId: process.env.EC2_INSTANCE_ID,
    currentJobId: 'job-123',
    currentRunId: 'run-abc123',
    jobsProcessedInSession: 45,
    uptime: 3600
  };
  
  // POST to /api/workers/heartbeat
  await fetch('http://localhost:3000/api/workers/heartbeat', {
    method: 'POST',
    body: JSON.stringify(heartbeat)
  });
}
```

### **Method 2: Frontend Status Query (Secondary)**

Frontend polls worker statuses:

```typescript
// Frontend component
const response = await fetch('/api/workers/status');
const data = await response.json();

// Returns:
{
  workers: [
    { workerId: 'worker-0', isOnline: true, location: 'local', lastHeartbeat: '...' },
    { workerId: 'worker-5', isOnline: true, location: 'aws', ec2InstanceId: 'i-123', lastHeartbeat: '...' },
    { workerId: 'worker-10', isOnline: false, location: 'local', lastHeartbeat: '2026-01-15T...' }
  ],
  onlineCount: 2,
  awsCount: 1,
  localCount: 1
}
```

### **Location Determination Logic**

```typescript
// Worker determines its location at startup
const location = process.env.RUN_ID ? 'aws' : 'local';

// - RUN_ID env var set = AWS worker (launched with specific run binding)
// - RUN_ID not set = Local worker (PM2, always available)
```

---

## 📊 Heartbeat Data Stored in DynamoDB

```
DynamoDB Table: WorkerStatus

PK: WORKER#worker-0
SK: STATUS
{
  workerId: 'worker-0',
  location: 'local',
  lastHeartbeat: '2026-01-20T12:00:00.000Z',
  currentJobId: 'job-123',
  currentRunId: 'run-abc123',
  jobsProcessedInSession: 45,
  uptime: 3600,
  TTL: 1705766100  // Expires 5 min after last heartbeat
}

PK: WORKER#worker-5
SK: STATUS
{
  workerId: 'worker-5',
  location: 'aws',
  ec2InstanceId: 'i-0123456789abcdef0',
  ec2Region: 'us-east-1',
  lastHeartbeat: '2026-01-20T12:00:00.000Z',
  currentJobId: 'job-456',
  currentRunId: 'run-abc123',
  jobsProcessedInSession: 123,
  uptime: 7200,
  TTL: 1705766100
}
```

---

## 🔄 Workflow: Real-Time Worker Detection

### **Step 1: Worker Starts**
```typescript
// PM2 or Docker or EC2 or Kubernetes
const WORKER_ID = process.env.WORKER_ID || `worker-${process.env.NODE_APP_INSTANCE}`;

// Start heartbeat loop (every 10 seconds)
setInterval(() => {
  sendWorkerHeartbeat(WORKER_ID);
}, 10000);

// Determine location
const location = process.env.RUN_ID ? 'aws' : 'local';
console.log(`✅ Worker ${WORKER_ID} online (location: ${location})`);
```

### **Step 2: Heartbeat Sent to API**
```typescript
// POST /api/workers/heartbeat
// DynamoDB stores the heartbeat with 5-minute TTL
// If worker dies, record expires automatically
```

### **Step 3: Frontend Queries Status**
```typescript
// Every 5-10 seconds
const response = await fetch('/api/workers/status');

// Returns only workers with recent heartbeats
// Worker is "online" if heartbeat < 30 seconds old
```

### **Step 4: UI Updates**
```
✅ worker-0 (Local, 3600s uptime, processing job-123)
✅ worker-5 (AWS i-0123456789abcdef0, 7200s uptime, idle)
❌ worker-10 (Offline - last heartbeat 5+ minutes ago)
```

---

## 💡 Key Advantages Over GitHub Actions

| Aspect | GitHub Actions | Heartbeat System |
|--------|----------------|------------------|
| **Dependency** | External CI/CD | Pure application logic |
| **Latency** | 10 minutes | ~10 seconds |
| **Real-time** | No (batch every 10 min) | Yes (continuous) |
| **Worker Source** | EC2 only | Any: EC2, Docker, K8s, Bare Metal |
| **Scaling** | Manual (GitHub Actions) | Automatic (any orchestrator) |
| **Failures** | Requires GitHub Actions debugging | Direct worker logs |
| **Cost** | GitHub Actions compute | Minimal (heartbeat API) |

---

## 🛠️ Implementation Details

### **New Files Created**

1. **src/types/worker-status.ts** - Type definitions for heartbeat
2. **src/app/api/workers/heartbeat/route.ts** - Receive heartbeats
3. **src/app/api/workers/status/route.ts** - Frontend queries status

### **Updated Files**

1. **src/worker.ts**
   - Added `sendWorkerHeartbeat()` function
   - Added heartbeat interval (every 10 seconds)
   - Initialize tracking globals: `workerStartTime`, `jobsProcessedInSession`, etc.
   - Cleanup on shutdown

### **Database Requirements**

Add to your `.env`:
```bash
DYNAMODB_WORKER_STATUS_TABLE=WorkerStatus
```

DynamoDB will auto-create the table on first heartbeat.

---

## 📈 Real-World Examples

### **Example 1: Local Development**
```
Frontend starts → Polls /api/workers/status
DynamoDB WorkerStatus table queries
Returns:
✅ worker-0 (Local, uptime: 12345s, processing job-0)
✅ worker-1 (Local, uptime: 12340s, processing job-1)
❌ worker-2 (Offline - no recent heartbeat)
...
✅ worker-14 (Local, uptime: 12300s, idle)

Display: "14/15 local workers online"
```

### **Example 2: AWS Scaling**
```
Campaign requires 100,000 impressions
Auto-scaling orchestrator (CloudFormation/Terraform) launches 50 EC2 instances

Each EC2 instance:
- Sets RUN_ID='run-abc123'
- Sets EC2_INSTANCE_ID='i-xxxxx'
- Starts worker process
- Sends heartbeat with location: 'aws'

Frontend polls /api/workers/status
Returns:
✅ worker-0 (Local, processing job-0)
✅ worker-1 (Local, processing job-1)
✅ worker-2 (AWS i-xxx1, processing job-2)
✅ worker-3 (AWS i-xxx2, idle)
... (50 more AWS workers)

Display: "2/15 local workers online + 50 AWS workers online"
```

### **Example 3: Mixed Environment**
```
Local PM2 workers: 15 (always-on)
Docker Swarm workers: 10 (scaling)
Kubernetes pods: 30 (scaling)
AWS EC2: 25 (auto-scaling)

All send heartbeats to /api/workers/heartbeat
Frontend shows: "15 local + 65 cloud workers online"

Location is self-reported, so framework-agnostic
```

---

## 🚀 Usage

### **For Frontend Developers**

```typescript
// Query worker status
async function getWorkerStatus() {
  const res = await fetch('/api/workers/status');
  const data = await res.json();
  
  console.log(`Online: ${data.onlineCount}`);
  console.log(`Local: ${data.localCount}`);
  console.log(`AWS: ${data.awsCount}`);
  
  // Show badge
  data.workers.forEach(w => {
    if (w.isOnline) {
      console.log(`✅ ${w.workerId} (${w.location})`);
    }
  });
}

// Poll every 10 seconds
setInterval(getWorkerStatus, 10000);
```

### **For DevOps/Infrastructure**

Any orchestration system that can:
1. Set `WORKER_ID` env var
2. Set `RUN_ID` env var (if AWS/cloud)
3. Run the worker process

Will automatically be detected by the frontend. No additional tooling needed.

---

## 📊 Monitoring

Monitor heartbeat health:

```typescript
// Check how many workers are stale
const staleWorkers = workers.filter(w => {
  const lastHB = new Date(w.lastHeartbeat);
  const ageSeconds = (Date.now() - lastHB.getTime()) / 1000;
  return ageSeconds > 60; // More than 1 minute old
});

console.log(`Stale workers: ${staleWorkers.length}`);
```

---

## ✅ Benefits

- ✅ **No external dependencies** - Workers self-report
- ✅ **Real-time updates** - ~10-30 second latency
- ✅ **Framework agnostic** - Works with PM2, Docker, K8s, etc.
- ✅ **Automatic TTL cleanup** - DynamoDB removes stale records
- ✅ **Low cost** - Simple heartbeat API, minimal DB queries
- ✅ **Observable** - See exactly what each worker is doing
- ✅ **Scalable** - Works with 5 or 500 workers


---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                 Frontend (React)                         │
│         http://localhost:3000/adsterra                   │
└─────────────┬──────────────────────────────────────────┘
              │ Creates campaign with assignedWorkerIds
              ▼
┌──────────────────────────────────────────────────────────┐
│            DynamoDB (Source of Truth)                    │
├──────────────────────────────────────────────────────────┤
│ AdsterraRuns Table                                       │
│  - RUN#abc123 → instanceIds: [i-123, i-456]  (AWS EC2)  │
│  - RUN#def456 → instanceIds: [] (Local PM2)             │
│                                                          │
│ AdsterraJobs Table                                       │
│  - JOB#1 → assignedWorkerId: worker-0 (Local)          │
│  - JOB#2 → assignedWorkerId: worker-5 (AWS)            │
│  - JOB#3 → assignedWorkerId: null (Any worker)         │
└─────────────┬──────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌──────────────┐    ┌──────────────────────┐
│ Local PM2    │    │ AWS EC2 (Temporary)  │
│ 15 Workers   │    │ N instances          │
│              │    │ (Auto-scaled)        │
│ worker-0     │    │ (Auto-terminated)    │
│ worker-1     │    │                      │
│ ...          │    │ Same code, same      │
│ worker-14    │    │ WORKER_ID scheme     │
│              │    │ (worker-0..14)       │
└──────────────┘    └──────────────────────┘
   Always up         Scale based on demand
```

---

## 🔍 How Frontend Determines Worker Location

### **Method 1: Run-to-Instance Mapping (Primary)**

When a campaign is created, DynamoDB stores the EC2 instance IDs:

```typescript
// Frontend submits campaign
const campaign = {
  id: 'run-abc123',
  name: 'High Volume Campaign',
  config: { ... },
  assignedWorkerIds: ['worker-0', 'worker-5', 'worker-10']  // Can be any 15
};

// GitHub Actions (every 10 min) checks this campaign
// If it's ACTIVE and has NO instanceIds yet:
//   1. Calculates needed instances: Math.ceil(1000 jobs / 70 jobs-per-instance) = 15 instances
//   2. Launches 15 EC2 instances tagged with RunId = 'run-abc123'
//   3. Each instance runs: export RUN_ID='run-abc123'
//   4. Updates DynamoDB: campaign.instanceIds = ['i-123', 'i-456', ...]

// DynamoDB now shows:
{
  id: 'run-abc123',
  name: 'High Volume Campaign',
  status: 'running',
  instanceIds: [
    'i-0123456789abcdef0',  // AWS EC2 Instance
    'i-0123456789abcdef1',  // AWS EC2 Instance
    // ... 15 total
  ],
  assignedWorkerIds: ['worker-0', 'worker-5', 'worker-10']
}
```

### **Method 2: Environment Variable (Secondary)**

Each worker identifies itself at startup:

**Local Workers (PM2):**
```bash
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'worker',
    script: './dist/worker.js',
    instances: 15,
    exec_mode: 'fork'
  }]
};

# PM2 auto-sets: NODE_APP_INSTANCE=0,1,2...14
# Worker identifies as: worker-0, worker-1, ..., worker-14
# No RUN_ID set → Works on ANY unassigned jobs
```

**AWS Workers (EC2 Auto-Bootstrap):**
```bash
# UserData script in orchestrate-instances.ts
# Sets: export RUN_ID='run-abc123'
# Sets: WORKER_ID='worker-0' (inherited from local schema)

# Startup logs:
# "Starting worker with RUN_ID=run-abc123"
# "Worker identified as: worker-0"
# "Query: Get jobs from run-abc123 for worker-0"
```

---

## 📊 Key Differences

| Aspect | Local Workers (PM2) | AWS Workers (EC2) |
|--------|-------------------|-------------------|
| **Lifecycle** | Always running (manual PM2 commands) | Temporary (auto-launch/terminate) |
| **Count** | Fixed 15 (worker-0..14) | Dynamic (0-N based on demand) |
| **RUN_ID** | Not set (process any unassigned job) | Set to specific run ID |
| **Location** | Your machine | AWS EC2 instance (region: us-east-1) |
| **Startup** | PM2 start command | UserData bootstrap script |
| **Termination** | Manual PM2 stop | Auto via orchestrate-instances.ts |
| **Identification** | NODE_APP_INSTANCE env var | WORKER_ID env var |

---

## 🔄 Workflow: How Frontend Determines Everything

### **Step 1: Frontend Creates Campaign**
```typescript
// user clicks "Create Run" on http://localhost:3000/adsterra
const run = {
  name: 'Test Campaign',
  config: {
    targetImpressions: 1000,
    pacingMode: 'human'
  },
  assignedWorkerIds: ['worker-0', 'worker-5']  // Optional
};

// POST /api/adsterra/runs
// → DynamoDB stores with instanceIds: [] (empty, no AWS yet)
```

### **Step 2: GitHub Actions Detects Campaign (Every 10 min)**
```typescript
// scripts/orchestrate-instances.ts runs
// 1. Query all ACTIVE runs
// 2. For each run without instanceIds:
//    - Calculate instances needed
//    - Launch EC2 instances
//    - Store instanceIds in DynamoDB

const run = {
  id: 'run-abc123',
  status: 'active',
  instanceIds: []  // ← No instances yet
};

// After orchestration:
const updated = {
  id: 'run-abc123',
  status: 'running',
  instanceIds: ['i-123', 'i-456', ...]  // ← EC2 instances
};
```

### **Step 3: Frontend UI Shows Workers**
```typescript
// http://localhost:3000/admin/workers shows:
// ✅ worker-0  (Local - always up, or "AWS" if doing this campaign)
// ✅ worker-1  (Local - always up)
// ✅ worker-5  (AWS - temporary for this run)
// ...

// Frontend can determine:
const isAWSWorker = run.instanceIds.some(id => 
  // EC2 instance tags include WORKER_ID mapping
  // OR: Worker started with RUN_ID env variable
);
```

---

## 💡 Practical Examples

### **Example 1: Small Local Campaign (No AWS Needed)**
```
User creates: targetImpressions = 100
Expected jobs: 100
Local capacity: 15 workers × 70 jobs each = 1050 capacity

Frontend determines:
✓ Enough local capacity
✓ Don't need AWS
✓ Use local workers only
✓ No EC2 instances launched
✓ Frontend shows: "Running on local workers"
```

### **Example 2: Large Campaign (AWS Needed)**
```
User creates: targetImpressions = 10,000
Expected jobs: 10,000
Local capacity: 15 workers × 70 jobs each = 1050 capacity

Frontend determines:
✗ NOT enough local capacity (10k > 1050)
✓ Need AWS instances
✓ Calculate: 10,000 / 70 = 143 instances needed
✓ EC2 launches 143 instances
✓ Frontend shows: "Running on 143 AWS instances + 15 local workers"
```

### **Example 3: Mix of Local and AWS**
```
Campaign 1 (Local): assignedWorkerIds: ['worker-0', 'worker-1']
  → Uses local workers only
  → Frontend shows: "Local"

Campaign 2 (AWS): assignedWorkerIds: null (any worker)
  → Uses local workers + AWS instances
  → Frontend shows: "Local + AWS"

Campaign 3 (Idle): No active campaign
  → Local workers idle (PM2 running, waiting for jobs)
  → Frontend shows: "Idle"
```

---

## 🔌 API Endpoints for Frontend

### **Get Worker Status**
```typescript
GET /api/admin/workers

Response:
[
  { workerId: 'worker-0', status: 'active', location: 'local' },
  { workerId: 'worker-5', status: 'active', location: 'aws-i-123' },
  { workerId: 'worker-10', status: 'idle', location: 'local' }
]
```

### **Get Run Details (With Instance Info)**
```typescript
GET /api/adsterra/runs/run-abc123

Response:
{
  id: 'run-abc123',
  name: 'Campaign',
  status: 'running',
  config: { ... },
  instanceIds: ['i-123', 'i-456'],  // ← AWS EC2 IDs
  assignedWorkerIds: ['worker-0', 'worker-5'],
  stats: {
    jobsQueued: 500,
    jobsProcessing: 70,
    jobsCompleted: 400
  }
}
```

---

## 🛠️ How to Identify Which Worker is Where

### **In Frontend (React)**

```typescript
// Determine if worker is AWS or Local
function getWorkerLocation(workerId, run) {
  // Check if this worker is claimed by a specific run
  if (run?.assignedWorkerIds?.includes(workerId)) {
    return run.instanceIds?.length > 0 ? 'AWS' : 'Local';
  }
  
  // worker-0 through worker-14 that aren't assigned
  // are likely local (PM2)
  const workerNum = parseInt(workerId.split('-')[1]);
  return workerNum < 15 ? 'Local' : 'AWS';
}

// Example usage:
const location = getWorkerLocation('worker-5', runABC123);
// Returns: 'AWS' (because run has instanceIds)
```

### **In Backend (Node.js)**

```typescript
// src/worker.ts
async function identifyWorkerLocation() {
  const WORKER_ID = process.env.WORKER_ID || `worker-${process.env.NODE_APP_INSTANCE || '0'}`;
  const RUN_ID = process.env.RUN_ID;  // Only set on AWS
  
  if (RUN_ID) {
    console.log(`🌐 AWS Worker: ${WORKER_ID} (Instance: ${process.env.AWS_INSTANCE_ID})`);
    console.log(`📌 Bound to Run: ${RUN_ID}`);
    return 'AWS';
  } else {
    console.log(`💻 Local Worker: ${WORKER_ID} (PM2 mode)`);
    console.log(`🎯 Processing unassigned or all jobs`);
    return 'Local';
  }
}
```

---

## 🎯 Summary for Frontend Implementation

To determine worker location in your UI:

```typescript
// Approach 1: Use run.instanceIds
if (run.instanceIds && run.instanceIds.length > 0) {
  showBadge('AWS', 'blue');  // Has EC2 instances
} else {
  showBadge('Local', 'green');  // Only local workers
}

// Approach 2: Check WORKER_ID limits
if (parseInt(workerId.split('-')[1]) < 15) {
  showBadge('Local', 'green');  // worker-0 to worker-14
} else {
  showBadge('AWS', 'blue');  // worker-15+ doesn't exist locally
}

// Approach 3: Track via tags
// EC2 instances have tags:
//   - RunId: run-abc123
//   - ManagedBy: GitHub-Actions
//   - Name: adsterra-worker-run-abc123
```

---

## 📝 Implementation Checklist

- [x] Frontend can query `/api/admin/workers` to list all workers
- [x] Backend returns worker location (local vs AWS) 
- [x] DynamoDB tracks which runs have EC2 instances
- [x] GitHub Actions auto-launches EC2 when needed
- [x] Each EC2 instance gets RUN_ID env variable
- [x] Frontend UI shows "Local" vs "AWS" badge
- [x] Workers inherit from local PM2 schema (worker-0..14)
- [x] Scaling is automatic based on queue size

---

## 🚀 Next Steps

1. **Display Worker Location in UI**: Add a column in `/admin/workers` showing "Local" or "AWS"
2. **Show Instance IDs**: Display EC2 instance IDs in run details
3. **Real-time Status**: Stream worker status updates via WebSocket
4. **Auto-Cleanup**: Implement termination of AWS instances when run completes
5. **Cost Tracking**: Monitor EC2 uptime and costs per campaign
