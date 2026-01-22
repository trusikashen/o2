# Worker Configuration - Quick Start Guide

## Access the Worker Config Admin Panel

1. Open your app: `https://yourapp.com/adsterra`
2. Click the **"⚙️ Worker Config"** button (top right)
3. Or navigate directly to: `https://yourapp.com/admin/workers`

## Configure a Worker

### Step 1: Select Worker
- Sidebar shows all 15 workers (worker-0 to worker-14)
- ✅ = has config | ⭕ = no config yet
- Click to select

### Step 2: Enter Smart Link
- **Smart Link URL** field is required
- Example: `https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221`
- Each worker should have a different URL for tracking purposes

### Step 3: Configure Timings (Optional)
- **Min Scroll Wait**: Minimum milliseconds to wait before scrolling (0 = no scroll)
- **Max Scroll Wait**: Maximum milliseconds to wait before scrolling
- **Min Ad Wait**: Minimum time to wait on ad page (8000-10000 ms typical)
- **Max Ad Wait**: Maximum time to wait on ad page (20000-30000 ms typical)

### Step 4: Browser Settings (Optional)
- **Headless Browser**: Checked = run without GUI (recommended for servers)
- Unchecked = show browser window (useful for debugging)

### Step 5: Save
- Click **"💾 Save Configuration"**
- See "✅ Config saved for worker-X"
- Config is now active for that worker

## Use Worker Config in Campaign

1. Go to `/adsterra` page
2. Create new campaign as usual
3. **Select Workers**: Choose specific workers (worker-0, worker-2, etc.)
   - If selected: jobs distributed round-robin to chosen workers
   - If not selected: all workers can claim any job (backward compatible)
4. Submit campaign
5. Jobs assigned to chosen workers will use their specific configs

### Example Campaign
```
Campaign: Premium Traffic Push
- Total Bots: 10,000
- Assigned Workers: worker-0, worker-5, worker-12

Results:
- Job 1 → worker-0 (uses worker-0 config with its smart link URL)
- Job 2 → worker-5 (uses worker-5 config with its smart link URL)
- Job 3 → worker-12 (uses worker-12 config with its smart link URL)
- Job 4 → worker-0 (round-robin repeats)
```

## Config Priority (What Gets Used?)

**High Priority** (Used first)
1. Worker-Specific Config (from Admin Panel)
2. Run-Level Config (set when creating campaign)
3. Application Defaults (hardcoded)

**Example:**
```
Campaign Config:
- Smart Link: https://example.com/global
- Min Ad Wait: 10,000 ms
- Max Ad Wait: 30,000 ms

Worker-0 Config:
- Smart Link: https://example.com/worker0
- Min Ad Wait: (not specified)
- Max Ad Wait: (not specified)

Final Config Used:
- Smart Link: https://example.com/worker0     ← From worker config
- Min Ad Wait: 10,000 ms                       ← From campaign config
- Max Ad Wait: 30,000 ms                       ← From campaign config
```

## Edit Existing Config

1. Go to `/admin/workers`
2. Select worker (will show ✅ if config exists)
3. Form auto-fills with current values
4. Make changes
5. Click **"💾 Save Configuration"**
6. Shows timestamp when last updated

## Delete Config

1. Go to `/admin/workers`
2. Select configured worker (✅ indicator)
3. Click **"🗑️ Delete"** button
4. Confirm deletion
5. ⭕ indicator appears (no longer configured)
6. Worker will use run-level config for new jobs

## Check Status

### Admin Panel Status Indicators
- ✅ = Worker has custom configuration
- ⭕ = Worker has no configuration (uses defaults)

### Active Jobs
- Jobs with `assignedWorkerId` = targeted worker
- Jobs without = any worker can claim

## Debugging

### Verify Config is Loaded
Check worker logs when processing jobs:
```
⚙️  Loading worker-specific config for: worker-0
✅ Applied worker config override: worker-0
```

### Verify Config is Saved
1. Go to admin panel
2. Select worker
3. Values should appear in form fields
4. Check timestamp at bottom

### Test Config Application
1. Create run with 1 assigned worker
2. Create 1 job
3. Monitor worker logs
4. Should see config loading message

## Common Scenarios

### Scenario 1: A/B Testing Different Links
```
Campaign 1: worker-0, worker-1, worker-2
- Worker-0: Link A
- Worker-1: Link B
- Worker-2: Link C

Each worker tests different landing page variant
Track which performs best
```

### Scenario 2: Geo-Specific Workers
```
US Traffic: worker-0, worker-1, worker-2
EU Traffic: worker-3, worker-4, worker-5
Asia Traffic: worker-6, worker-7, worker-8

Each group has geo-optimized timing
```

### Scenario 3: Gradual Rollout
```
Day 1: Run campaign on worker-0 only
Day 2: Add worker-1, worker-2
Day 3: Add worker-3 through worker-5

Monitor performance before scaling
```

## API Usage (Advanced)

### Get All Configs
```bash
curl https://yourapp.com/api/admin/workers
```

### Get Worker-0 Config
```bash
curl https://yourapp.com/api/admin/workers/worker-0/config
```

### Save Worker-0 Config
```bash
curl -X PUT https://yourapp.com/api/admin/workers/worker-0/config \
  -H "Content-Type: application/json" \
  -d '{
    "adsterraUrl": "https://example.com/custom-url",
    "minAdWait": 8000,
    "maxAdWait": 25000,
    "browserHeadless": true
  }'
```

### Delete Worker-0 Config
```bash
curl -X DELETE https://yourapp.com/api/admin/workers/worker-0/config
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Config not saving | Check smart link URL is valid |
| Workers not using config | Verify ✅ indicator in admin panel |
| Workers using old config | New jobs will use latest config |
| URL not working | Test URL in browser first |
| Config not visible after save | Refresh page after 1-2 seconds |

## Tips & Best Practices

✅ **DO:**
- Use different smart links per worker for tracking
- Test config with small campaign first (10-100 bots)
- Set reasonable timing values (8000-30000 ms for ads)
- Monitor logs when deploying new configs
- Keep backups of working URL configs

❌ **DON'T:**
- Use duplicate URLs across workers
- Set very low ad wait times (<3000 ms)
- Change config during active campaign
- Leave headless OFF on production servers
- Share worker configs between campaigns

## Support

For issues or questions:
1. Check worker logs at `/logs` endpoint
2. Verify config was saved (✅ indicator)
3. Test with single worker and small campaign
4. Check DynamoDB WorkersConfig table exists

---

**Version:** Phase 2 - Per-Worker Configuration  
**Status:** Production Ready ✅
