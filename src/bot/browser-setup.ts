/**
 * Advanced Browser Anti-Detection Setup
 * 
 * Implements 4 anti-detection measures:
 * 🔥 CRITICAL (must have):
 *   1. WebRTC leak prevention - blocks real IP exposure (via --disable-webrtc flag)
 *   2. Canvas fingerprint randomization - prevents tracking
 * 
 * 🟡 RECOMMENDED (nice to have):
 *   3. WebGL spoofing - randomizes GPU fingerprint
 *   4. Enhanced Navigator spoofing - realistic device properties
 * 
 * NOTE: Some overrides (like WebRTC) are better handled via chromium launch flags
 * rather than addInitScript, which runs after native objects are already initialized.
 */

import { Page } from 'playwright';
import type { DeviceConfig } from '../config/devices';

// ============================================================================
// 🔥 CRITICAL #1: WebRTC Leak Prevention
// ============================================================================
// WebRTC IP leak is prevented via --disable-webrtc chromium flag
// However, we still try to override in JavaScript as defense-in-depth

export async function blockWebRTCLeaks(page: Page): Promise<void> {
  try {
    await page.addInitScript(() => {
      // Best effort to block WebRTC via JavaScript
      // The --disable-webrtc flag should prevent actual leaks at the OS level
      try {
        // Attempt to throw on any WebRTC object access
        (window as any).RTCPeerConnection = function() {
          throw new Error('WebRTC is disabled');
        };
        (window as any).webkitRTCPeerConnection = function() {
          throw new Error('WebRTC is disabled');
        };
        (window as any).mozRTCPeerConnection = function() {
          throw new Error('WebRTC is disabled');
        };
        
        // Also block AudioContext (used for fingerprinting)
        (window as any).AudioContext = function() {
          throw new Error('AudioContext is disabled');
        };
        (window as any).webkitAudioContext = function() {
          throw new Error('AudioContext is disabled');
        };
        
        // Block OfflineAudioContext
        (window as any).OfflineAudioContext = function() {
          throw new Error('OfflineAudioContext is disabled');
        };
        (window as any).webkitOfflineAudioContext = function() {
          throw new Error('OfflineAudioContext is disabled');
        };
      } catch (e) {
        // Some properties might be read-only
      }
      
      // Block media device enumeration
      if (navigator.mediaDevices) {
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async () => {
          throw new Error('getUserMedia is denied');
        };
      }
    });
  } catch (error: any) {
    console.warn(`⚠️  Failed to apply WebRTC blocking script: ${error.message?.substring(0, 100)}`);
  }
}

// ============================================================================
// 🔥 CRITICAL #2: Canvas Fingerprint Randomization
// ============================================================================
// Canvas drawing produces unique fingerprint for each browser.
// Without randomization, all 1000 bots will be identical!
// Randomization must be CONSISTENT within one session
// (so anti-fraud doesn't see different values for same bot).

