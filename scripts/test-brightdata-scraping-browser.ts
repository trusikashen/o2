// @ts-nocheck
/**
 * Quick test: BrightData Scraping Browser (Browser API) via Playwright CDP.
 *
 * Usage:
 *   BRIGHTDATA_SBR_USERNAME=... BRIGHTDATA_SBR_PASSWORD=... npm run test:sbr
 *
 * Optional:
 *   BRIGHTDATA_SBR_COUNTRY=us
 *   SBR_SESSION_ID=someUniqueId   (forces a specific session via CDP command)
 *   KEEP_OPEN=true               (keeps the page open for manual inspection)
 *   KEEP_OPEN_MS=600000
 */
import 'dotenv/config';
import { chromium } from 'playwright';

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function nowIsoCompact() {
  // Example: 2025-12-17T13-04-55.123Z (safe for filenames on Windows)
  return new Date().toISOString().replace(/:/g, '-');
}

function makeSessionId(index: number, base?: string) {
  // Keep session IDs reasonably short but unique.
  // If base is provided, suffix with index. Else generate one.
  if (base && base.trim()) return `${base.trim()}-${index}`;
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36).slice(-8);
  return `sbr-${ts}-${index}-${rand}`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseDeviceListFromEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildDefaultDevicePool(mode: 'mixed' | 'desktop' | 'mobile' | 'tablet'): string[] {
  // These names follow BrightData's Emulation.setDevice list (as shown in their docs UI).
  // Keep it modest + common to reduce surprises.
  const mobile = [
    'iPhone X',
    'iPhone 12',
    'iPhone 13',
    'Pixel 2',
    'Pixel 4',
    'Galaxy S8',
    'Galaxy S9+',
  ];
  const mobileLandscape = mobile.map((d) => `${d} landscape`);
  const tablet = ['iPad', 'iPad landscape', 'iPad Pro', 'iPad Pro landscape', 'Galaxy Tab S4', 'Galaxy Tab S4 landscape'];

  // BrightData's Emulation.setDevice support varies by zone/account; we've seen
  // errors like "Cannot emulate device: Desktop Chrome/Edge". For desktop,
  // we rely on our normal desktop UA/viewport instead of Emulation.setDevice.
  if (mode === 'desktop') return [];
  if (mode === 'mobile') return [...mobile, ...mobileLandscape];
  if (mode === 'tablet') return tablet;

  // mixed
  return [...mobile, ...mobileLandscape, ...tablet];
}

type SessionResult = {
  index: number;
  sessionId: string;
  ok: boolean;
  durationMs: number;
  status?: number | null;
  finalUrl?: string;
  title?: string;
  error?: string;
};

function isInterestingHost(url: string, targetUrl: string) {
  try {
    const u = new URL(url);
    const t = new URL(targetUrl);
    // Log target host + common redirect destinations; keep it broad but not noisy.
    return u.hostname === t.hostname || u.hostname.endsWith('effectivegatecpm.com') || u.hostname.endsWith('adzilla.meme');
  } catch {
    return false;
  }
}

async function summarizeRedirectChain(finalResponse: any): Promise<
  Array<{
    url: string;
    method: string;
    status: number | null;
    location?: string;
  }>
> {
  // Build redirect chain via request.redirectedFrom()
  const chainRequests: any[] = [];
  let req: any = finalResponse?.request?.();
  while (req) {
    chainRequests.push(req);
    req = req.redirectedFrom?.();
  }
  chainRequests.reverse();

  const chain: Array<{ url: string; method: string; status: number | null; location?: string }> = [];
  for (const r of chainRequests) {
    const resp = await r.response?.();
    const status = resp?.status?.() ?? null;
    const headers = (resp?.headers?.() ?? {}) as Record<string, string>;
    const location = headers['location'];
    chain.push({
      url: r.url?.() ?? String(r.url),
      method: r.method?.() ?? 'GET',
      status,
      ...(location ? { location } : {}),
    });
  }
  return chain;
}

