/**
 * Enhanced Mobile Interactions Module - Anti-Fraud Resistant
 * Simulates realistic human mobile behavior with biometric patterns
 * Duration: 10-30 seconds total
 */

import { Page } from 'playwright';
import { sleep, addJitter } from '../utils/helpers';

interface UserBiometrics {
  reactionTime: number;      // 150-350ms base reaction
  swipeSpeed: number;        // 0.5-2.0 multiplier
  accuracy: number;          // 0.7-1.0 (1.0 = perfect)
  tremor: number;            // 0-5px hand tremor
  fatigue: number;           // 0-1 increases over session
  preferredDirections: string[]; // frequently used swipes
  errorRate: number;         // 0.05-0.15 chance of mistakes
}

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
  pressure?: number;
}

interface InteractionContext {
  lastAction: number;
  activityBursts: number;
  idlePeriods: number;
  totalInteractions: number;
}

/**
 * Generate unique user biometric profile
 */
function generateUserBiometrics(rng: () => number): UserBiometrics {
  const profiles = [
    // Young/fast user
    { reactionTime: 150 + rng() * 50, swipeSpeed: 1.5 + rng() * 0.5, accuracy: 0.85 + rng() * 0.1 },
    // Average user
    { reactionTime: 200 + rng() * 80, swipeSpeed: 0.8 + rng() * 0.6, accuracy: 0.75 + rng() * 0.15 },
    // Older/careful user
    { reactionTime: 280 + rng() * 70, swipeSpeed: 0.5 + rng() * 0.4, accuracy: 0.7 + rng() * 0.2 },
  ];
  
  const profile = profiles[Math.floor(rng() * profiles.length)];
  
  return {
    ...profile,
    tremor: rng() * 3 + 1,
    fatigue: 0,
    preferredDirections: generatePreferredDirections(rng),
    errorRate: 0.05 + rng() * 0.1,
  };
}

function generatePreferredDirections(rng: () => number): string[] {
  const all = ['up', 'down', 'left', 'right'];
  // Users typically favor 2-3 directions
  const count = 2 + Math.floor(rng() * 2);
  return all.sort(() => rng() - 0.5).slice(0, count);
}

/**
 * Main simulation function with realistic human behavior
 * MINIMAL: Only 0-3 interactions on smartlink page
 */
export async function simulateRealisticMobileSwipes(
  page: Page,
  viewport: { width: number; height: number },
  sessionSeed: string,
  minSwipes: number = 0,
  maxSwipes: number = 3
): Promise<void> {
  const rng = () => Math.random();
  
  // Create unique user profile
  const biometrics = generateUserBiometrics(rng);
  const context: InteractionContext = {
    lastAction: Date.now(),
    activityBursts: 0,
    idlePeriods: 0,
    totalInteractions: 0,
  };
  
  // 30% chance to skip interactions entirely (realistic user behavior)
  if (rng() < 0.3) {
    console.log(`   📱 User didn't interact with page (scrolling only)`);
    return;
  }
  
  // Random 0-3 interactions only
  const swipeCount = minSwipes + Math.floor(rng() * (maxSwipes - minSwipes + 1));
  console.log(`   📱 Simulating ${swipeCount} minimal interactions (reaction=${Math.round(biometrics.reactionTime)}ms, accuracy=${biometrics.accuracy.toFixed(2)})`);

  // Try to find interactive elements on page
  const interactiveElements = await findInteractiveElements(page);
  
  for (let i = 0; i < swipeCount; i++) {
    // Increase fatigue over time
    biometrics.fatigue = Math.min(0.3, i / Math.max(1, swipeCount - 1) * 0.3);
    
    // No activity bursts - keep interactions minimal and natural
    const pauseBefore = addJitter(500 + rng() * 1500);
    
    await sleep(pauseBefore);
    
    // Decide action type with realistic distribution
    const actionType = determineActionType(rng, context, biometrics);
    
    switch (actionType) {
      case 'swipe':
        await executeRealisticSwipe(page, viewport, biometrics, rng, interactiveElements);
        break;
      case 'tap':
        await executeRealisticTap(page, viewport, biometrics, rng, interactiveElements);
        break;
      case 'longpress':
        await executeRealisticLongPress(page, viewport, biometrics, rng);
        break;
      case 'error':
        // Skip errors on minimal interactions - too suspicious
        break;
    }
    
    context.totalInteractions++;
    context.lastAction = Date.now();
  }

  console.log(`   ✅ Page interactions complete: ${swipeCount} actions`);
}

/**
 * Find interactive elements on the page for contextual interactions
 */
async function findInteractiveElements(page: Page): Promise<Array<{ x: number; y: number; type: string }>> {
  try {
    const elements = await page.evaluate(() => {
      const selectors = [
        'button', 'a', '[role="button"]', '[onclick]',
        'input[type="submit"]', 'input[type="button"]',
        '[class*="card"]', '[class*="item"]'
      ];
      
      const found: Array<{ x: number; y: number; type: string }> = [];
      
      selectors.forEach(selector => {
        const els = document.querySelectorAll(selector);
        els.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            found.push({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              type: el.tagName.toLowerCase()
            });
          }
        });
      });
      
      return found.slice(0, 20); // Limit to 20 elements
    });
    
    return elements;
  } catch {
    return [];
  }
}

