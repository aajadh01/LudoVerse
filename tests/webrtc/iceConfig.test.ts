import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getWebRtcConfig } from '../../server/src/webrtc/iceConfig';

describe('WebRTC ICE Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return fallback Google and Cloudflare STUN servers when no TURN credentials exist', async () => {
    delete process.env['METERED_APP_NAME'];
    delete process.env['METERED_API_KEY'];
    delete process.env['TURN_URLS'];

    const config = await getWebRtcConfig();
    expect(config.hasTurn).toBe(false);
    expect(config.iceServers.length).toBeGreaterThan(0);
    const urls = config.iceServers.map(s => s.urls).flat();
    expect(urls).toContain('stun:stun.l.google.com:19302');
    expect(urls).toContain('stun:stun.cloudflare.com:3478');
  });

  it('should return configured custom TURN servers when TURN_URLS and credentials are provided', async () => {
    process.env['TURN_URLS'] = 'turn:myturn.example.com:3478,turns:myturn.example.com:5349';
    process.env['TURN_USERNAME'] = 'testuser';
    process.env['TURN_CREDENTIAL'] = 'testsecret';

    const config = await getWebRtcConfig();
    expect(config.hasTurn).toBe(true);
    const turnEntry = config.iceServers.find(s => s.username === 'testuser');
    expect(turnEntry).toBeDefined();
    expect(turnEntry?.credential).toBe('testsecret');
  });

  it('should fetch and return dynamic Metered credentials when METERED_APP_NAME and METERED_API_KEY are provided', async () => {
    process.env['METERED_APP_NAME'] = 'testapp';
    process.env['METERED_API_KEY'] = 'testkey';

    const mockServers = [
      {
        urls: ['turn:testapp.metered.live:80', 'turns:testapp.metered.live:443'],
        username: 'dynuser',
        credential: 'dynpassword',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockServers,
    } as Response);

    const config = await getWebRtcConfig();
    expect(config.hasTurn).toBe(true);
    expect(config.iceServers).toEqual(expect.arrayContaining(mockServers));
  });
});