async function runOneSession(opts: {
  index: number;
  wsEndpoint: string;
  targetUrl: string;
  countryLabel: string;
  sessionId?: string;
  ipCheckUrl?: string;
  doIpCheck: boolean;
  emulateDevice: boolean;
  deviceMode: 'mixed' | 'desktop' | 'mobile' | 'tablet';
  deviceList: string[];
  keepOpen: boolean;
  keepOpenMs: number;
  enableResourceBlocking: boolean;
  navRetries: number;
  navBackoffMs: number;
  minWaitMs: number;
  maxWaitMs: number;
}): Promise<SessionResult> {
  const started = Date.now();
  const indexLabel = String(opts.index).padStart(4, '0');
  const sessionId = opts.sessionId || makeSessionId(opts.index);

  console.log(
    `[SBR ${indexLabel}] start sessionId=${sessionId} country=${opts.countryLabel} url=${opts.targetUrl}`
  );

  // BrightData SBR may enforce a very small navigation budget per page/session.
  // To ensure we only do ONE navigation per attempt, we:
  // - never navigate to an IP-check page
  // - do a single page.goto(targetUrl)
  // - if we need a retry, we create a brand new browser/context/page and try again.
  for (let attempt = 1; attempt <= Math.max(1, opts.navRetries); attempt++) {
    let browser: any = null;
    let context: any = null;
    try {
      browser = await chromium.connectOverCDP(opts.wsEndpoint);
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true,
      });

      const page = await context.newPage();
      page.setDefaultTimeout(45000);

      if (opts.enableResourceBlocking) {
        await page.route('**/*', (route) => {
          const request = route.request();
          const url = request.url();
          const resourceType = request.resourceType();

          if (resourceType === 'image') return route.abort();
          if (resourceType === 'font') return route.abort();

          if (
            resourceType === 'media' ||
            url.includes('.mp4') ||
            url.includes('.webm') ||
            url.includes('.avi') ||
            url.includes('.mov')
          ) {
            return route.abort();
          }

          const analyticsDomains = [
            'google-analytics.com',
            'googletagmanager.com',
            'analytics.google.com',
            'facebook.net',
            'facebook.com/tr',
            'twitter.com/i/adsct',
            'hotjar.com',
            'mixpanel.com',
            'segment.com',
            'amplitude.com',
            'heap.io',
            'fullstory.com',
            'mouseflow.com',
          ];
          if (analyticsDomains.some((d) => url.includes(d))) return route.abort();

          if (
            url.includes('facebook.com/plugins') ||
            url.includes('twitter.com/widgets') ||
            url.includes('instagram.com/embed')
          ) {
            return route.abort();
          }

          return route.continue();
        });
      }

      // BrightData-specific CDP command: bind a proxy session to this page.
      // IMPORTANT: If we retry, we MUST use a NEW proxy session (new IP), because
      // BrightData may enforce cooldowns like "Cannot navigate to this domain again".
      const attemptSessionId = attempt === 1 ? sessionId : `${sessionId}-r${attempt}-${Date.now().toString(36).slice(-4)}`;
      try {
        const client = await page.context().newCDPSession(page);
        await client.send('Proxy.useSession', { sessionId: attemptSessionId });
      } catch {
        // Not fatal; some setups might not support it.
      }

      // Optional: randomize device (desktop/mobile/tablet) via BrightData CDP command.
      if (opts.emulateDevice) {
        const pool = opts.deviceList.length
          ? opts.deviceList
          : buildDefaultDevicePool(opts.deviceMode);
        if (pool.length === 0) {
          console.log(`[SBR ${indexLabel}] device=desktop (default UA/viewport)`);
        } else {
          const device = pickRandom(pool);
          try {
            const client = await page.context().newCDPSession(page);
            await client.send('Emulation.setDevice', { device });
            console.log(`[SBR ${indexLabel}] device=${device}`);
          } catch (e: any) {
            console.log(`[SBR ${indexLabel}] device emulation failed: ${String(e?.message || e)}`);
          }
        }
      }

      // Capture redirect/document responses for debugging SmartLink behavior.
      // This does NOT add navigations; it only logs response metadata.
      const docEvents: Array<{ status: number; url: string; location?: string }> = [];
      const onResponse = (res: any) => {
        try {
          const req = res.request?.();
          if (req?.resourceType?.() !== 'document') return;
          const url = res.url?.() ?? '';
          if (!isInterestingHost(url, opts.targetUrl)) return;
          const status = res.status?.() ?? 0;
          const headers = (res.headers?.() ?? {}) as Record<string, string>;
          const location = headers['location'];
          docEvents.push({ status, url, ...(location ? { location } : {}) });
        } catch {
          // ignore
        }
      };
      page.on('response', onResponse);

      // ONE navigation (the only page.goto in the whole attempt)
      const resp = await page.goto(opts.targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      const status = resp?.status?.() ?? null;
      const finalUrl = page.url();
      const title = await page.title();

      // Print a compact redirect chain summary for the main document.
      try {
        const chain = await summarizeRedirectChain(resp);
        if (chain.length > 0) {
          console.log(`[SBR ${indexLabel}] redirect chain (${chain.length})`);
          for (const hop of chain) {
            const loc = hop.location ? ` -> ${hop.location}` : '';
            console.log(`[SBR ${indexLabel}]   ${hop.status ?? 'N/A'} ${hop.method} ${hop.url}${loc}`);
          }
        }
      } catch (e: any) {
        console.log(`[SBR ${indexLabel}] redirect chain failed: ${String(e?.message || e)}`);
      }

      // Also log any document responses we saw during navigation.
      if (docEvents.length) {
        console.log(`[SBR ${indexLabel}] document responses seen=${docEvents.length}`);
        for (const ev of docEvents) {
          console.log(
            `[SBR ${indexLabel}]   ${ev.status} ${ev.url}${ev.location ? ` -> ${ev.location}` : ''}`
          );
        }
      }
      page.off('response', onResponse);

      // Optional: IP check via fetch() from within the already-loaded page.
      // This does NOT perform an additional navigation.
      if (opts.doIpCheck) {
        const ipUrl =
          opts.ipCheckUrl ||
          'https://geo.brdtest.com/welcome.txt?product=resi&method=native';
        try {
          const txt = await page.evaluate(async (u) => {
            const r = await fetch(u, { cache: 'no-store' });
            return await r.text();
          }, ipUrl);
          // Many BrightData endpoints return plain text; just log a short preview.
          console.log(`[SBR ${indexLabel}] ipCheck(fetch) ok preview=${JSON.stringify(txt.slice(0, 120))}`);
        } catch (e: any) {
          console.log(`[SBR ${indexLabel}] ipCheck(fetch) failed: ${String(e?.message || e)}`);
        }
      }

      const waitMs = Math.floor(
        opts.minWaitMs + Math.random() * Math.max(1, opts.maxWaitMs - opts.minWaitMs)
      );
      console.log(`[SBR ${indexLabel}] status=${status} waitingMs=${waitMs} finalUrl=${finalUrl}`);
      await page.waitForTimeout(waitMs);

      if (opts.keepOpen) {
        console.log(`[SBR ${indexLabel}] keepOpenMs=${opts.keepOpenMs}`);
        await page.waitForTimeout(opts.keepOpenMs);
      }

      return {
        index: opts.index,
        sessionId,
        ok: true,
        durationMs: Date.now() - started,
        status,
        finalUrl,
        title,
      };
    } catch (e: any) {
      const msg = String(e?.message || e);
      const retryable =
        msg.includes('ERR_SSL_PROTOCOL_ERROR') ||
        msg.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') ||
        msg.includes('ERR_TIMED_OUT') ||
        msg.includes('ERR_CONNECTION') ||
        msg.includes('ERR_PROXY') ||
        msg.includes('Timeout') ||
        msg.includes('Page.navigate limit reached');

      console.log(
        `[SBR ${indexLabel}] attempt=${attempt}/${Math.max(1, opts.navRetries)} error: ${msg}`
      );

      if (!retryable || attempt === Math.max(1, opts.navRetries)) {
        return {
          index: opts.index,
          sessionId,
          ok: false,
          durationMs: Date.now() - started,
          error: msg,
        };
      }

      const backoff = opts.navBackoffMs * attempt;
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      try {
        if (context) await context.close();
      } catch {}
      try {
        if (browser) await browser.close();
      } catch {}
    }
  }

  // Unreachable, but TS likes a return.
  return {
    index: opts.index,
    sessionId,
    ok: false,
    durationMs: Date.now() - started,
    error: 'Unknown error',
  };
}

