# Complete System Architecture - Phase 1 + Phase 2

## 🏗️ High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────┐         ┌─────────────────────────┐   │
│  │   /adsterra (Campaign)  │         │  /admin/workers (Config)│   │
│  ├─────────────────────────┤         ├─────────────────────────┤   │
│  │ • Create campaigns      │         │ • Configure 15 workers  │   │
│  │ • Select workers        │         │ • Set smart links       │   │
│  │ • Monitor progress      │         │ • Adjust timings        │   │
│  │ • View runs/jobs        │         │ • Save/delete configs   │   │
│  │ • Configure global      │         │ • Monitor status        │   │
│  │   campaign settings     │         │                         │   │
│  └─────────────────────────┘         └─────────────────────────┘   │
│           ↓ [Phase 1]                        ↓ [Phase 2]            │
└─────────────────────────────────────────────────────────────────────┘
                    ↓                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         API LAYER                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  POST /api/adsterra/runs                   [Phase 1]        │  │
│  │  - Create new campaign                                       │  │
│  │  - Accept config + worker assignment                         │  │
│  │  - Validate inputs                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  GET  /api/admin/workers                   [Phase 2]        │  │
│  │  - List all worker configs                                   │  │
│  │  - Return status for 15 workers                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  GET/PUT/DELETE /api/admin/workers/[id]/config [Phase 2]   │  │
│  │  - CRUD operations for worker configs                        │  │
│  │  - Validation of worker IDs                                  │  │
│  │  - Atomic DynamoDB updates                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  DynamoDB Helpers (src/lib/aws/adsterra-helpers.ts)         │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  AdsterraRuns Functions:                    [Phase 1]        │  │
│  │  • createAdsterraRun()                                       │  │
│  │  • getAdsterraRun()                                          │  │
│  │  • getAllAdsterraRuns()                                      │  │
│  │  • updateAdsterraRun()                                       │  │
│  │  • deleteAdsterraRun()                                       │  │
│  │                                                               │  │
│  │  WorkersConfig Functions:                   [Phase 2]        │  │
│  │  • createWorkerConfig()                                      │  │
│  │  • getWorkerConfig()                                         │  │
│  │  • getAllWorkerConfigs()                                     │  │
│  │  • updateWorkerConfig()                                      │  │
│  │  • deleteWorkerConfig()                                      │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Job Creation (src/lib/adsterra/create-jobs.ts)             │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  • Generate jobs from campaign config        [Phase 1]       │  │
│  │  • Round-robin assign to selected workers    [Phase 1]       │  │
│  │  • Store assignedWorkerId in each job        [Phase 1]       │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Worker Process (src/worker.ts)                              │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  • Claim jobs (worker-specific or any)       [Phase 1]       │  │
│  │  • Load run config from AdsterraRuns         [Phase 1]       │  │
│  │  • Load worker config from WorkersConfig     [Phase 2]       │  │
│  │  • Merge configs (worker > run > defaults)   [Phase 2]       │  │
│  │  • Execute session with merged config        [Phase 2]       │  │
│  │  • Mark job as completed/failed              [Phase 1]       │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      PERSISTENCE LAYER                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  DynamoDB Tables (AWS)                                       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  AdsterraRuns Table                         [Phase 1]        │  │
│  │  • PK: RUN#<runId>        | SK: META                         │  │
│  │  • Stores: id, config, status, stats, assignedWorkerIds      │  │
│  │  • Purpose: Track campaign runs                              │  │
│  │                                                               │  │
│  │  AdsterraJobs Table                         [Phase 1]        │  │
│  │  • PK: JOB#<jobId>        | SK: <timestamp>                  │  │
│  │  • Stores: jobId, runId, config, status, assignedWorkerId   │  │
│  │  • Purpose: Queue of work to process                         │  │
│  │                                                               │  │
│  │  WorkersConfig Table                        [Phase 2]        │  │
│  │  • PK: WORKER#worker-X    | SK: CONFIG                       │  │
│  │  • Stores: workerId, adsterraUrl, timings, browser settings  │  │
│  │  • Purpose: Per-worker configuration overrides               │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      EXECUTION LAYER                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  15 Worker Processes (AWS EC2 Instances)                     │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  Worker-0    Worker-1    Worker-2   ...    Worker-14         │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐        ┌────────┐       │  │
│  │  │ Claim  │  │ Claim  │  │ Claim  │  ...   │ Claim  │       │  │
│  │  │ Job    │  │ Job    │  │ Job    │        │ Job    │       │  │
│  │  ├────────┤  ├────────┤  ├────────┤        ├────────┤       │  │
│  │  │ Load   │  │ Load   │  │ Load   │  ...   │ Load   │       │  │
│  │  │ Config │  │ Config │  │ Config │        │ Config │       │  │
│  │  ├────────┤  ├────────┤  ├────────┤        ├────────┤       │  │
│  │  │ Exec   │  │ Exec   │  │ Exec   │  ...   │ Exec   │       │  │
│  │  │ Session│  │ Session│  │ Session│        │ Session│       │  │
│  │  └────────┘  └────────┘  └────────┘        └────────┘       │  │
│  │                                                               │  │
│  │  Each worker:                               [Phase 1+2]      │  │
│  │  • Claims jobs assigned to it (or unassigned)                │  │
│  │  • Loads run config (global campaign settings)               │  │
│  │  • Loads worker config (per-worker overrides) [Phase 2]      │  │
│  │  • Merges configs (worker > run > defaults)                  │  │
│  │  • Launches browser with merged config                       │  │
│  │  • Executes bot session                                      │  │
│  │  • Reports results to DynamoDB                               │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Browser & Bot Engine (Playwright)                           │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  • Navigate to website                      [Phase 1]        │  │
│  │  • Find and click smart link                [Phase 1]        │  │
│  │  • Apply per-worker settings:               [Phase 2]        │  │
│  │    - Use worker's smart link URL                             │  │
│  │    - Apply worker's timing values                            │  │
│  │    - Use worker's browser mode                               │  │
│  │  • Record session results                   [Phase 1]        │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## 🔄 Campaign Execution Flow

