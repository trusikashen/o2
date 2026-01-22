# Adsterra Smart Link Configuration

## Overview
The Adsterra smart link is now fully configurable with support for both environment variables (.env) and frontend override. This allows you to:

1. **Set a default smart link via .env** - Used as fallback when no URL is provided from the frontend
2. **Override with frontend URL** - When creating a run from the frontend, you can specify a different smart link URL that takes precedence over the .env default

## Configuration Priority

The smart link URL is resolved in the following priority order:

1. **Frontend-provided URL** (highest priority) - URL provided when creating a run from the web interface
2. **Environment variable** (fallback) - `ADSTERRA_SMART_LINK` from `.env` file

This ensures that:
- Each run can have its own custom smart link URL (via frontend)
- There's a sensible default from .env for programmatic executions or when no frontend URL is provided

## Setup

### 1. Environment Variable (.env)

Add or update the `ADSTERRA_SMART_LINK` environment variable in your `.env` file:

```bash
# Adsterra Smart Link Configuration (Default fallback)
ADSTERRA_SMART_LINK=https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221
```

**Current default:** `https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221`

You can change this to any other Adsterra smart link URL.

### 2. Frontend Interface

When creating a new run from the frontend:

1. Go to the Adsterra dashboard
2. Fill in the "Adsterra Smart Link URL" field with your desired URL
3. The URL you provide will be used for all sessions in this run, overriding the .env default

The frontend field has a placeholder showing the format:
```
https://www.effectivegatecpm.com/ma9efknwx?key=...
```

## Implementation Details

### Files Modified

1. **`env.template`** - Added `ADSTERRA_SMART_LINK` environment variable with the default URL

2. **`src/types/index.ts`** - Updated `BotConfig` interface:
   ```typescript
   export interface BotConfig {
     ...
     adsterraSmartLink: string; // Default Adsterra Smart Link URL from env
     ...
   }
   ```

3. **`src/config/index.ts`** - Updated `botConfig` to read from env:
   ```typescript
   adsterraSmartLink: process.env.ADSTERRA_SMART_LINK || 'https://www.effectivegatecpm.com/frpuya5zn?key=...'
   ```

4. **`src/bot/session.ts`** - Updated URL resolution logic:
   - `getConfig()` method now returns `.env` URL as fallback
   - `execute()` method uses priority: `config.adsterraUrl` → `botConfig.adsterraSmartLink`
   - Comments added explaining the priority order

5. **`adsterra/src/app/adsterra/page.tsx`** - Frontend already supports `adsterraUrl` input field

### How It Works

**When a run is created from the frontend:**
1. User enters a smart link URL in the "Adsterra Smart Link URL" field
2. This URL is sent in the `config.adsterraUrl` field to the API
3. API validates that `adsterraUrl` is provided (required)
4. The run is saved with this custom URL in DynamoDB

**When a session executes:**
1. `getConfig()` retrieves the run's configuration (which includes the frontend-provided `adsterraUrl`)
2. If `adsterraUrl` exists in config, it's used (frontend-provided URL)
3. If not, falls back to `botConfig.adsterraSmartLink` (from .env)
4. URL is validated and enhanced with proper protocol (https://)
5. Session navigates to the final smart link URL

## Usage Examples

### Example 1: Using .env default for all runs

1. Set in `.env`:
   ```bash
   ADSTERRA_SMART_LINK=https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221
   ```

2. Create runs from frontend without specifying a URL, or with the same URL

3. All sessions will use the .env URL

### Example 2: Different URLs per run

1. Keep `.env` with a default URL:
   ```bash
   ADSTERRA_SMART_LINK=https://www.effectivegatecpm.com/frpuya5zn?key=DEFAULT_KEY
   ```

2. Create Run #1 from frontend with URL A:
   ```
   https://www.effectivegatecpm.com/ma9efknwx?key=KEY_A
   ```

3. Create Run #2 from frontend with URL B:
   ```
   https://www.effectivegatecpm.com/xyz123?key=KEY_B
   ```

4. All sessions in Run #1 use URL A
5. All sessions in Run #2 use URL B
6. If you create programmatic runs without specifying a URL, they use the .env default

### Example 3: Programmatic API usage

```bash
# Create a run with a custom URL via API
curl -X POST http://localhost:3000/api/adsterra/runs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Campaign",
    "config": {
      "adsterraUrl": "https://www.effectivegatecpm.com/custom-key?key=...",
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

## Testing

To verify the configuration is working:

1. **Check .env is read:**
   - Look in console logs for smart link configuration messages
   - Sessions should show the URL they're navigating to

2. **Test frontend override:**
   - Create a run with one URL
   - Create another run with a different URL
   - Both runs should use their respective URLs

3. **Test .env fallback:**
   - Comment out or remove custom URLs from frontend
   - Sessions should fallback to .env value

## Troubleshooting

### Sessions still using old hardcoded URL?
- Ensure you've restarted the worker process after updating files
- Check that the new URL is properly passed in the run config
- Verify .env file is being loaded: `console.log(process.env.ADSTERRA_SMART_LINK)`

### Frontend URL not being used?
- Verify the URL was sent in the API request to create the run
- Check DynamoDB/database that the run config contains `adsterraUrl`
- Look at session logs to see which URL was selected

### Environment variable not being read?
- Ensure `.env` file is in the project root
- Check that `ADSTERRA_SMART_LINK=` is the exact variable name (case-sensitive)
- Reload the application after modifying `.env`

## Summary

The smart link configuration is now flexible and multi-layered:

- ✅ Default behavior: All sessions use .env configured URL
- ✅ Frontend override: Each run can have a different URL
- ✅ API support: Programmatic runs can specify custom URLs
- ✅ Backward compatible: Existing code continues to work with new configuration system
