import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isLiveKitConfigured, generateLiveKitToken } from '../../server/src/livekit/tokenService.js';
import { TokenVerifier } from 'livekit-server-sdk';

describe('LiveKit Token Service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['LIVEKIT_URL'];
    delete process.env['LIVEKIT_API_KEY'];
    delete process.env['LIVEKIT_API_SECRET'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isLiveKitConfigured', () => {
    it('returns false when variables are absent', () => {
      expect(isLiveKitConfigured()).toBe(false);
    });

    it('returns false when only some variables are present', () => {
      process.env['LIVEKIT_URL'] = 'wss://test.livekit.cloud';
      process.env['LIVEKIT_API_KEY'] = 'devkey';
      expect(isLiveKitConfigured()).toBe(false);
    });

    it('returns true when all variables are present and non-empty', () => {
      process.env['LIVEKIT_URL'] = 'wss://test.livekit.cloud';
      process.env['LIVEKIT_API_KEY'] = 'devkey';
      process.env['LIVEKIT_API_SECRET'] = 'secret_test_32chars_abcdef123456';
      expect(isLiveKitConfigured()).toBe(true);
    });
  });

  describe('generateLiveKitToken', () => {
    it('throws error when LiveKit is not configured', async () => {
      await expect(
        generateLiveKitToken({
          roomId: 'ABCDEF',
          playerId: 'p1',
          playerName: 'Alice',
        })
      ).rejects.toThrow('LiveKit credentials are not configured');
    });

    it('generates a valid, cryptographically verifiable JWT token with correct grants', async () => {
      const apiKey = 'devkey';
      const apiSecret = 'secret_test_32chars_abcdef123456';
      const livekitUrl = 'wss://test.livekit.cloud';

      process.env['LIVEKIT_URL'] = livekitUrl;
      process.env['LIVEKIT_API_KEY'] = apiKey;
      process.env['LIVEKIT_API_SECRET'] = apiSecret;

      const result = await generateLiveKitToken({
        roomId: 'ROOM123',
        playerId: 'player-xyz-456',
        playerName: 'SuperPlayer',
      });

      expect(result).toBeDefined();
      expect(result.serverUrl).toBe(livekitUrl);
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(50);

      // Verify the token using LiveKit TokenVerifier
      const verifier = new TokenVerifier(apiKey, apiSecret);
      const claims = await verifier.verify(result.token);

      expect(claims.sub).toBe('player-xyz-456');
      expect(claims.name).toBe('SuperPlayer');
      expect(claims.video).toBeDefined();
      expect(claims.video?.room).toBe('ROOM123');
      expect(claims.video?.roomJoin).toBe(true);
      expect(claims.video?.canPublish).toBe(true);
      expect(claims.video?.canSubscribe).toBe(true);
    });
  });
});
