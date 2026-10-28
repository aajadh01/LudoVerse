import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoomManager } from '../../server/src/rooms/RoomManager.js';
import { createLiveKitTokenHandler } from '../../server/src/livekit/tokenController.js';
import type { Request, Response } from 'express';

function createMockResponse() {
  const res: Partial<Response> & { _status: number; _json: any } = {
    _status: 200,
    _json: null,
    status(s: number) {
      this._status = s;
      return this as Response;
    },
    json(data: any) {
      this._json = data;
      return this as Response;
    },
  };
  return res as Response & { _status: number; _json: any };
}

describe('LiveKit Token Controller Endpoint', () => {
  const originalEnv = { ...process.env };
  let roomManager: RoomManager;
  let handler: ReturnType<typeof createLiveKitTokenHandler>;

  beforeEach(() => {
    process.env['LIVEKIT_URL'] = 'wss://livekit.example.com';
    process.env['LIVEKIT_API_KEY'] = 'test-api-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-secret-at-least-32-chars-long-12345';
    roomManager = new RoomManager();
    handler = createLiveKitTokenHandler(roomManager);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    roomManager.destroy();
  });

  it('returns 400 when roomId or playerId is missing', async () => {
    const req = { body: {}, query: {} } as Request;
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.code).toBe('MISSING_PARAMS');
  });

  it('returns 503 when LiveKit environment variables are missing', async () => {
    delete process.env['LIVEKIT_API_KEY'];

    const req = {
      body: { roomId: 'TEST12', playerId: 'p1' },
      query: {},
    } as Request;
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(503);
    expect(res._json.code).toBe('LIVEKIT_NOT_CONFIGURED');
  });

  it('returns 404 when room does not exist', async () => {
    const req = {
      body: { roomId: 'NONEXIST', playerId: 'p1' },
      query: {},
    } as Request;
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(404);
    expect(res._json.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns 403 when player is not in room', async () => {
    const { room } = roomManager.createRoom({
      hostName: 'HostPlayer',
      socketId: 'socket-1',
      userId: 'host-user-id',
    });

    const req = {
      body: { roomId: room.roomId, playerId: 'stranger-id' },
      query: {},
    } as Request;
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(403);
    expect(res._json.code).toBe('UNAUTHORIZED_PLAYER');
  });

  it('returns 403 when sessionToken does not match player session', async () => {
    const { room, player } = roomManager.createRoom({
      hostName: 'HostPlayer',
      socketId: 'socket-1',
      userId: 'host-user-id',
    });

    const req = {
      body: {
        roomId: room.roomId,
        playerId: player.playerId,
        sessionToken: 'wrong-token',
      },
      query: {},
    } as Request;
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(403);
    expect(res._json.code).toBe('INVALID_SESSION');
  });

  it('returns 200 with LiveKit JWT token for authorized player', async () => {
    const { room, player } = roomManager.createRoom({
      hostName: 'Alice',
      socketId: 'socket-1',
      userId: 'alice-user-id',
    });
    const roomPlayer = room.players[0]!;

    const req = {
      body: {
        roomId: room.roomId,
        playerId: player.playerId,
        sessionToken: roomPlayer.sessionToken,
      },
      query: {},
    } as Request;
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.token).toBeDefined();
    expect(res._json.serverUrl).toBe('wss://livekit.example.com');
    expect(res._json.roomId).toBe(room.roomId);
    expect(res._json.playerId).toBe(player.playerId);
  });
});
