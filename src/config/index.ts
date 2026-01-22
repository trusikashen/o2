import dotenv from 'dotenv';
import { IPRoyalConfig, DataImpulseConfig, BrightDataConfig, BotConfig } from '../types';

dotenv.config();

// Proxy provider selection: 'iproyal', 'dataimpulse', or 'brightdata'
export const PROXY_PROVIDER = (process.env.PROXY_PROVIDER || 'brightdata').toLowerCase();

export const ipRoyalConfig: IPRoyalConfig = {
  server: process.env.IPROYAL_SERVER || 'us9.4g.iproyal.com',
  httpsPort: parseInt(process.env.IPROYAL_HTTPS_PORT || '7606', 10),
  socks5Port: parseInt(process.env.IPROYAL_SOCKS5_PORT || '3606', 10),
  username: process.env.IPROYAL_USERNAME || '3DboxVh',
  password: process.env.IPROYAL_PASSWORD || 'LilI8x64t5cfMgI',
  apiKey: process.env.IPROYAL_API_KEY || 'cYbnmtMsOF',
  orderId: process.env.IPROYAL_ORDER_ID || '62939871',
};

export const dataImpulseConfig: DataImpulseConfig = {
  host: process.env.DATAIMPULSE_HOST || 'gw.dataimpulse.com',
  port: parseInt(process.env.DATAIMPULSE_PORT || '823', 10),
  username: process.env.DATAIMPULSE_USERNAME || '28a5d35662970ccf60af',
  password: process.env.DATAIMPULSE_PASSWORD || 'd5929267bca950ac',
  countryCode: process.env.DATAIMPULSE_COUNTRY_CODE || 'us', // e.g., 'us' for United States
};

export const brightDataConfig: BrightDataConfig = {
  host: process.env.BRIGHTDATA_HOST || 'brd.superproxy.io',
  port: parseInt(process.env.BRIGHTDATA_PORT || '33335', 10),
  username: process.env.BRIGHTDATA_USERNAME || 'brd-customer-hl_d4382b99-zone-mb',
  password: process.env.BRIGHTDATA_PASSWORD || 'ql1bol9csls1',
  zone: process.env.BRIGHTDATA_ZONE || 'mb', // Mobile proxy zone
};

export const botConfig: BotConfig = {
  totalBots: parseInt(process.env.TOTAL_BOTS || '16000', 10),
  sessionsPerBot: parseInt(process.env.SESSIONS_PER_BOT || '10', 10),
  targetImpressions: parseInt(process.env.TARGET_IMPRESSIONS || '160000', 10),
  blogHomepageUrl: process.env.BLOG_HOMEPAGE_URL || 'https://yoursite.com',
  smartLinkText: process.env.SMART_LINK_TEXT || 'Click here to make money with sport betting',
  adsterraSmartLink: process.env.ADSTERRA_SMART_LINK || 'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221', // Default smart link from .env
  browserHeadless: process.env.BROWSER_HEADLESS === 'true',
  browserTimeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
};

export const queueConfig = {
  pollInterval: parseInt(process.env.QUEUE_POLL_INTERVAL || '1000', 10), // How often to check for new jobs (ms)
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
};

export const timingConfig = {
  minScrollWait: parseInt(process.env.MIN_SCROLL_WAIT || '2000', 10),
  maxScrollWait: parseInt(process.env.MAX_SCROLL_WAIT || '5000', 10),
  minAdWait: parseInt(process.env.MIN_AD_WAIT || '10000', 10), // 10 seconds minimum
  maxAdWait: parseInt(process.env.MAX_AD_WAIT || '30000', 10), // 30 seconds maximum
};

export function getProxyServer(useSocks5 = false): string {
  if (PROXY_PROVIDER === 'brightdata') {
    // BrightData uses HTTP/HTTPS format: http://host:port
    return `http://${brightDataConfig.host}:${brightDataConfig.port}`;
  } else if (PROXY_PROVIDER === 'dataimpulse') {
    // DataImpulse uses HTTP/HTTPS format: http://host:port
    return `http://${dataImpulseConfig.host}:${dataImpulseConfig.port}`;
  } else {
    // IPRoyal
    if (useSocks5) {
      return `socks5://${ipRoyalConfig.server}:${ipRoyalConfig.socks5Port}`;
    }
    return `http://${ipRoyalConfig.server}:${ipRoyalConfig.httpsPort}`;
  }
}

export function getProxyUsername(sessionId?: string, country?: string): string {
  if (PROXY_PROVIDER === 'brightdata') {
    // BrightData Mobile Proxy: Can fit both session ID and country!
    // Format: username-session-<id>-country-XX
    // Mobile proxy base is shorter (32 chars) so we have 32 chars available
    // This allows: -session-<12char-id>-country-us = 32 chars (perfect fit!)
    //
    // STRATEGY: Use both session ID and country for mobile proxy
    // - Session ID: Ensures unique IP per bot (sticky IP)
    // - Country: Ensures US IPs (geographic targeting)
    // - Both fit in mobile proxy username (not possible with residential)
    let username = brightDataConfig.username;
    const baseLength = username.length;
    const maxTotalLength = 64;
    const availableSpace = maxTotalLength - baseLength;
    
    const targetCountry = country || 'us';
    const sessionPrefix = '-session-';
    const countrySuffix = `-country-${targetCountry}`;
    const fixedPartsLength = sessionPrefix.length + countrySuffix.length; // 9 + 11 = 20
    
    if (sessionId) {
      // Calculate space for session ID
      const spaceForSessionId = availableSpace - fixedPartsLength;
      
      if (spaceForSessionId > 0) {
        // We can fit both session ID and country!
        const truncatedSessionId = sessionId.length > spaceForSessionId 
          ? sessionId.substring(0, spaceForSessionId)
        : sessionId;
        username = `${username}${sessionPrefix}${truncatedSessionId}${countrySuffix}`;
      } else {
        // Not enough space - prioritize country (fallback)
        console.warn(`⚠️  Not enough space for session ID, using country-only format`);
        username = `${username}${countrySuffix}`;
      }
    } else if (targetCountry) {
      // No session ID, just country
      username = `${username}${countrySuffix}`;
    }
    
    return username;
  } else if (PROXY_PROVIDER === 'dataimpulse') {
    // DataImpulse format: username_cr.countrycode (e.g., username_cr.us)
    const countryCode = country || dataImpulseConfig.countryCode || 'us';
    return `${dataImpulseConfig.username}_cr.${countryCode}`;
  } else {
    return ipRoyalConfig.username;
  }
}

export function getProxyPassword(): string {
  if (PROXY_PROVIDER === 'brightdata') {
    return brightDataConfig.password;
  } else if (PROXY_PROVIDER === 'dataimpulse') {
    return dataImpulseConfig.password;
  } else {
    return ipRoyalConfig.password;
  }
}

export function getRotationApiUrl(): string {
  return `https://apid.iproyal.com/v1/orders/${ipRoyalConfig.orderId}/rotate-ip/${ipRoyalConfig.apiKey}`;
}

