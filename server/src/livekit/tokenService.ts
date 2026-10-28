import { AccessToken } from 'livekit-server-sdk';

export interface GenerateTokenOptions {
  roomId: string;
  playerId: string;
  playerName: string;
  ttl?: string | number;
}

export interface LiveKitTokenResult {
  token: string;
  serverUrl: string;
}

/**
 * Checks whether all required LiveKit environment variables are configured.
 */
export function isLiveKitConfigured(): boolean {
  const url = process.env['LIVEKIT_URL']?.trim();
  const apiKey = process.env['LIVEKIT_API_KEY']?.trim();
  const apiSecret = process.env['LIVEKIT_API_SECRET']?.trim();
  return Boolean(url && apiKey && apiSecret);
}

/**
 * Generates a short-lived, cryptographically signed LiveKit AccessToken for a player
 * joining a specific room.
 *
 * Security:
 * - Uses server-held LIVEKIT_API_SECRET (never exposed to client).
 * - Restricts player exclusively to their assigned room.
 * - Minimum required permissions: roomJoin, canPublish, canSubscribe, canPublishData.
 */
export async function generateLiveKitToken(options: GenerateTokenOptions): Promise<LiveKitTokenResult> {
  const url = process.env['LIVEKIT_URL']?.trim();
  const apiKey = process.env['LIVEKIT_API_KEY']?.trim();
  const apiSecret = process.env['LIVEKIT_API_SECRET']?.trim();

  if (!url || !apiKey || !apiSecret) {
    throw new Error(
      'LiveKit credentials are not configured on the server. Please define LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.'
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: options.playerId,
    name: options.playerName,
    ttl: options.ttl ?? '2h',
  });

  at.addGrant({
    roomJoin: true,
    room: options.roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return {
    token,
    serverUrl: url,
  };
}
