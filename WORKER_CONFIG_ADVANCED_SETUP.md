# Worker Configuration - Advanced Setup Guide

## Overview

The worker configuration system has been enhanced to allow detailed setup of all parameters for each bot worker directly from two interfaces:

- **`http://localhost:3000/admin/workers`** - Detailed worker configuration management
- **`http://localhost:3000/adsterra`** - Run creation with worker assignment and distribution settings

## Features

### 1. Distribution Settings

Configure how traffic is distributed across your bot workers:

#### Countries
- **Default Preset**: US (50%), UK (17%), France (11%), Spain (9%), Ireland (8%), Australia (5%)
- **Customizable**: Adjust percentages for each country
- **Real-time Calculation**: See exact impression count per country

#### Devices
- **Mobile**: 70% (default)
- **Tablet**: 15% (default)
- **Desktop**: 15% (default)
- **Custom**: Adjust as needed for your traffic profile

#### Browsers
- **Safari**: 60% (default) - iOS Safari (WebKit)
- **Chrome**: 40% (default) - Android Chrome + Desktop Chrome/Edge (Chromium)
- **Note**: Firefox disabled due to proxy compatibility issues

### 2. Pacing Mode Configuration

Control how impressions are scheduled across your workers:

#### Human Mode (Recommended)
- **Description**: Spreads sessions over hours with random jitter
- **Pacing Hours**: 0.5 - 24 hours
- **Default**: 14 hours (recommended for realistic traffic)
- **Use Case**: When you need traffic to appear natural and human-like
- **Example**: 160,000 impressions over 14 hours = ~11,429 impressions/hour

#### Fast Mode
- **Description**: Schedules all impressions immediately
- **Pacing Hours**: N/A (not applicable)
- **Use Case**: When you need impressions completed quickly (testing, deadline-driven)

### 3. Timing Configuration

Configure wait times between actions:

#### Scroll Wait Times (milliseconds)
- **Min Scroll Wait**: Minimum time before scrolling on page
- **Max Scroll Wait**: Maximum time before scrolling
- **Default for Direct Link**: 0-0 (no scrolling needed for direct links)

#### Ad Page Wait Times (milliseconds)
- **Min Ad Wait**: Minimum time to spend on Adsterra page (default: 10,000ms = 10 seconds)
- **Max Ad Wait**: Maximum time on Adsterra page (default: 30,000ms = 30 seconds)
- **Use Case**: Simulate human-like viewing behavior

## Workflows

### Workflow 1: Setting Up Individual Worker Configuration

1. Navigate to **`http://localhost:3000/admin/workers`**
2. Select a worker from the list (e.g., `worker-0`)
3. Fill in the configuration:
   - **Smart Link URL** (required): Your unique Adsterra smart link
   - **Headless Browser**: Check if running without GUI
   - **Scroll Wait Times**: Set scroll behavior
   - **Ad Page Wait Times**: Set viewing duration
   - **Pacing Mode**: Choose Human (spread) or Fast (immediate)
   - **Pacing Hours** (if Human): 0.5-24 hours
   - **Distribution** (optional): Override global distribution or use defaults

4. Click **"💾 Save Configuration"**
5. Repeat for each worker (worker-0 through worker-14)

### Workflow 2: Creating a Run with Specific Distribution

1. Navigate to **`http://localhost:3000/adsterra`**
2. Select configuration mode:
   - **Template Mode**: Use pre-configured profit targets
   - **Custom Mode**: Set custom parameters

3. Fill in the run configuration:
   - **Adsterra Smart Link URL** (required)
   - **Total Bots**: Number of bot instances
   - **Sessions Per Bot**: Sessions per bot
   - **Target Impressions**: Target number of impressions

4. Configure pacing:
   - **Pacing Mode**: Human or Fast
   - **Pacing Hours** (if Human): How to spread impressions

5. Assign Workers (optional):
   - Select specific workers (e.g., worker-0, worker-1)
   - Leave empty for any worker to claim jobs

6. Configure Distribution (Traffic Distribution section):
   - **Countries**: Adjust percentages (must total 100%)
   - **Devices**: Adjust percentages (must total 100%)
   - **Browsers**: Adjust percentages (must total 100%)
   - **Live Preview**: See exact breakdown below configuration

7. Click **"🚀 Create Run"**

### Workflow 3: Inheriting Worker Configuration in Runs

When you assign specific workers to a run:

1. The run's global configuration is used as the **base**
2. Each worker's individual configuration **overrides** the base settings
3. Priority order:
   - **Worker-specific distribution** (if set) > Run distribution
   - **Worker-specific pacing** (if set) > Run pacing
   - **Worker-specific timing** (if set) > Run timing

## Database Schema

