# Smart Link Configuration - Complete Implementation ✅

## Summary

The Adsterra smart link is now **fully configurable** with a priority system that allows:

1. **Frontend Override** - When creating a run via the web interface, you can specify a custom smart link URL
2. **Environment Fallback** - If no URL is provided from frontend, the system uses `.env` configuration
3. **Programmatic Support** - Both web UI and API support custom URLs per run

---

## What Was Changed

### Files Modified: 4

| File | Change | Purpose |
|------|--------|---------|
| `env.template` | Added `ADSTERRA_SMART_LINK` variable | Provide configurable default |
| `src/types/index.ts` | Added `adsterraSmartLink` to `BotConfig` | Type definition for env config |
| `src/config/index.ts` | Updated `botConfig` to read from `.env` | Load default from environment |
| `src/bot/session.ts` | Updated URL resolution logic | Implement priority system |

### Configuration Sources

| Source | Format | Example |
|--------|--------|---------|
| `.env` file | `ADSTERRA_SMART_LINK=...` | `https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221` |
| Frontend Form | "Adsterra Smart Link URL" field | Input when creating a run |
| API Request | `config.adsterraUrl` in JSON | Programmatic run creation |

---

## How to Use

### 1. Set Default in .env

```bash
# .env file
ADSTERRA_SMART_LINK=https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221
```

This URL is used as fallback for all sessions when no frontend URL is provided.

### 2. Override via Frontend

1. Open the Adsterra dashboard
2. Fill in "Adsterra Smart Link URL" field with your custom URL
3. Create the run
4. ✅ All sessions in this run will use your custom URL, ignoring the .env default

### 3. API Usage

```bash
curl -X POST http://localhost:3000/api/adsterra/runs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Campaign Name",
    "config": {
      "adsterraUrl": "https://your-custom-url",
      "totalBots": 1000,
      "sessionsPerBot": 10,
      "targetImpressions": 10000,
      "browserHeadless": true,
      "minScrollWait": 0,
      "maxScrollWait": 0,
      "minAdWait": 20000,
      "maxAdWait": 60000
    }
  }'
```

---

## Priority System

When a session starts, it uses this priority to determine the smart link URL:

```
1️⃣  Frontend-provided URL (config.adsterraUrl from run config) 
    ↓ if not available
2️⃣  Environment variable (ADSTERRA_SMART_LINK from .env)
    ↓ if not available  
3️⃣  Compiled default (hardcoded fallback, but this shouldn't happen)
```

**Result:** Each run can have its own URL, or use the .env default if not specified.

---

## Current Default

```
https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221
```

You can change this by:
1. Modifying `ADSTERRA_SMART_LINK` in `.env`
2. Or specifying a different URL when creating runs from the frontend

---

## Real-World Scenarios

### Scenario 1: Single URL for All Runs
- Set `.env` to your smart link
- Create all runs without specifying a URL
- ✅ All sessions use `.env` URL

### Scenario 2: Different URLs per Campaign
- Set `.env` to a default URL
- Campaign A: Create run with URL_A
- Campaign B: Create run with URL_B  
- Campaign C: Create run (uses .env default)
- ✅ Each campaign uses its configured URL

### Scenario 3: Testing & Production
- Dev environment: `.env` has test URL
- Production environment: `.env` has production URL
- ✅ Each environment uses its configured default

### Scenario 4: A/B Testing
- Create Run #1 with Smart Link A
- Create Run #2 with Smart Link B
- Compare performance between the two
- ✅ Each run tracks its own smart link

---

## Documentation Files

Two comprehensive guides have been created:

1. **SMART_LINK_CONFIGURATION.md** - User guide with setup instructions and examples
2. **IMPLEMENTATION_DETAILS.md** - Technical details showing all changes and data flow

---

## What You Need to Do

1. ✅ **Update `.env` file** - Add/update the `ADSTERRA_SMART_LINK` variable:
   ```bash
   ADSTERRA_SMART_LINK=https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221
   ```

2. ✅ **Restart services** - Restart your worker and API processes to load the new configuration

3. ✅ **Test it** - Create a test run from the frontend with a custom URL and verify it's used

---

## Code Changes at a Glance

**Before:**
```typescript
const defaultAdsterraUrl = 'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221';
let adsterraUrl = config.adsterraUrl || defaultAdsterraUrl;
```

**After:**
```typescript
// Priority order for smart link:
// 1. From job/run config (frontend-provided URL takes precedence)
// 2. From environment variable (.env fallback)
let adsterraUrl = config.adsterraUrl || botConfig.adsterraSmartLink;
```

The difference: Now `botConfig.adsterraSmartLink` reads from `.env`, making it configurable!

---

## Backward Compatibility

✅ **Fully backward compatible:**
- Existing runs continue to work
- If a run doesn't have a custom URL, it uses .env default
- No data migration required
- Can gradually update runs with custom URLs

---

## Benefits

| Benefit | Use Case |
|---------|----------|
| **Flexibility** | Different smart links for different campaigns |
| **Control** | Frontend users can manage URLs without code changes |
| **Organization** | Environment-based configuration (.env) |
| **Safety** | Fallback system ensures sessions always have a URL |
| **Scalability** | Support thousands of runs with different URLs |

---

## Next Steps

1. Update your `.env` file with the new variable
2. Restart the worker process
3. Test creating a run with a custom URL from the frontend
4. Monitor session logs to verify correct URL is being used

**That's it!** Your smart link configuration system is now live. 🚀