### Phase 1: Campaign Creation & Job Distribution

```
User creates campaign:
    ↓
POST /api/adsterra/runs
    ↓
  GlobalConfig created:
  - URL: "https://example.com/global"
  - minAdWait: 10000 ms
  - maxAdWait: 30000 ms
  - totalBots: 10000
  - assignedWorkerIds: [worker-0, worker-5, worker-12]
    ↓
Jobs generated in DynamoDB:
  Job 1: {assignedWorkerId: "worker-0", ...}
  Job 2: {assignedWorkerId: "worker-5", ...}
  Job 3: {assignedWorkerId: "worker-12", ...}
  Job 4: {assignedWorkerId: "worker-0", ...}  ← round-robin
  ...
    ↓
Jobs stored in AdsterraJobs table
```

### Phase 2: Per-Worker Configuration

```
Admin configures workers:
    ↓
PUT /api/admin/workers/worker-0/config
{
  "adsterraUrl": "https://example.com/worker-0-exclusive",
  "minAdWait": 8000,
  "maxAdWait": 20000
}
    ↓
Config stored in WorkersConfig table:
PK: WORKER#worker-0, SK: CONFIG → {...}
    ↓
PUT /api/admin/workers/worker-5/config
{
  "adsterraUrl": "https://example.com/worker-5-exclusive",
  "minAdWait": 12000,
  "maxAdWait": 25000
}
    ↓
Config stored in WorkersConfig table:
PK: WORKER#worker-5, SK: CONFIG → {...}
```

### Worker Processing (Phase 1 + Phase 2)

```
Worker-0 process:
    ↓
1. Claim Job 1: {assignedWorkerId: "worker-0", runId: "run-123"}
    ↓
2. Load run config from AdsterraRuns:
   - URL: "https://example.com/global"
   - minAdWait: 10000
   - maxAdWait: 30000
    ↓
3. Load worker config from WorkersConfig:
   - URL: "https://example.com/worker-0-exclusive"
   - minAdWait: 8000
   - maxAdWait: 20000
    ↓
4. Merge configs (worker > run):
   {
     "url": "https://example.com/worker-0-exclusive",  ← worker config
     "minAdWait": 8000,                                 ← worker config
     "maxAdWait": 20000                                 ← worker config
   }
    ↓
5. Execute session with merged config
    ↓
6. Mark job completed
```

## 📊 Data Flow: Campaign → Jobs → Execution

