import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RoomManager, DISCONNECT_GRACE_MS } from '../../server/src/rooms/RoomManager.js';
import { LudoEngine } from '../../server/src/engine/LudoEngine.js';

describe('RoomManager — Lifecycle & Authorization', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Room Creation', () => {
    it('creates a room with a valid 6-character code', () => {
      const { room, player } = manager.createRoom({
        hostName: 'Aajadh',
        socketId: 'socket-1',
      });

      expect(room.roomId).toHaveLength(6);
      expect(room.players).toHaveLength(1);
      expect(player.isHost).toBe(true);
      expect(player.name).toBe('Aajadh');
      expect(player.sessionToken).toBeTruthy();
    });

    it('generates unique room codes for multiple rooms', () => {
      const r1 = manager.createRoom({ hostName: 'A', socketId: 's1' });
      const r2 = manager.createRoom({ hostName: 'B', socketId: 's2' });
      const r3 = manager.createRoom({ hostName: 'C', socketId: 's3' });

      expect(r1.room.roomId).not.toBe(r2.room.roomId);
      expect(r2.room.roomId).not.toBe(r3.room.roomId);
    });
  });

  describe('Joining Rooms', () => {
    it('allows a second player to join a valid room', () => {
      const { room } = manager.createRoom({ hostName: 'Host', socketId: 's1' });

      const joinResult = manager.joinRoom({
        roomId: room.roomId,
        playerName: 'Guest',
        socketId: 's2',
      });

      expect('error' in joinResult).toBe(false);
      if (!('error' in joinResult)) {
        expect(joinResult.isReconnect).toBe(false);
        expect(joinResult.room.players).toHaveLength(2);
      }
    });

    it('rejects joining a non-existent room', () => {
      const result = manager.joinRoom({
        roomId: 'BADCOD',
        playerName: 'Ghost',
        socketId: 's99',
      });
      expect('error' in result).toBe(true);
    });

    it('rejects joining a full 4-player room', () => {
      const { room } = manager.createRoom({ hostName: 'P1', socketId: 's1' });

      manager.joinRoom({ roomId: room.roomId, playerName: 'P2', socketId: 's2' });
      manager.joinRoom({ roomId: room.roomId, playerName: 'P3', socketId: 's3' });
      manager.joinRoom({ roomId: room.roomId, playerName: 'P4', socketId: 's4' });

      const result = manager.joinRoom({ roomId: room.roomId, playerName: 'P5', socketId: 's5' });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('full');
      }
    });

    it('handles session-token-based reconnection', () => {
      const { room, player } = manager.createRoom({ hostName: 'Host', socketId: 's1' });

      // Simulate disconnect
      manager.markDisconnected('s1');
      expect(manager.getRoom(room.roomId)!.players[0].isConnected).toBe(false);

      // Reconnect with same session token but new socket id
      const reconnect = manager.joinRoom({
        roomId: room.roomId,
        playerName: 'Host',
        socketId: 's1-new',
        sessionToken: player.sessionToken,
      });

      expect('error' in reconnect).toBe(false);
      if (!('error' in reconnect)) {
        expect(reconnect.isReconnect).toBe(true);
        expect(reconnect.player.isConnected).toBe(true);
        expect(reconnect.player.socketId).toBe('s1-new');
        expect(reconnect.player.playerId).toBe(player.playerId); // Same identity
      }
    });
  });

  describe('Authorization & Host Controls', () => {
    it('prevents non-host from starting the game', () => {
      const { room } = manager.createRoom({ hostName: 'Host', socketId: 's1' });
      const join = manager.joinRoom({ roomId: room.roomId, playerName: 'Guest', socketId: 's2' });
      if ('error' in join) throw new Error('unexpected join failure');

      // Guest tries to start
      const startResult = manager.startGame(room.roomId, join.player.playerId);
      expect('error' in startResult).toBe(true);
      if ('error' in startResult) {
        expect(startResult.error).toContain('host');
      }
    });

    it('prevents non-host from changing room settings', () => {
      const { room } = manager.createRoom({ hostName: 'Host', socketId: 's1' });
      const join = manager.joinRoom({ roomId: room.roomId, playerName: 'Guest', socketId: 's2' });
      if ('error' in join) throw new Error('unexpected join failure');

      const result = manager.updateSettings(room.roomId, join.player.playerId, { turnTimeoutSeconds: 5 });
      expect('error' in result).toBe(true);
    });

    it('transfers host to next player when host disconnects', () => {
      const { room, player: host } = manager.createRoom({ hostName: 'Host', socketId: 's1' });
      const join = manager.joinRoom({ roomId: room.roomId, playerName: 'Guest', socketId: 's2' });
      if ('error' in join) throw new Error('unexpected join failure');

      manager.markDisconnected('s1');
      const newHost = manager.transferHostIfNeeded(room.roomId, host.playerId);

      expect(newHost).toBeTruthy();
      expect(newHost?.isHost).toBe(true);
      expect(newHost?.playerId).toBe(join.player.playerId);
    });
  });

  describe('Game Start Validation', () => {
    it('starts game when host and 1+ other player are ready', () => {
      const { room, player: host } = manager.createRoom({ hostName: 'Host', socketId: 's1' });
      const join = manager.joinRoom({ roomId: room.roomId, playerName: 'Guest', socketId: 's2' });
      if ('error' in join) throw new Error('unexpected join failure');

      manager.setReady(room.roomId, join.player.playerId, true);

      const result = manager.startGame(room.roomId, host.playerId);
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.gameState.status).toBe('IN_GAME');
        expect(result.gameState.players).toHaveLength(2);
      }
    });

    it('blocks game start if not all players are ready', () => {
      const { room, player: host } = manager.createRoom({ hostName: 'Host', socketId: 's1' });
      manager.joinRoom({ roomId: room.roomId, playerName: 'Guest', socketId: 's2' });
      // Guest did NOT toggle ready

      const result = manager.startGame(room.roomId, host.playerId);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('ready');
      }
    });
  });
});