export async function randomizeCanvasFingerprint(page: Page, deviceSeed: string): Promise<void> {
  try {
    // Create stable seed from deviceId
    const seedValue = parseFloat(
      `0.${deviceSeed
        .split('')
        .reduce((sum, char) => sum + char.charCodeAt(0), 0)}`
    );
    
    await page.addInitScript((seed: number) => {
      // Noise range: -1 to +1
      const noise = Math.floor(seed * 2) - 1;
      
      // Store original before any hooks
      const OriginalCanvas = HTMLCanvasElement;
      const originalToDataURL = OriginalCanvas.prototype.toDataURL;
      const originalToBlob = OriginalCanvas.prototype.toBlob;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      
      // Hook canvas.toDataURL()
      HTMLCanvasElement.prototype.toDataURL = function(type?: string, ...args: any[]) {
        try {
          const ctx = this.getContext('2d');
          if (ctx && this.width > 0 && this.height > 0) {
            // Only modify if there's actual content
            try {
              const imageData = ctx.getImageData(0, 0, Math.min(this.width, 300), Math.min(this.height, 300));
              
              // Add consistent noise
              for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
                imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
                imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
              }
              
              ctx.putImageData(imageData, 0, 0);
            } catch (e) {
              // Ignore errors modifying image data
            }
          }
        } catch (e) {
          // Silently fail - some contexts might not support getImageData
        }
        
        return originalToDataURL.call(this, type, ...args);
      };
      
      // Hook canvas.toBlob()
      HTMLCanvasElement.prototype.toBlob = function(
        callback: BlobCallback,
        type?: string,
        ...args: any[]
      ) {
        try {
          // Use modified toDataURL
          const dataURL = this.toDataURL(type, ...args);
          
          // Convert data URL to blob
          if (dataURL.includes(',')) {
            const binary = atob(dataURL.split(',')[1]);
            const array = [];
            for (let i = 0; i < binary.length; i++) {
              array.push(binary.charCodeAt(i));
            }
            callback(new Blob([new Uint8Array(array)], { type: type || 'image/png' }));
          } else {
            // Fallback to original
            originalToBlob.call(this, callback, type, ...args);
          }
        } catch (e) {
          // Fallback to original
          originalToBlob.call(this, callback, type, ...args);
        }
      };
      
      // Hook getImageData to add noise
      CanvasRenderingContext2D.prototype.getImageData = function(
        sx: number,
        sy: number,
        sw: number,
        sh: number
      ) {
        const imageData = originalGetImageData.call(this, sx, sy, sw, sh);
        
        // Apply consistent noise
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
          imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
          imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
        }
        
        return imageData;
      };
    }, seedValue);
  } catch (error: any) {
    console.warn(`⚠️  Failed to randomize canvas fingerprint: ${error.message?.substring(0, 100)}`);
  }
}

// ============================================================================
// 🟡 RECOMMENDED #3: WebGL Fingerprint Randomization
// ============================================================================
// WebGL parameters (vendor, renderer) create unique GPU fingerprint.
// Anti-fraud can use this for tracking.
// Less critical than Canvas, but good to randomize.

export async function enableWebGLSpoofing(page: Page, deviceConfig: DeviceConfig): Promise<void> {
  try {
    await page.addInitScript((device: any) => {
      // WebGL vendors vary by device type and OS
      const vendors = device.isMobile 
        ? ['Qualcomm', 'ARM', 'MediaTek']
        : ['Intel Inc.', 'NVIDIA Corporation', 'AMD'];
      
      const renderers = device.isMobile
        ? ['Adreno (TM) 640', 'Adreno (TM) 650', 'Mali-G77 MP11']
        : ['Intel Iris OpenGL Engine', 'ANGLE (Intel HD Graphics)', 'AMD Radeon RX 5700'];
      
      // Pick consistent ones for this device
      const vendorIdx = Object.keys(device).join('').length % vendors.length;
      const rendererIdx = Object.keys(device).join('').length % renderers.length;
      
      const vendor = vendors[vendorIdx];
      const renderer = renderers[rendererIdx];
      
      // Hook WebGL 1.0 context
      const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
          return vendor;
        }
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
          return renderer;
        }
        // MAX_TEXTURE_SIZE - varies by device
        if (parameter === 3379) {
          return device.isMobile ? 8192 : 16384;
        }
        return originalGetParameter.call(this, parameter);
      };
      
      // Hook WebGL 2.0 context (if available)
      if ((window as any).WebGL2RenderingContext) {
        const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter: number) {
          if (parameter === 37445) return vendor;
          if (parameter === 37446) return renderer;
          if (parameter === 3379) return device.isMobile ? 8192 : 16384;
          return originalGetParameter2.call(this, parameter);
        };
      }
    }, deviceConfig);
  } catch (error: any) {
    console.warn(`⚠️  Failed to enable WebGL spoofing: ${error.message?.substring(0, 100)}`);
  }
}

// ============================================================================
// 🟡 RECOMMENDED #4: Enhanced Navigator Spoofing
// ============================================================================
// Spoof battery, permissions, network info for realistic device properties.

