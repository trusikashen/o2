# Worker Heartbeat System - Quick Start

## 🎯 What Changed

**Before:** Frontend relied on GitHub Actions to launch EC2 and track workers
**Now:** Workers self-report their status via heartbeats - works with ANY orchestrator

---

## 🚀 Getting Started

### 1. Start Local Workers (PM2)

```bash
cd /path/to/adsterra
npm run worker
# or
pm2 start ecosystem.config.js
```

Workers automatically:
- Identify as `worker-0` through `worker-14`
- Set `location: 'local'`
- Send heartbeat every 10 seconds to `/api/workers/heartbeat`

### 2. View Worker Status in Frontend

```typescript
// http://localhost:3000/admin/workers
// Now shows:
// ✅ worker-0 (Local, 150 jobs processed, current job: job-123)
// ✅ worker-1 (Local, 145 jobs processed, idle)
// ✅ worker-5 (AWS i-0123456789, 500 jobs processed, current job: job-456)
// ❌ worker-10 (Offline for 5+ minutes)
```

### 3. Query Worker Status Programmatically

```bash
# Get all online workers
curl http://localhost:3000/api/workers/status

# Response:
{
  "workers": [
    {
      "workerId": "worker-0",
      "isOnline": true,
      "location": "local",
      "lastHeartbeat": "2026-01-20T12:00:00.000Z",
      "currentJobId": "job-123",
      "jobsProcessedInSession": 150,
      "uptime": 3600
    },
    {
      "workerId": "worker-5",
      "isOnline": true,
      "location": "aws",
      "ec2InstanceId": "i-0123456789abcdef0",
      "ec2Region": "us-east-1",
      "lastHeartbeat": "2026-01-20T12:00:00.000Z",
      "currentJobId": "job-456",
      "jobsProcessedInSession": 500,
      "uptime": 7200
    }
  ],
  "timestamp": "2026-01-20T12:00:05.000Z",
  "onlineCount": 2,
  "awsCount": 1,
  "localCount": 1
}
```

---

## 🏗️ Scaling Workers (Any Orchestrator)

### **Option 1: Docker (Example)**

```dockerfile
FROM node:20
WORKDIR /app
COPY . .
RUN npm install --omit=dev

# Set worker ID and location
ENV WORKER_ID=worker-aws-1
ENV RUN_ID=run-abc123
ENV EC2_INSTANCE_ID=i-0123456789abcdef0
ENV API_URL=http://frontend:3000

CMD ["npm", "run", "worker"]
```

```bash
docker run \
  -e WORKER_ID=worker-docker-1 \
  -e RUN_ID=run-abc123 \
  -e API_URL=http://localhost:3000 \
  my-adsterra-worker
```

Worker will:
- Identify as `worker-docker-1`
- Report `location: 'aws'` (because RUN_ID is set)
- Send heartbeats every 10 seconds

### **Option 2: Kubernetes (Example)**

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: adsterra-worker-aws
spec:
  parallelism: 50  # 50 worker pods
  template:
    spec:
      containers:
      - name: worker
        image: my-adsterra-worker:latest
        env:
        - name: WORKER_ID
          value: "worker-k8s-1"
        - name: RUN_ID
          value: "run-abc123"
        - name: API_URL
          value: "http://frontend:3000"
```

### **Option 3: AWS Lambda**

```python
import requests
import os
import json

def lambda_handler(event, context):
    # Send heartbeat
    heartbeat = {
        'workerId': 'worker-lambda-1',
        'location': 'aws',
        'ec2InstanceId': context.invoked_function_arn,
        'currentJobId': event.get('jobId')
    }
    
    requests.post(
        f"{os.getenv('API_URL')}/api/workers/heartbeat",
        json=heartbeat
    )
    
    # Process job...
    return {'statusCode': 200}
