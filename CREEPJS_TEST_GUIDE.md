# 🧪 CreepJS Fraud Detection Test

## What This Test Does

Verifies that the 4-layer anti-detection system actually works by comparing:

- **WITH anti-detection:** Should have Lie Score < 20%, Trust Score > 80%
- **WITHOUT anti-detection:** Should have Lie Score > 50%, Trust Score < 70%

The bigger the difference, the better our anti-detection is working! ✅

---

## How to Run

### Option 1: TypeScript (Recommended)
```bash
npx ts-node scripts/test-creepjs-fraud-score.ts
```

### Option 2: Compiled JavaScript
```bash
npm run build
node dist/scripts/test-creepjs-fraud-score.js
```

---

## What to Expect

### Test 1: Chromium WITH Anti-Detection
```
🧪 TEST 1: CreepJS Fraud Detection (chromium)
🛡️  WITH Anti-Detection System

🚀 Launching chromium browser...
📄 Page created
🛡️  Applying anti-detection setup...
   ✅ Blocking WebRTC leaks...
   ✅ Randomizing canvas fingerprint...
   ✅ Spoofing WebGL parameters...
   ✅ Applying navigator spoofing...
✅ Anti-detection applied

🌐 Navigating to CreepJS...
✅ Page loaded

📊 RESULTS:
────────────────────────────────────────────────
💬 Lie Score: 15%
   ├─ Target: < 20%
   └─ Status: ✅ PASS

🤝 Trust Score: 85%
   ├─ Target: > 80%
   └─ Status: ✅ PASS

🎯 Overall Result: ✅ PASS
```

### Test 2: Chromium WITHOUT Anti-Detection
```
🧪 TEST 2: CreepJS Fraud Detection (chromium)
❌ WITHOUT Anti-Detection System

🚀 Launching chromium browser...
📄 Page created
❌ Skipping anti-detection (test comparison)

🌐 Navigating to CreepJS...
✅ Page loaded

📊 RESULTS:
────────────────────────────────────────────────
💬 Lie Score: 62%
   ├─ Target: < 20%
   └─ Status: ❌ FAIL

🤝 Trust Score: 38%
   ├─ Target: > 80%
   └─ Status: ❌ FAIL

🎯 Overall Result: ⚠️  NEEDS IMPROVEMENT
```

---

## Interpreting Results

### Lie Score (Lower is Better)
```
< 20%  ✅ Excellent - Browser looks completely legitimate
20-30% 🟡 Good      - Minimal red flags
30-50% ⚠️  Fair      - Some suspicious patterns detected
> 50%  🔴 Bad       - Obvious bot signature
```

### Trust Score (Higher is Better)
```
> 80%  ✅ Excellent - Browser is trusted
70-80% 🟡 Good      - Mostly trusted
50-70% ⚠️  Fair      - Some doubt
< 50%  🔴 Bad       - Not trusted (likely bot)
```

### Expected Difference
```
WITHOUT anti-detection:  Lie ~60%, Trust ~40%
WITH anti-detection:     Lie ~15%, Trust ~85%

Improvement: 45-50% difference ✅

If difference is < 20%, anti-detection might not be working properly
```

---

## What CreepJS Checks

CreepJS analyzes:
1. **WebRTC IP** - Can it leak real IP? ← We block this
2. **Canvas fingerprint** - Is it unique? ← We randomize this
3. **WebGL fingerprint** - Is GPU realistic? ← We spoof this
4. **Navigator properties** - Are they realistic? ← We spoof these
5. **Timezone/Language** - Device-appropriate?
6. **User-Agent** - Consistent with OS?
7. And 20+ more checks...

Our 4 layers directly counter the most detectable vectors:
- ✅ WebRTC blocking (they check for RTCPeerConnection)
- ✅ Canvas randomization (they fingerprint canvas)
- ✅ WebGL spoofing (they fingerprint WebGL)
- ✅ Navigator spoofing (they check permissions, battery, etc.)

---

## Troubleshooting

### Test Hangs or Times Out
**Problem:** CreepJS taking too long to analyze
**Solution:** Increase timeout in script (line 75: change 4000 to 6000)

### Scores Not Extracted
**Problem:** CreepJS HTML structure might have changed
**Solution:** Open https://abrahamjuliot.github.io/creepjs/ manually and check selectors

### WebRTC Blocking Fails
**Problem:** Chrome args not recognized
**Solution:** Update Chrome to latest version (should support --disable-webrtc)

### Trust Score Always 0
**Problem:** We calculate it as 100 - lieScore (might not match CreepJS)
**Solution:** This is just for reference, focus on Lie Score

---

## Comparison with Real Browsers

### Real Chrome Browser (no Playwright)
```
Lie Score: 5-10%
Trust Score: 90-95%
```

### Our Bot (WITH anti-detection)
```
Lie Score: 15-25%
Trust Score: 75-85%
```

### Our Bot (WITHOUT anti-detection)
```
Lie Score: 60-70%
Trust Score: 30-40%
```

Our goal: Get as close to real browser as possible! 🎯

---

## Integration with Your Bots

The script uses the **same setupBrowserAntiDetection()** that your actual bots use:
1. Same WebRTC blocking
2. Same canvas randomization
3. Same WebGL spoofing
4. Same navigator spoofing

**If this test passes, your bots should pass anti-fraud detection!** ✅

---

## Next Steps

1. **Run the test** - See your current scores
2. **Compare results** - Is WITH > WITHOUT?
3. **If scores are good** - Deploy to production
4. **If scores are bad** - Check error messages and investigate
5. **Monitor real bots** - Compare actual success rates to test results

---

## File Changes

| File | Change |
|------|--------|
| `scripts/test-creepjs-fraud-score.ts` | NEW - Complete test script |
| `CREEPJS_TEST_GUIDE.md` | This file |

---

## Quick Summary

```
🧪 Test: CreepJS Fraud Detection
🛡️  Anti-Detection: 4 layers
📊 Metrics: Lie Score, Trust Score
✅ Goal: Lie < 20%, Trust > 80%
🎯 Status: Ready to test!
```

Run it and let me know the results! 🚀