async function main() {
  const usernameBase = must('BRIGHTDATA_SBR_USERNAME');
  const password = must('BRIGHTDATA_SBR_PASSWORD');
  const country = (process.env.BRIGHTDATA_SBR_COUNTRY || '').trim();

  const keepOpen = (process.env.KEEP_OPEN || 'false') === 'true';
  const keepOpenMs = parseInt(process.env.KEEP_OPEN_MS || '600000', 10);

  const targetUrl =
    process.env.TEST_ADSTERRA_URL ||
    'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221';

  const username = country ? `${usernameBase}-country-${country}` : usernameBase;
  const wsEndpoint = `wss://${encodeURIComponent(username)}:${encodeURIComponent(
    password
  )}@brd.superproxy.io:9222`;

  // Batch controls
  const runs = parseInt(process.env.SBR_RUNS || '1', 10);
  const concurrency = Math.max(1, parseInt(process.env.SBR_CONCURRENCY || '1', 10));
  const baseSessionId = (process.env.SBR_SESSION_ID || '').trim(); // if set, becomes prefix for batch
  const outputJsonl = (process.env.SBR_OUTPUT_JSONL || '').trim(); // optional file path

  const enableResourceBlocking = (process.env.SBR_RESOURCE_BLOCKING || 'true') === 'true';
  const doIpCheck = (process.env.SBR_IP_CHECK || 'true') === 'true';
  const ipCheckUrl = (process.env.SBR_IP_CHECK_URL || '').trim();
  const emulateDevice = (process.env.SBR_EMULATE_DEVICE || 'true') === 'true';
  const deviceModeRaw = (process.env.SBR_DEVICE_MODE || 'mixed').toLowerCase().trim();
  const deviceMode =
    deviceModeRaw === 'desktop' || deviceModeRaw === 'mobile' || deviceModeRaw === 'tablet'
      ? (deviceModeRaw as 'desktop' | 'mobile' | 'tablet')
      : ('mixed' as const);
  const deviceList = parseDeviceListFromEnv(process.env.SBR_DEVICE_LIST);
  const navRetries = parseInt(process.env.NAV_RETRIES || '3', 10);
  const navBackoffMs = parseInt(process.env.NAV_BACKOFF_MS || '1500', 10);
  const minWaitMs = parseInt(process.env.MIN_AD_WAIT || '30000', 10);
  const maxWaitMs = parseInt(process.env.MAX_AD_WAIT || '60000', 10);

  console.log('\n' + '='.repeat(70));
  console.log('BrightData Scraping Browser (SBR) Test');
  console.log('='.repeat(70));
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Country: ${country || '(default)'}`);
  console.log(`Runs: ${runs}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`SessionId base: ${baseSessionId || '(auto)'}`);
  console.log(`Resource blocking: ${enableResourceBlocking ? 'enabled' : 'disabled'}`);
  console.log(`IP check: ${doIpCheck ? 'enabled' : 'disabled'}`);
  console.log(
    `Device emulation: ${emulateDevice ? `enabled (${deviceList.length ? 'custom list' : deviceMode})` : 'disabled'}`
  );
  console.log(`Output JSONL: ${outputJsonl || '(none)'}`);
  console.log(`Endpoint: wss://<username>:<password>@brd.superproxy.io:9222`);
  console.log('='.repeat(70) + '\n');

  const fs = await import('node:fs');
  const outPath =
    outputJsonl ||
    (runs > 1 ? `sbr-results-${nowIsoCompact()}.jsonl` : '');
  if (outPath) {
    fs.writeFileSync(outPath, '', { encoding: 'utf8' });
  }

  let nextIndex = 1;
  let okCount = 0;
  let failCount = 0;
  let lastIp: string | null = null;

  const workers = Array.from({ length: Math.min(concurrency, runs) }, async () => {
    while (true) {
      const i = nextIndex++;
      if (i > runs) return;

      const res = await runOneSession({
        index: i,
        wsEndpoint,
        targetUrl,
        countryLabel: country || '(default)',
        sessionId: makeSessionId(i, baseSessionId || undefined),
        doIpCheck,
        ipCheckUrl: ipCheckUrl || undefined,
        emulateDevice,
        deviceMode,
        deviceList,
        keepOpen,
        keepOpenMs,
        enableResourceBlocking,
        navRetries,
        navBackoffMs,
        minWaitMs,
        maxWaitMs,
      });

      if (res.ok) okCount++;
      else failCount++;

      // Update lastIp if present in JSONL output; we don't currently store it in SessionResult,
      // but we can parse it from console output if needed. For now, keep a simple "sticky" heuristic:
      // when SBR_IP_CHECK is enabled, users will see the IPs in logs.
      // (We keep lastIp null to avoid false assumptions.)

      if (outPath) {
        fs.appendFileSync(outPath, JSON.stringify(res) + '\n', { encoding: 'utf8' });
      }

      const done = okCount + failCount;
      if (done % 10 === 0 || done === runs) {
        console.log(`[SBR] progress ${done}/${runs} ok=${okCount} fail=${failCount}`);
      }
    }
  });

  await Promise.all(workers);

  console.log('\n' + '='.repeat(70));
  console.log(`[SBR] complete runs=${runs} ok=${okCount} fail=${failCount}`);
  if (outPath) console.log(`[SBR] results written to ${outPath}`);
  console.log('='.repeat(70) + '\n');
}

main().catch((err) => {
  console.error('❌ SBR test failed:', err?.message || err);
  process.exit(1);
});