/**
 * Determine next action type based on realistic behavior patterns
 */
function determineActionType(
  rng: () => number,
  context: InteractionContext,
  biometrics: UserBiometrics
): 'swipe' | 'tap' | 'longpress' | 'error' {
  // Errors happen occasionally
  if (rng() < biometrics.errorRate) {
    return 'error';
  }
  
  // Activity bursts favor taps
  if (context.activityBursts > 0 && rng() < 0.6) {
    return 'tap';
  }
  
  const rand = rng();
  
  // Realistic distribution: swipe 60%, tap 30%, longpress 10%
  if (rand < 0.6) return 'swipe';
  if (rand < 0.9) return 'tap';
  return 'longpress';
}

/**
 * Execute realistic swipe with human imperfections
 */
async function executeRealisticSwipe(
  page: Page,
  viewport: { width: number; height: number },
  bio: UserBiometrics,
  rng: () => number,
  interactiveElements: Array<{ x: number; y: number; type: string }>
): Promise<void> {
  // Choose direction (favor preferred)
  const directions = ['up', 'down', 'left', 'right'];
  const direction = (rng() < 0.6 && bio.preferredDirections.length > 0)
    ? bio.preferredDirections[Math.floor(rng() * bio.preferredDirections.length)]
    : directions[Math.floor(rng() * 4)];

  // Sometimes swipe near interactive elements (scrolling content)
  let startX: number, startY: number;
  
  if (interactiveElements.length > 0 && rng() < 0.4) {
    const target = interactiveElements[Math.floor(rng() * interactiveElements.length)];
    startX = target.x + (rng() * 60 - 30);
    startY = target.y + (rng() * 60 - 30);
  } else {
    // Random position with safe margins
    if (direction === 'up' || direction === 'down') {
      startX = viewport.width * (0.3 + rng() * 0.4);
      startY = direction === 'up'
        ? viewport.height * (0.5 + rng() * 0.3)
        : viewport.height * (0.2 + rng() * 0.3);
    } else {
      startY = viewport.height * (0.3 + rng() * 0.4);
      startX = direction === 'left'
        ? viewport.width * (0.5 + rng() * 0.3)
        : viewport.width * (0.2 + rng() * 0.3);
    }
  }

  // Variable distance based on user speed
  const baseDistance = 100 + rng() * 250;
  const distance = baseDistance * bio.swipeSpeed;
  
  // Duration affected by speed and fatigue
  const baseDuration = 400 + rng() * 800;
  const duration = baseDuration / bio.swipeSpeed * (1 + bio.fatigue * 0.3);

  await executeSwipeWithHumanTouch(page, { direction, startX, startY, distance, duration }, bio, rng);
}

/**
 * Execute swipe with human-like imperfections
 */
async function executeSwipeWithHumanTouch(
  page: Page,
  params: { direction: string; startX: number; startY: number; distance: number; duration: number },
  bio: UserBiometrics,
  rng: () => number
): Promise<void> {
  const { direction, startX, startY, distance, duration } = params;
  
  const path: TouchPoint[] = [];
  
  // Calculate target endpoint
  let targetX = startX, targetY = startY;
  if (direction === 'up') targetY -= distance;
  else if (direction === 'down') targetY += distance;
  else if (direction === 'left') targetX -= distance;
  else targetX += distance;
  
  // Add accuracy error to endpoint
  const errorX = (rng() - 0.5) * 40 * (1 - bio.accuracy);
  const errorY = (rng() - 0.5) * 40 * (1 - bio.accuracy);
  targetX += errorX;
  targetY += errorY;
  
  // Generate realistic path with micro-corrections
  const steps = 15 + Math.floor(rng() * 25);
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    
    // Non-uniform easing (varies per swipe)
    const easeVariation = 2.5 + rng() * 1.5;
    const eased = 1 - Math.pow(1 - progress, easeVariation);
    
    let x = startX + (targetX - startX) * eased;
    let y = startY + (targetY - startY) * eased;
    
    // Add tremor (increases with fatigue)
    const tremorAmount = bio.tremor * (1 + bio.fatigue * 0.5);
    x += (rng() - 0.5) * tremorAmount * 2;
    y += (rng() - 0.5) * tremorAmount * 2;
    
    // Micro-corrections every few steps
    if (i > 0 && i % 5 === 0 && rng() < 0.4) {
      const correctionX = (rng() - 0.5) * 15;
      const correctionY = (rng() - 0.5) * 15;
      x += correctionX;
      y += correctionY;
    }
    
    path.push({ x, y, timestamp: Date.now(), pressure: 0.5 + rng() * 0.3 });
  }
  
  // Execute the swipe
  await page.touchscreen.tap(path[0].x, path[0].y);
  await sleep(bio.reactionTime / 3 + rng() * 50);
  
  for (let i = 1; i < path.length; i++) {
    await page.mouse.move(path[i].x, path[i].y);
    
    // Variable speed throughout swipe
    const stepDelay = (duration / steps) * (0.7 + rng() * 0.6);
    await sleep(stepDelay);
  }
  
  await page.mouse.up();
  
  console.log(`   👆 Swipe ${direction}: ${Math.round(distance)}px in ${Math.round(duration)}ms`);
}