```
Campaign Configuration
├─ Global Config (from run)
│  ├─ adsterraUrl: "global-url.com"
│  ├─ minAdWait: 10000
│  └─ assignedWorkerIds: ["worker-0", "worker-5"]
│
└─ Worker-0 Config (from DynamoDB)
   ├─ adsterraUrl: "worker-0-url.com"
   ├─ minAdWait: 8000
   └─ maxAdWait: 20000
        ↓
        ↓ [Config Merge]
        ↓
Merged Config (used for execution)
├─ adsterraUrl: "worker-0-url.com"        ← From worker config
├─ minAdWait: 8000                        ← From worker config
├─ maxAdWait: 20000                       ← From worker config
└─ [other fields from global config]
        ↓
        ↓ [Job Execution]
        ↓
Session executes with merged config
```

## 🎯 Key System Characteristics

### Phase 1: Worker Assignment Foundation
- ✅ Workers can be assigned specific jobs via round-robin
- ✅ Unassigned jobs available to any worker (backward compatible)
- ✅ Job assignment stored in DynamoDB
- ✅ Worker ID passed through entire job lifecycle

### Phase 2: Per-Worker Configuration
- ✅ Each worker can have unique configuration
- ✅ Worker config overrides global campaign config
- ✅ Configuration stored separately in DynamoDB
- ✅ Real-time admin UI for configuration management
- ✅ Graceful fallback if worker config missing

### Combined: Sophisticated Campaign Execution
- ✅ 15 workers, each with different settings
- ✅ Same campaign running on different workers with different URLs
- ✅ Granular control over bot behavior per worker
- ✅ Flexible assignment patterns
- ✅ Full backward compatibility

## 📈 Scalability & Performance

### Database Design
- **Optimized Keys:** PK + SK allow efficient queries
- **Atomic Operations:** DynamoDB Document Client ensures consistency
- **No N+1 Queries:** Single queries load everything needed
- **Horizontal Scalability:** Can add more workers without redesign

### Worker Process
- **Concurrent Execution:** Semaphore limits parallel browsers
- **Async Job Claims:** Non-blocking DynamoDB operations
- **Efficient Config Loading:** Single query per job
- **Memory Efficient:** Configs cached in memory during session

### Network
- **Minimal API Calls:** One DynamoDB call per job
- **Batch Operations:** List all configs in single scan
- **API Efficiency:** Simple REST endpoints, no complex queries

## 🔐 Consistency & Reliability

### Data Consistency
- ✅ Atomic job claiming (no race conditions)
- ✅ Ordered job processing (fifo within worker)
- ✅ Config merging is deterministic
- ✅ Status tracking in DynamoDB

### Fault Tolerance
- ✅ Missing worker configs handled gracefully
- ✅ Worker process continues without config
- ✅ Job failures logged and reported
- ✅ Run completion detection after job completion

### Error Handling
- ✅ Try-catch around config loading
- ✅ Validation of worker IDs in API
- ✅ Required field validation in forms
- ✅ Proper HTTP error codes

## 🔮 Architecture Evolution

### Phase 1 Achievements
- [x] Worker assignment system
- [x] Round-robin job distribution
- [x] Worker-specific job claiming
- [x] Job tracking with worker IDs

### Phase 2 Achievements
- [x] Per-worker configuration storage
- [x] Configuration CRUD API
- [x] Admin UI for configuration
- [x] Config merging logic
- [x] Worker config application

### Phase 3 Possibilities
- [ ] Config templates and presets
- [ ] Configuration history/versioning
- [ ] Worker health monitoring
- [ ] Automatic failover configs
- [ ] A/B testing framework
- [ ] Analytics dashboard
- [ ] Scheduled config changes
- [ ] Config validation rules

## 📚 System Documentation

- **High-Level:** This file (ARCHITECTURE.md)
- **Phase 1:** WORKER_ASSIGNMENT.md
- **Phase 2:** PHASE_2_WORKER_CONFIG_COMPLETE.md
- **Quick Start:** WORKER_CONFIG_QUICK_START.md
- **Code:** Inline comments in TypeScript files

## 🚀 Getting Started

1. **Create Campaign:** `/adsterra` → Create new run
2. **Configure Workers:** `/admin/workers` → Set worker settings
3. **Select Workers:** In campaign form → Choose worker-0, worker-5, etc.
4. **Submit:** Create run → Jobs distributed with worker assignments
5. **Monitor:** Workers execute jobs with their specific configs

---

**System Version:** Phase 1 + Phase 2 Complete  
**Status:** Production Ready ✅  
**Last Updated:** 2024
