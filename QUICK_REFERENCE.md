# Phase 2 Quick Reference Card

## 🚀 Quick Setup (3 Steps)

```bash
# 1. Create DynamoDB table
npm run setup:workers-config

# 2. Start dev server
npm run dev

# 3. Open admin panel
http://localhost:3000/admin/workers
```

---

## 📍 Important URLs

| Purpose | URL |
|---------|-----|
| Main App | http://localhost:3000 |
| Campaigns | http://localhost:3000/adsterra |
| Worker Config Admin | http://localhost:3000/admin/workers |
| API - List Configs | http://localhost:3000/api/admin/workers |
| API - Get Config | http://localhost:3000/api/admin/workers/worker-0/config |

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `src/app/admin/workers/page.tsx` | Admin UI |
| `src/app/api/admin/workers/route.ts` | List API |
| `src/app/api/admin/workers/[workerId]/config/route.ts` | CRUD API |
| `scripts/setup-dynamodb-workers-config.ts` | Setup script |
| `src/lib/aws/adsterra-helpers.ts` | Database functions |
| `src/worker.ts` | Worker config loading |
| `src/types/adsterra.ts` | Type definitions |

---

## 🔧 npm Scripts

```bash
npm run dev                     # Start dev server + admin
npm run setup:workers-config    # Create DynamoDB table
npm run worker                  # Run worker process
npm run build                   # Build project
npm run setup:jobs              # Create jobs table (Phase 1)
npm run setup:runs              # Create runs table (Phase 1)
```

---

## 📊 API Endpoints

### List All Configs
```bash
GET /api/admin/workers
Response: WorkerConfig[]
```

### Get One Config
```bash
GET /api/admin/workers/worker-0/config
Response: WorkerConfig | 404
```

### Create/Update Config
```bash
PUT /api/admin/workers/worker-0/config
Body: {
  adsterraUrl: "https://...",
  minAdWait?: 8000,
  maxAdWait?: 20000,
  browserHeadless?: true
}
Response: WorkerConfig
```

### Delete Config
```bash
DELETE /api/admin/workers/worker-0/config
Response: { message: "..." }
```

---

## 🎯 Admin Panel Usage

### Select Worker
```
Sidebar → Click worker-0 through worker-14
Status:
  ✅ = Configured
  ⭕ = Not configured
```

### Configure Worker
```
1. Enter Smart Link URL (required)
2. Set timings (optional):
   - Min Scroll Wait
   - Max Scroll Wait
   - Min Ad Wait
   - Max Ad Wait
3. Toggle Headless Browser (optional)
4. Click "Save Configuration"
```

### Delete Configuration
```
1. Select configured worker
2. Click "Delete" button
3. Confirm
4. Status changes to ⭕
```

---

## 💻 Code Examples

### Load Worker Config
```typescript
import { getWorkerConfig } from '@/lib/aws/adsterra-helpers';

const config = await getWorkerConfig('worker-0');
if (config) {
  console.log('URL:', config.adsterraUrl);
  console.log('Min Ad Wait:', config.minAdWait);
}
```

### Create Worker Config
```typescript
import { createWorkerConfig } from '@/lib/aws/adsterra-helpers';

await createWorkerConfig({
  workerId: 'worker-0',
  adsterraUrl: 'https://example.com/campaign-a',
  minAdWait: 8000,
  maxAdWait: 20000,
  browserHeadless: true
});
```

### Merge Configs
```typescript
const runConfig = { url: 'global.com', wait: 10000 };
const workerConfig = { url: 'worker.com', wait: 8000 };

// Worker config has priority
const merged = { ...runConfig, ...workerConfig };
// Result: { url: 'worker.com', wait: 8000 }
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Table not found | Run: `npm run setup:workers-config` |
| Admin page blank | Restart: `npm run dev` |
| Config not saving | Check URL format, verify AWS credentials |
| Worker not using config | Verify ✅ indicator in admin UI |
| API 500 error | Check AWS region, DynamoDB permissions |

---

## 🔐 Environment Variables

```env
# Required for AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Optional
DYNAMODB_WORKERS_CONFIG_TABLE=WorkersConfig
DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs
```

---

## 📋 Configuration Fields

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `workerId` | string | ✅ | `worker-0` |
| `adsterraUrl` | string | ✅ | `https://example.com/...` |
| `minScrollWait` | number | ❌ | `1000` (ms) |
| `maxScrollWait` | number | ❌ | `4000` (ms) |
| `minAdWait` | number | ❌ | `8000` (ms) |
| `maxAdWait` | number | ❌ | `20000` (ms) |
| `browserHeadless` | boolean | ❌ | `true` |
| `distribution` | object | ❌ | `{countries:{...}}` |