```

---

## 📊 Environment Variables

### Required

```bash
API_URL=http://localhost:3000              # Frontend URL for heartbeats
```

### Recommended

```bash
WORKER_ID=worker-0                         # Unique worker identifier
RUN_ID=run-abc123                          # (AWS only) Bind to specific run
EC2_INSTANCE_ID=i-0123456789abcdef0       # (AWS only) EC2 instance ID
AWS_REGION=us-east-1                       # AWS region
```

### All Set Automatically

```bash
NODE_APP_INSTANCE=0          # PM2 provides this
WORKER_STARTTIME             # Auto-tracked
JOBS_PROCESSED_IN_SESSION    # Auto-tracked
```

---

## 🔍 Monitoring

### Check Worker Uptime

```typescript
const status = await fetch('/api/workers/status').then(r => r.json());

status.workers.forEach(w => {
  if (w.isOnline) {
    const uptimeHours = w.uptime / 3600;
    console.log(`${w.workerId}: ${uptimeHours.toFixed(1)}h uptime`);
  }
});
```

### Find Stale Workers

```typescript
const staleThresholdMs = 30000; // 30 seconds
const stale = status.workers.filter(w => {
  const lastHB = new Date(w.lastHeartbeat).getTime();
  return Date.now() - lastHB > staleThresholdMs;
});

console.log(`Stale workers: ${stale.map(w => w.workerId).join(', ')}`);
```

### Check Job Processing Rate

```typescript
setInterval(async () => {
  const status = await fetch('/api/workers/status').then(r => r.json());
  
  const totalProcessed = status.workers
    .filter(w => w.isOnline)
    .reduce((sum, w) => sum + (w.jobsProcessedInSession || 0), 0);
  
  console.log(`Total jobs processed: ${totalProcessed}`);
}, 10000);
```

---

## ❓ FAQ

### Q: Why does a worker stop reporting heartbeats?
**A:** Worker crashed or was terminated. Frontend will mark it offline after 30 seconds of no heartbeat.

### Q: Can I use custom worker IDs?
**A:** Yes! Set `WORKER_ID` env var to anything. Example: `worker-k8s-1`, `worker-azure-2`, etc.

### Q: How long until a worker is marked offline?
**A:** 30 seconds (configurable in `/api/workers/status`).

### Q: Do I need DynamoDB?
**A:** Yes, for storing heartbeats. Table auto-creates with TTL. Add to `.env`:
```bash
DYNAMODB_WORKER_STATUS_TABLE=WorkerStatus
```

### Q: Can I see what job each worker is processing?
**A:** Yes! Heartbeat includes `currentJobId` and `currentRunId`. See in `/api/workers/status`.

### Q: Can multiple workers have same ID?
**A:** Not recommended. Each worker should have unique `WORKER_ID` for proper tracking.

---

## 🧪 Testing

### Test Heartbeat Endpoint

```bash
# Send a heartbeat
curl -X POST http://localhost:3000/api/workers/heartbeat \
  -H 'Content-Type: application/json' \
  -d '{
    "workerId": "worker-test",
    "timestamp": "'$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')'",
    "location": "local",
    "jobsProcessedInSession": 10,
    "uptime": 60
  }'

# Check status
curl http://localhost:3000/api/workers/status | jq .workers
```

### Simulate AWS Worker

```bash
export WORKER_ID=worker-aws-test
export RUN_ID=run-test-123
export EC2_INSTANCE_ID=i-test-12345
npm run worker
```

Frontend will show:
```
✅ worker-aws-test (AWS i-test-12345, processing...)
```

---

## 🚀 Next Steps

1. **Deploy frontend changes** - Build and deploy Next.js app
2. **Update orchestration** - Add env vars to your infrastructure (Docker, K8s, etc.)
3. **Monitor heartbeats** - Use `/api/workers/status` in dashboards
4. **Scale confidently** - Add/remove workers without GitHub Actions

---

## 📚 Related Documentation

- [Full Architecture](./WORKER_AWS_DETECTION.md)
- [Worker Configuration](./WORKER_CONFIG_ADVANCED_SETUP.md)
- [API Reference](./README.md)