/**
 * Execute realistic tap with occasional misses
 */
async function executeRealisticTap(
  page: Page,
  viewport: { width: number; height: number },
  bio: UserBiometrics,
  rng: () => number,
  interactiveElements: Array<{ x: number; y: number; type: string }>
): Promise<void> {
  let x: number, y: number;
  
  // 60% chance to tap near an interactive element
  if (interactiveElements.length > 0 && rng() < 0.6) {
    const target = interactiveElements[Math.floor(rng() * interactiveElements.length)];
    
    // Add inaccuracy
    const spread = 20 * (1 - bio.accuracy);
    x = target.x + (rng() - 0.5) * spread;
    y = target.y + (rng() - 0.5) * spread;
    
    console.log(`   👆 Tap on element at (${Math.round(x)}, ${Math.round(y)})`);
  } else {
    // Random tap
    x = viewport.width * (0.2 + rng() * 0.6);
    y = viewport.height * (0.2 + rng() * 0.6);
    
    console.log(`   👆 Tap at (${Math.round(x)}, ${Math.round(y)})`);
  }
  
  // Reaction time before tap
  await sleep(bio.reactionTime + rng() * 100);
  
  await page.touchscreen.tap(x, y);
  
  // Brief pause after tap
  await sleep(addJitter(150 + rng() * 300));
}

/**
 * Execute realistic long press
 */
async function executeRealisticLongPress(
  page: Page,
  viewport: { width: number; height: number },
  bio: UserBiometrics,
  rng: () => number
): Promise<void> {
  const x = viewport.width * (0.25 + rng() * 0.5);
  const y = viewport.height * (0.25 + rng() * 0.5);
  
  console.log(`   🫳 Long press at (${Math.round(x)}, ${Math.round(y)})`);
  
  await sleep(bio.reactionTime);
  
  await page.mouse.move(x, y);
  await page.mouse.down();
  
  // Variable hold duration
  const holdDuration = 600 + rng() * 800 + bio.fatigue * 500;
  await sleep(holdDuration);
  
  await page.mouse.up();
  await sleep(addJitter(300 + rng() * 400));
}

/**
 * Execute error action (tap miss, wrong swipe, correction)
 */
async function executeErrorAction(
  page: Page,
  viewport: { width: number; height: number },
  bio: UserBiometrics,
  rng: () => number
): Promise<void> {
  const errorTypes = ['miss_tap', 'wrong_swipe', 'double_tap'];
  const errorType = errorTypes[Math.floor(rng() * errorTypes.length)];
  
  switch (errorType) {
    case 'miss_tap':
      // Tap, realize mistake, tap again nearby
      const x1 = viewport.width * (0.3 + rng() * 0.4);
      const y1 = viewport.height * (0.3 + rng() * 0.4);
      
      console.log(`   ❌ Missed tap, correcting...`);
      await page.touchscreen.tap(x1, y1);
      await sleep(bio.reactionTime * 1.5); // Realize error
      
      // Correction tap
      const x2 = x1 + (rng() - 0.5) * 60;
      const y2 = y1 + (rng() - 0.5) * 60;
      await page.touchscreen.tap(x2, y2);
      await sleep(addJitter(400 + rng() * 400));
      break;
      
    case 'wrong_swipe':
      // Start swipe, stop, swipe in different direction
      console.log(`   ❌ Wrong swipe, correcting...`);
      const sx = viewport.width * 0.5;
      const sy = viewport.height * 0.5;
      
      await page.touchscreen.tap(sx, sy);
      await sleep(100);
      await page.mouse.move(sx + 30, sy + 30);
      await page.mouse.up(); // Stop
      
      await sleep(bio.reactionTime * 2); // Pause
      
      // Correct swipe
      await page.touchscreen.tap(sx, sy);
      await sleep(100);
      await page.mouse.move(sx - 100, sy);
      await page.mouse.up();
      await sleep(addJitter(300 + rng() * 400));
      break;
      
    case 'double_tap':
      // Accidental double tap
      console.log(`   ❌ Accidental double tap`);
      const dx = viewport.width * (0.3 + rng() * 0.4);
      const dy = viewport.height * (0.3 + rng() * 0.4);
      
      await page.touchscreen.tap(dx, dy);
      await sleep(80 + rng() * 120); // Very short interval
      await page.touchscreen.tap(dx + (rng() - 0.5) * 10, dy + (rng() - 0.5) * 10);
      await sleep(addJitter(500 + rng() * 500));
      break;
  }
}
