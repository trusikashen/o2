# Worker Assignment Quick Start

## 🎯 Key Concepts

- **15 Workers**: You have 15 worker instances (worker-0 through worker-14) running in AWS
- **Worker Assignment**: When creating a campaign, you can specify which workers should handle the jobs
- **Round-Robin Distribution**: If you assign a campaign to multiple workers, jobs are automatically distributed evenly
- **Backward Compatible**: Campaigns without worker assignment work as before (any worker can claim them)

## 📋 How It Works

### Without Worker Assignment (Default)
```
Campaign → 1000 Jobs → DynamoDB
                           ↓
                    Any worker can claim
                    First available worker takes it
```

### With Worker Assignment
```
Campaign (worker-0, worker-1) → 1000 Jobs → DynamoDB
                                              ↓
                        Job 0,2,4... → worker-0
                        Job 1,3,5... → worker-1
```

## 🚀 Usage

### Create Campaign for Specific Workers
```javascript
// Frontend JavaScript/React
const response = await fetch('/api/adsterra/runs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Campaign for Worker 0',
    config: {
      adsterraUrl: 'https://...',
      totalBots: 100,
      sessionsPerBot: 10,
      targetImpressions: 1000,
      pacingMode: 'human'
    },
    assignedWorkerIds: ['worker-0']  // Only worker-0 processes these jobs
  })
});
```

### Create Campaign for Multiple Workers
```javascript
const response = await fetch('/api/adsterra/runs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Campaign for Workers 0-2',
    config: { /* ... */ },
    assignedWorkerIds: ['worker-0', 'worker-1', 'worker-2']
  })
});
```

### Create Campaign for All Workers (Alternative)
```javascript
const allWorkers = Array.from({length: 15}, (_, i) => `worker-${i}`);
// assignedWorkerIds: allWorkers
```

### Create Campaign without Assignment (Any Worker)
```javascript
// Omit assignedWorkerIds or set to empty array
const response = await fetch('/api/adsterra/runs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Campaign for Any Worker',
    config: { /* ... */ }
    // No assignedWorkerIds specified
  })
});
```

## 🔧 PM2 Configuration

### Option 1: Using NODE_APP_INSTANCE (Auto)
PM2 automatically numbers instances 0-14:
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'worker',
    script: './dist/worker.js',
    instances: 15,
    exec_mode: 'fork'
  }]
};
```
Workers will be identified as worker-0, worker-1, ..., worker-14

### Option 2: Explicit WORKER_ID (Recommended for Per-Worker Config)
```javascript
// ecosystem.config.js
module.exports = {
  apps: Array.from({length: 15}, (_, i) => ({
    name: `worker-${i}`,
    script: './dist/worker.js',
    exec_mode: 'fork',
    env: {
      WORKER_ID: `worker-${i}`,
      WORKER_CONFIG: `config-${i}.json`  // Optional: per-worker config
    }
  }))
};
```

## 📊 Monitoring

### Check Job Assignments in DynamoDB
```
Table: AdsterraJobs
Scan / Query and check:
- assignedWorkerId: "worker-0" | "worker-1" | null
- assignedAt: timestamp when worker claimed it
- status: "pending" | "active" | "completed" | "failed"
```

### Monitor Worker Status
```bash
# View all PM2 processes
pm2 list

# View specific worker logs
pm2 logs worker-0
pm2 logs worker-1

# Monitor in real-time
pm2 monit
```

## 💡 Use Cases

### Case 1: Single Worker with Custom Config
```javascript
// Only worker-0 handles this campaign
// Worker-0 has different proxy settings/smart link
assignedWorkerIds: ['worker-0']
```

### Case 2: Load Balancing Across Multiple Workers
```javascript
// Distribute campaign across 5 workers
assignedWorkerIds: ['worker-0', 'worker-1', 'worker-2', 'worker-3', 'worker-4']
```

### Case 3: Testing New Configuration
```javascript
// Run test campaign on single worker before rolling out
assignedWorkerIds: ['worker-14']  // Test on last worker
```

### Case 4: Geographic Distribution (Future)
```javascript
// If workers are in different regions:
// US workers: worker-0 to worker-4
// EU workers: worker-5 to worker-9
// Asia workers: worker-10 to worker-14
assignedWorkerIds: ['worker-0', 'worker-1', 'worker-2']  // US only
```

## ⚙️ Per-Worker Configuration (Next Phase)

Create individual smart links and settings for each worker:

1. **Database**: Store per-worker config
```sql
WorkerConfigs table:
- worker-0: smart_link_1, proxy_set_1
- worker-1: smart_link_2, proxy_set_2
- etc.
```

2. **Admin API**: Manage configs
```javascript
// Update worker-0 smart link
PATCH /api/admin/workers/worker-0/config
{ "adsterraUrl": "https://new-link.com" }
```

3. **Worker Reads Config**: Load on startup
```javascript
const config = await getWorkerConfig(workerId);
```

## 🐛 Troubleshooting

### Jobs not being picked up by specific worker
- Check if `assignedWorkerId` is set in DynamoDB
- Verify worker instance is running (`pm2 list`)
- Check worker logs (`pm2 logs worker-X`)

### Worker-0 is taking all jobs
- Verify `assignedWorkerIds` was included in run creation
- Ensure other workers are actually running
- Check DynamoDB for job assignments

### Backward compatibility broken
- Worker assignment is optional
- Old campaigns without `assignedWorkerIds` still work
- Update any scripts creating campaigns to include the field if desired

## 📚 API Reference

### Create Run with Worker Assignment
```
POST /api/adsterra/runs

Request:
{
  "name": "string",
  "config": { /* AdsterraConfig */ },
  "assignedWorkerIds": ["string[]"]  // OPTIONAL
}

Response:
{
  "id": "uuid",
  "name": "string",
  "status": "pending",
  "config": { /* ... */ },
  "assignedWorkerIds": ["worker-0"]  // Echoed back
}
```

### Get Run Details
```
GET /api/adsterra/runs/[runId]

Response includes assignedWorkerIds if set
```

### Monitor Job Assignments (via DynamoDB)
```
Query AdsterraJobs table:
- Filter by status = "active" or "pending"
- Group by assignedWorkerId
- See which worker is processing which job
```

## 🎓 Learning Path

1. ✅ **Step 1**: Understand worker assignment concept (you are here)
2. ⏭️ **Step 2**: Create first campaign with worker assignment
3. ⏭️ **Step 3**: Monitor job processing across workers
4. ⏭️ **Step 4**: Set up per-worker configurations
5. ⏭️ **Step 5**: Auto-assign campaigns based on worker load

---

**Need help?** Check WORKER_ASSIGNMENT_IMPLEMENTATION.md for technical details.
