import type { Request, Response } from 'express';
import { RoomManager } from '../rooms/RoomManager.js';
import { isLiveKitConfigured, generateLiveKitToken } from './tokenService.js';

export function createLiveKitTokenHandler(roomManager: RoomManager) {
  return async (req: Request, res: Response): Promise<void> => {
    const roomId = (req.body?.roomId || req.query?.['roomId'])?.toString()?.trim().toUpperCase();
    const playerId = (req.body?.playerId || req.query?.['playerId'])?.toString()?.trim();
    const sessionToken = (req.body?.sessionToken || req.query?.['sessionToken'])?.toString()?.trim();
    const userId = (req.body?.userId || req.query?.['userId'])?.toString()?.trim();

    if (!roomId || !playerId) {
      res.status(400).json({
        error: 'Missing required parameters: roomId and playerId are required',
        code: 'MISSING_PARAMS',
      });
      return;
    }

    if (!isLiveKitConfigured()) {
      res.status(503).json({
        error:
          'LiveKit media server credentials are not configured on the server. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
        code: 'LIVEKIT_NOT_CONFIGURED',
      });
      return;
    }

    const room = roomManager.getRoom(roomId);
    if (!room) {
      res.status(404).json({
        error: `Game room "${roomId}" was not found`,
        code: 'ROOM_NOT_FOUND',
      });
      return;
    }

    // Match player by playerId, userId, or sessionToken
    const member = room.players.find(
      (p) =>
        p.playerId === playerId ||
        (userId && p.userId === userId) ||
        (sessionToken && p.sessionToken === sessionToken)
    );

    if (!member) {
      res.status(403).json({
        error: 'Player is not an authorized participant in this room',
        code: 'UNAUTHORIZED_PLAYER',
      });
      return;
    }

    // If sessionToken is provided, ensure it matches the player's sessionToken
    if (sessionToken && member.sessionToken && member.sessionToken !== sessionToken) {
      res.status(403).json({
        error: 'Session token verification failed',
        code: 'INVALID_SESSION',
      });
      return;
    }

    try {
      const tokenResult = await generateLiveKitToken({
        roomId: room.roomId,
        playerId: member.playerId,
        playerName: member.name,
        ttl: '2h',
      });

      res.json({
        token: tokenResult.token,
        serverUrl: tokenResult.serverUrl,
        roomId: room.roomId,
        playerId: member.playerId,
      });
    } catch (err) {
      console.error('[LiveKit] Token generation error:', err);
      res.status(500).json({
        error: 'Failed to generate LiveKit access token',
        code: 'TOKEN_GEN_ERROR',
      });
    }
  };
}