---

## 🎯 Workflow: Campaign with Workers

```
1. Configure Workers
   → Admin panel: Set 3-5 workers with different URLs

2. Create Campaign
   → Campaign page: Select those 3-5 workers

3. Generate Jobs
   → Jobs created with assignedWorkerId

4. Distribute Jobs
   → Round-robin to selected workers

5. Execute
   → Each worker uses its own config

6. Track Results
   → Performance per worker visible
```

---

## 📚 Documentation Quick Links

| Document | Purpose | Length |
|----------|---------|--------|
| `PHASE_2_COMPLETE.md` | Overview | 400 lines |
| `WORKER_CONFIG_QUICK_START.md` | User guide | 300 lines |
| `PHASE_2_WORKER_CONFIG_COMPLETE.md` | Detailed | 500 lines |
| `ARCHITECTURE.md` | System design | 400 lines |
| `PHASE_2_DEPLOYMENT_GUIDE.md` | Deployment | 300 lines |
| `SYSTEM_STATUS.md` | Complete status | 300 lines |

---

## 🎓 Key Concepts

**Worker Config**
- Per-worker configuration overrides
- Stored in DynamoDB WorkersConfig table
- Loaded at job execution time
- Takes priority over campaign config

**Config Merging**
- Worker config > Campaign config > App defaults
- Deterministic merge process
- No config loss during merge
- Type-safe operations

**Admin Panel**
- Manages 15 worker configurations
- Real-time CRUD operations
- Status indicators (✅/⭕)
- Professional UI

**API Endpoints**
- 4 endpoints for CRUD operations
- Proper validation and error handling
- HTTP status codes
- Graceful error recovery

---

## ✅ Pre-Flight Checklist

Before running campaigns:
- [ ] AWS credentials configured
- [ ] DynamoDB table created: `npm run setup:workers-config`
- [ ] Dev server running: `npm run dev`
- [ ] At least 2 workers configured in admin panel
- [ ] Each worker has unique smart link URL
- [ ] Timing values reasonable (ms)

---

## 🚨 Emergency Procedures

**Admin Panel Not Loading**
```bash
npm run dev                    # Restart dev server
# Try http://localhost:3000/admin/workers again
```

**API Returning 500 Errors**
```bash
npm run setup:workers-config  # Recreate table
npm run dev                    # Restart dev
```

**Worker Not Using Config**
```bash
1. Verify config saved (✅ in admin)
2. Create new campaign
3. Check worker logs for config message
```

**Data Loss / Corruption**
```bash
1. Backup: aws dynamodb create-backup --table-name WorkersConfig
2. Delete table: aws dynamodb delete-table --table-name WorkersConfig
3. Recreate: npm run setup:workers-config
```

---

## 📞 Support Contacts

**For Setup Issues:**
→ Read: `PHASE_2_DEPLOYMENT_GUIDE.md`

**For Usage Questions:**
→ Read: `WORKER_CONFIG_QUICK_START.md`

**For Architecture Questions:**
→ Read: `ARCHITECTURE.md`

**For All Else:**
→ Read: `PHASE_2_WORKER_CONFIG_COMPLETE.md`

---

## 🎉 You're All Set!

**Status:** ✅ Production Ready  
**Next Step:** `npm run setup:workers-config`  
**Then:** `npm run dev` and visit `/admin/workers`  

---

**Quick Reference Card v1.0 - January 2026**  
**Phase 2: Per-Worker Configuration System**  
**Status: 🟢 PRODUCTION READY**