export async function enhancedNavigatorSpoofing(page: Page, deviceConfig: DeviceConfig): Promise<void> {
  try {
    await page.addInitScript((device: any) => {
      // ---- Battery API (mobile devices) ----
      if (device.isMobile && !(navigator as any).getBattery) {
        const batteryInfo = {
          charging: Math.random() > 0.3,
          chargingTime: Infinity,
          dischargingTime: 3600 + Math.random() * 7200,
          level: 0.3 + Math.random() * 0.6,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        };

        Object.defineProperty(navigator, 'getBattery', {
          value: async () => batteryInfo,
          writable: false,
          configurable: false,
        });
      }
      
      // ---- Ensure mediaDevices exists ----
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
          value: {
            getUserMedia: async () => {
              throw new Error('Permission denied');
            },
            enumerateDevices: async () => [],
            getDisplayMedia: async () => {
              throw new Error('Permission denied');
            },
          },
          writable: false,
          configurable: false,
        });
      }

      // ---- Permissions API ----
      if ((navigator as any).permissions) {
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = async (params: any): Promise<any> => {
          if (params.name === 'camera' || params.name === 'microphone') {
            return { state: 'denied' };
          }
          if (params.name === 'notifications') {
            return { state: Math.random() > 0.8 ? 'granted' : 'denied' };
          }
          if (params.name === 'geolocation') {
            return { state: Math.random() > 0.5 ? 'granted' : 'denied' };
          }
          if (params.name === 'clipboard-read' || params.name === 'clipboard-write') {
            return { state: Math.random() > 0.3 ? 'granted' : 'denied' };
          }
          return originalQuery.call(navigator.permissions, params);
        };
      }
      
      // ---- Network Information API (mobile) ----
      if (device.isMobile) {
        const effectiveTypes = ['3g', '4g', '4g'];
        const connectionInfo = {
          effectiveType: effectiveTypes[Math.floor(Math.random() * effectiveTypes.length)],
          rtt: 50 + Math.random() * 100,
          downlink: 5 + Math.random() * 20,
          saveData: false,
        };
        
        Object.defineProperty(navigator, 'connection', {
          configurable: true,
          get: () => connectionInfo,
        });
      }
      
      // ---- Device Memory ----
      const memoryValues = device.isMobile ? [2, 4, 6, 8] : [8, 16];
      const randomMemory = memoryValues[Math.floor(Math.random() * memoryValues.length)];
      
      Object.defineProperty(navigator, 'deviceMemory', {
        configurable: true,
        get: () => randomMemory,
      });
      
      // ---- Keyboard Information API ----
      if ((navigator as any).keyboard) {
        const layouts = device.isMobile 
          ? ['en-US', 'en-GB']
          : ['en-US', 'en-GB', 'fr-FR', 'de-DE'];
        
        const randomLayout = layouts[Math.floor(Math.random() * layouts.length)];
        const originalGetLayoutMap = (navigator as any).keyboard.getLayoutMap;
        (navigator as any).keyboard.getLayoutMap = async () => {
          return new Map([['KeyA', randomLayout]]);
        };
      }
    }, deviceConfig);
  } catch (error: any) {
    console.warn(`⚠️  Failed to apply enhanced navigator spoofing: ${error.message?.substring(0, 100)}`);
  }
}

// ============================================================================
// Master Setup Function - Apply All Protections
// ============================================================================
// Call this after page is created but before any navigation!

export async function setupBrowserAntiDetection(
  page: Page,
  deviceConfig: DeviceConfig,
  deviceSeed: string
): Promise<void> {
  console.log(`   🛡️  Setting up advanced anti-detection measures...`);
  
  try {
    // 🔥 CRITICAL: Block WebRTC leaks first (most dangerous!)
    console.log(`     ✅ Blocking WebRTC leaks...`);
    await blockWebRTCLeaks(page);
    
    // 🔥 CRITICAL: Randomize canvas fingerprint
    console.log(`     ✅ Randomizing canvas fingerprint...`);
    await randomizeCanvasFingerprint(page, deviceSeed);
    
    // 🟡 RECOMMENDED: WebGL spoofing
    console.log(`     ✅ Spoofing WebGL parameters...`);
    await enableWebGLSpoofing(page, deviceConfig);
    
    // 🟡 RECOMMENDED: Enhanced navigator spoofing
    console.log(`     ✅ Applying navigator spoofing...`);
    await enhancedNavigatorSpoofing(page, deviceConfig);
    
    console.log(`   🛡️  Anti-detection setup complete!`);
  } catch (error: any) {
    console.error(`   ❌ Anti-detection setup failed: ${error.message?.substring(0, 100)}`);
    throw error;
  }
}