describe('RoomManager — Multiplayer State Consistency', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('game state version increments on every mutation', () => {
    const { room, player: host } = manager.createRoom({ hostName: 'Aajadh', socketId: 's1' });
    const join = manager.joinRoom({ roomId: room.roomId, playerName: 'Rahul', socketId: 's2' });
    if ('error' in join) throw new Error(join.error);

    manager.setReady(room.roomId, join.player.playerId, true);
    const startResult = manager.startGame(room.roomId, host.playerId);
    if ('error' in startResult) throw new Error(startResult.error);

    const gs = startResult.gameState;
    const v0 = gs.version;

    // Roll dice for Player 1 (forced non-6 with all tokens in yard = auto-pass)
    LudoEngine.rollDice(gs, host.playerId, 4);
    expect(gs.version).toBeGreaterThan(v0);

    const v1 = gs.version;
    LudoEngine.rollDice(gs, join.player.playerId, 4);
    expect(gs.version).toBeGreaterThan(v1);
  });

  it('reconnect re-attaches the same player identity and preserves game state', () => {
    const { room, player: host } = manager.createRoom({ hostName: 'Host', socketId: 's1' });
    const join = manager.joinRoom({ roomId: room.roomId, playerName: 'Guest', socketId: 's2' });
    if ('error' in join) throw new Error(join.error);

    manager.setReady(room.roomId, join.player.playerId, true);
    const startResult = manager.startGame(room.roomId, host.playerId);
    if ('error' in startResult) throw new Error(startResult.error);

    const stateVersionAtStart = startResult.gameState.version;

    // markDisconnected intentionally bumps version to notify connected peers
    manager.markDisconnected('s1');
    const versionAfterDisconnect = manager.getRoom(room.roomId)!.gameState!.version;
    expect(versionAfterDisconnect).toBeGreaterThanOrEqual(stateVersionAtStart);

    // Reconnect with the same session token on a new socket id
    const reconnect = manager.joinRoom({
      roomId: room.roomId,
      playerName: 'Host',
      socketId: 's1-new',
      sessionToken: host.sessionToken,
    });

    if ('error' in reconnect) throw new Error(reconnect.error as string);

    // Must be treated as reconnect — same player identity preserved
    expect(reconnect.isReconnect).toBe(true);
    expect(reconnect.player.playerId).toBe(host.playerId);
    expect(reconnect.player.socketId).toBe('s1-new');
    expect(reconnect.player.isConnected).toBe(true);

    // Game state must still be intact (not reset)
    const currentState = manager.getRoom(room.roomId)!.gameState!;
    expect(currentState.status).toBe('IN_GAME');
    expect(currentState.players).toHaveLength(2);
  });
});
