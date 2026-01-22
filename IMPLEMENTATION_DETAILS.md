# Smart Link Configuration - Implementation Summary

## Changes Made

### 1. Environment Variable Template (env.template)
```diff
  # Blog Configuration
  BLOG_HOMEPAGE_URL=https://ios18jail.netlify.app
  SMART_LINK_TEXT=Click here to make money with sport betting
+ 
+ # Adsterra Smart Link Configuration (Default fallback - overridden by frontend URL when creating runs)
+ ADSTERRA_SMART_LINK=https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221
```

### 2. Types Definition (src/types/index.ts)
```diff
  export interface BotConfig {
    totalBots: number;
    sessionsPerBot: number;
    targetImpressions: number;
    blogHomepageUrl: string;
    smartLinkText: string;
+   adsterraSmartLink: string; // Default Adsterra Smart Link URL from env
    browserHeadless: boolean;
    browserTimeout: number;
  }
```

### 3. Config Module (src/config/index.ts)
```diff
  export const botConfig: BotConfig = {
    totalBots: parseInt(process.env.TOTAL_BOTS || '16000', 10),
    sessionsPerBot: parseInt(process.env.SESSIONS_PER_BOT || '10', 10),
    targetImpressions: parseInt(process.env.TARGET_IMPRESSIONS || '160000', 10),
    blogHomepageUrl: process.env.BLOG_HOMEPAGE_URL || 'https://yoursite.com',
    smartLinkText: process.env.SMART_LINK_TEXT || 'Click here to make money with sport betting',
+   adsterraSmartLink: process.env.ADSTERRA_SMART_LINK || 'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221',
    browserHeadless: process.env.BROWSER_HEADLESS === 'true',
    browserTimeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
  };
```

### 4. Session Module (src/bot/session.ts)

#### getConfig() method:
```diff
    // Fallback to env-based config
-   const defaultAdsterraUrl = 'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221';
    return {
-     adsterraUrl: defaultAdsterraUrl,
+     adsterraUrl: botConfig.adsterraSmartLink, // Use .env configuration as fallback
      browserHeadless: botConfig.browserHeadless,
      browserTimeout: botConfig.browserTimeout,
      minScrollWait: timingConfig.minScrollWait,
      maxScrollWait: timingConfig.maxScrollWait,
      minAdWait: timingConfig.minAdWait,
      maxAdWait: timingConfig.maxAdWait,
    };
```

#### execute() method:
```diff
  async execute(
    botId: string,
    sessionNumber: number,
    distribution?: { country: string; deviceType: string; deviceName: string; browserType: string },
    job?: any // Full job object with realistic session data
  ): Promise<SessionResult> {
    const startTime = Date.now();
    const config = this.getConfig();
-   let adsterraUrl = config.adsterraUrl || 'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221';
+   
+   // Priority order for smart link:
+   // 1. From job/run config (frontend-provided URL takes precedence)
+   // 2. From environment variable (.env fallback)
+   let adsterraUrl = config.adsterraUrl || botConfig.adsterraSmartLink;
    
    this.resetLifecycle();
```

---

## How It Works

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Creates Run                              │
└────────┬────────────────────────────────────────────────────────┘
         │
         ├─ Frontend URL provided
         │  └─> config.adsterraUrl = "https://...user-provided-url"
         │
         └─ Frontend URL NOT provided
            └─> config.adsterraUrl = undefined

┌─────────────────────────────────────────────────────────────────┐
│              API Saves Run to Database                           │
│         (with config.adsterraUrl or empty)                       │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│         Worker Loads Run & Creates Session                       │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│            Session.getConfig()                                   │
│                                                                   │
│  if (this.config.adsterraUrl)                                   │
│    └─> return {adsterraUrl: this.config.adsterraUrl}   ← URL #1 │
│  else                                                            │
│    └─> return {adsterraUrl: botConfig.adsterraSmartLink}         │
│                                 ↑                                │
│                        from .env file         ← URL #2 (fallback)│
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│           Session.execute()                                      │
│                                                                   │
│  let adsterraUrl = config.adsterraUrl ||                        │
│                    botConfig.adsterraSmartLink                  │
│                                                                   │
│  ✅ Priority established: Frontend > .env                        │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│          Navigate to Smart Link                                  │
│     (with proper https:// protocol)                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

- [ ] Update `.env` file with new `ADSTERRA_SMART_LINK` variable
- [ ] Restart worker/API process
- [ ] Create a run from frontend with custom smart link URL
- [ ] Verify sessions use the frontend-provided URL
- [ ] Create a run without specifying URL
- [ ] Verify sessions fallback to `.env` URL
- [ ] Check logs for URL resolution messages
- [ ] Test with different URLs for different runs

---

## API Integration Points

### Creating a Run (POST /api/adsterra/runs)

Request body:
```json
{
  "name": "My Campaign",
  "config": {
    "adsterraUrl": "https://www.effectivegatecpm.com/custom-url?key=...",
    "totalBots": 1000,
    "sessionsPerBot": 10,
    "targetImpressions": 10000,
    "browserHeadless": true,
    "minScrollWait": 0,
    "maxScrollWait": 0,
    "minAdWait": 20000,
    "maxAdWait": 60000
  }
}
```

The API validates that `adsterraUrl` is provided and required.

### Frontend Form

The frontend already has an input field for "Adsterra Smart Link URL":
- Placeholder shows format: `https://www.effectivegatecpm.com/ma9efknwx?key=...`
- Field is marked as required
- Direct link to Adsterra Smart Link

---

## Key Features

✅ **Frontend Control** - Users can specify custom URLs when creating runs
✅ **Environment Default** - `.env` configuration as fallback for all sessions
✅ **Priority System** - Frontend URL takes precedence over .env
✅ **Backward Compatible** - Existing hardcoded logic replaced with configuration
✅ **Type Safe** - TypeScript interfaces updated for the new field
✅ **Flexible** - Supports both programmatic and UI-based run creation
✅ **Well Documented** - Clear comments and configuration guide

---

## Migration Notes

If you have existing runs in the database:
- They may not have `adsterraUrl` in their config
- When sessions execute, they'll automatically fallback to `.env` value
- No data migration needed - backward compatible

To update existing runs:
- Re-create them through the frontend, specifying the desired URL
- Or update the database records directly to add `config.adsterraUrl`