Worker configurations are stored in DynamoDB with the following structure:

```
Table: workers-config
Key: PK = "WORKER#<workerId>", SK = "CONFIG"

Attributes:
- workerId: string (e.g., "worker-0")
- adsterraUrl: string (required)
- browserHeadless: boolean (optional, default: true)
- minScrollWait: number (optional)
- maxScrollWait: number (optional)
- minAdWait: number (optional)
- maxAdWait: number (optional)
- pacingMode: 'human' | 'fast' (optional, default: 'human')
- pacingHours: number (optional, default: 14)
- distribution: {
    countries: Record<string, number>,
    devices: Record<string, number>,
    browsers: Record<string, number>
  } (optional)
- createdAt: string (ISO timestamp)
- updatedAt: string (ISO timestamp)
```

## API Endpoints

### Get All Worker Configs
```
GET /api/admin/workers
Response: WorkerConfig[]
```

### Get Single Worker Config
```
GET /api/admin/workers/[workerId]/config
Response: WorkerConfig
```

### Create/Update Worker Config
```
PUT /api/admin/workers/[workerId]/config
Body: Partial<WorkerConfig>
Response: WorkerConfig
```

### Delete Worker Config
```
DELETE /api/admin/workers/[workerId]/config
Response: { message: string }
```

## Best Practices

### 1. Distribution Settings
- **Ensure percentages sum to 100%**: The system will alert you if they don't
- **Match real traffic patterns**: Adjust distribution to match your target audience
- **Test with small runs first**: Create test runs to validate distribution before running large campaigns

### 2. Pacing Configuration
- **Human Mode**: Use 12-16 hours for most campaigns (realistic traffic spreading)
- **Fast Mode**: Use only for testing or time-sensitive campaigns
- **Jitter**: Human mode includes random jitter to avoid predictable patterns

### 3. Timing Configuration
- **Ad Wait Times**: 10-30 seconds is realistic for human behavior
- **Scroll Wait Times**: For direct links, keep at 0-0ms
- **Different workers, different timings**: Can set unique timings per worker for variation

### 4. Worker Assignment
- **Assign specific workers** when you need predictable distribution
- **Leave unassigned** when you want load balancing across all workers
- **Mix and match**: Create multiple runs with different worker assignments

## Troubleshooting

### Distribution doesn't save
- **Check**: Are all percentages positive and summing to 100%?
- **Solution**: Use the "Add Custom Distribution" button to start fresh

### Pacing hours field not visible
- **Reason**: You have "Fast" mode selected
- **Solution**: Switch to "Human" mode to configure pacing hours

### Worker configuration not applied
- **Check**: Is the worker assigned to this run?
- **Check**: Did you save the worker configuration successfully (green checkmark)?
- **Solution**: Reload the page to ensure changes are persisted

### Percentages don't sum to 100%
- **Error**: System will display "❌" and won't let you create the run
- **Solution**: Adjust percentages until they total exactly 100%

## Examples

### Example 1: High-Traffic US-Focused Campaign

**Run Settings**:
- Target Impressions: 500,000
- Pacing Mode: Human
- Pacing Hours: 8 (fast delivery)

**Distribution**:
- Countries: US 80%, UK 15%, Canada 5%
- Devices: Mobile 85%, Desktop 15%
- Browsers: Safari 55%, Chrome 45%

### Example 2: Balanced Global Campaign

**Run Settings**:
- Target Impressions: 1,000,000
- Pacing Mode: Human
- Pacing Hours: 24 (full day delivery)

**Distribution**:
- Countries: US 40%, UK 20%, EU 20%, Rest 20%
- Devices: Mobile 70%, Tablet 15%, Desktop 15%
- Browsers: Safari 60%, Chrome 40%

### Example 3: Testing with Specific Workers

**Worker Assignment**: worker-0, worker-1, worker-2

**Worker-0 Config**:
- Distribution: US 100%
- Pacing: Fast mode

**Worker-1 Config**:
- Distribution: UK 100%
- Pacing: Human (14 hours)

**Worker-2 Config**:
- Distribution: EU 100%
- Pacing: Human (14 hours)

Result: Traffic split across workers with country-specific distribution

## Summary of Changes

This enhancement enables:

1. ✅ **Detailed worker configuration** in `/admin/workers` page
2. ✅ **Distribution settings** (countries, devices, browsers) per worker
3. ✅ **Pacing configuration** (human/fast mode with hours) per worker
4. ✅ **Timing controls** (scroll wait, ad wait) per worker
5. ✅ **Run-level distribution settings** in `/adsterra` page
6. ✅ **Worker assignment** when creating runs
7. ✅ **Configuration persistence** in DynamoDB

All these features work together to provide complete control over bot behavior and traffic distribution.
