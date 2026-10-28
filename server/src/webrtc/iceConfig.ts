/**
 * WebRTC ICE Configuration Service
 * Provides STUN and dynamic authenticated TURN servers for cross-network / mobile cellular (WAN) NAT traversal.
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRtcConfigResponse {
  iceServers: IceServerConfig[];
  hasTurn: boolean;
  notice?: string;
}

// In-memory cache for dynamic Metered TURN credentials (valid for 10 minutes)
let cachedMeteredConfig: { servers: IceServerConfig[]; expiresAt: number } | null = null;

// High-reliability STUN servers for direct P2P connection candidates
const DEFAULT_STUN_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export async function getWebRtcConfig(): Promise<WebRtcConfigResponse> {
  const meteredAppName = process.env['METERED_APP_NAME']?.trim();
  const meteredApiKey = process.env['METERED_API_KEY']?.trim();

  // 1. If Metered credentials are provided in environment, fetch dynamic TURN credentials
  if (meteredAppName && meteredApiKey) {
    const now = Date.now();
    if (cachedMeteredConfig && cachedMeteredConfig.expiresAt > now) {
      return {
        iceServers: [...cachedMeteredConfig.servers, ...DEFAULT_STUN_SERVERS],
        hasTurn: true,
      };
    }

    try {
      const url = `https://${meteredAppName}.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000),
      });

      if (response.ok) {
        const data = await response.json() as IceServerConfig[];
        if (Array.isArray(data) && data.length > 0) {
          // Cache for 10 minutes (credentials typically valid for 24h)
          cachedMeteredConfig = {
            servers: data,
            expiresAt: now + 10 * 60 * 1000,
          };
          console.log(`[WebRTC] Fetched ${data.length} authenticated TURN servers from Metered`);
          return {
            iceServers: [...data, ...DEFAULT_STUN_SERVERS],
            hasTurn: true,
          };
        }
      } else {
        console.warn(`[WebRTC] Metered API returned status ${response.status}`);
      }
    } catch (err) {
      console.warn('[WebRTC] Failed to fetch dynamic Metered credentials:', (err as Error).message);
    }
  }

  // 2. Custom TURN environment variables (e.g., self-hosted Coturn, Twilio, or Xirsys)
  const customTurnUrls = process.env['TURN_URLS']?.trim();
  const customTurnUser = process.env['TURN_USERNAME']?.trim();
  const customTurnCred = process.env['TURN_CREDENTIAL']?.trim();

  if (customTurnUrls && customTurnUser && customTurnCred) {
    const turnServers: IceServerConfig = {
      urls: customTurnUrls.split(',').map((u) => u.trim()),
      username: customTurnUser,
      credential: customTurnCred,
    };
    return {
      iceServers: [turnServers, ...DEFAULT_STUN_SERVERS],
      hasTurn: true,
    };
  }

  // 3. Fallback: Return robust Google + Cloudflare STUN servers
  return {
    iceServers: DEFAULT_STUN_SERVERS,
    hasTurn: false,
    notice: 'No authenticated TURN relay configured. STUN direct P2P is active. For 100% WAN/Cellular traversal across Symmetric NAT, set METERED_APP_NAME and METERED_API_KEY.',
  };
}
