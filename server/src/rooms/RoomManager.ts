import { randomUUID } from 'node:crypto';
import { GameState, GameMode, GameRulePreset } from '@ludoverse/shared';
import { LudoEngine } from '../engine/LudoEngine.js';

export interface RoomPlayer {
  playerId: string;
  name: string;
  socketId: string;
  sessionToken: string;
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  disconnectedAt: number | null;
  voteProposalCooldownUntil: number;
}

export interface Room {
  roomId: string;
  mode: GameMode;
  rulePreset: GameRulePreset;
  targetPlayerCount: number;
  turnTimeoutSeconds: number;
  players: RoomPlayer[];
  gameState: GameState | null;
  createdAt: number;
  lastActivityAt: number;
}

// Maximum inactive room lifetime: 2 hours
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
// Grace period before a disconnected slot is forfeited (30 seconds)
export const DISCONNECT_GRACE_MS = 30_000;
// Early end vote cooldown for proposer (90 seconds)
export const VOTE_COOLDOWN_MS = 90_000;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Sweep expired rooms every 10 minutes
    this.cleanupInterval = setInterval(() => this.sweepExpiredRooms(), 10 * 60 * 1000);
  }

  /**
   * Generates a 6-character room code in format: ABC123
   */
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Collision check
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }

  /**
   * Creates a new room and registers the host player.
   */
  public createRoom(params: {
    hostName: string;
    socketId: string;
    mode?: GameMode;
    rulePreset?: GameRulePreset;
    targetPlayerCount?: number;
    turnTimeoutSeconds?: number;
  }): { room: Room; player: RoomPlayer } {
    const roomId = this.generateRoomCode();
    const playerId = randomUUID();
    const sessionToken = randomUUID();

    const hostPlayer: RoomPlayer = {
      playerId,
      name: params.hostName,
      socketId: params.socketId,
      sessionToken,
      isReady: false,
      isHost: true,
      isConnected: true,
      disconnectedAt: null,
      voteProposalCooldownUntil: 0,
    };

    const targetCount = params.targetPlayerCount ? Math.max(2, Math.min(9, params.targetPlayerCount)) : (params.mode === 'CUSTOM_RADIAL' ? 6 : 4);
    const mode = params.mode ?? (targetCount <= 4 ? 'TRADITIONAL_4P' : 'CUSTOM_RADIAL');

    const room: Room = {
      roomId,
      mode,
      rulePreset: params.rulePreset ?? 'CLASSIC',
      targetPlayerCount: targetCount,
      turnTimeoutSeconds: params.turnTimeoutSeconds ?? 15,
      players: [hostPlayer],
      gameState: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    return { room, player: hostPlayer };
  }

  /**
   * Joins an existing room, or reconnects an existing session.
   * Returns an error string on failure.
   */
  public joinRoom(params: {
    roomId: string;
    playerName: string;
    socketId: string;
    sessionToken?: string;
  }): { room: Room; player: RoomPlayer; isReconnect: boolean } | { error: string } {
    const room = this.rooms.get(params.roomId);
    if (!room) {
      return { error: 'Room not found. The room may have expired or the code is incorrect.' };
    }

    room.lastActivityAt = Date.now();

    // --- Reconnection path ---
    if (params.sessionToken) {
      const existing = room.players.find(p => p.sessionToken === params.sessionToken);
      if (existing) {
        existing.socketId = params.socketId;
        existing.isConnected = true;
        existing.disconnectedAt = null;
        if (room.gameState) {
          const gsPlayer = room.gameState.players.find(p => p.id === existing.playerId);
          if (gsPlayer) {
            gsPlayer.isConnected = true;
          }
          room.gameState.version += 1;
        }
        return { room, player: existing, isReconnect: true };
      }
    }

    // --- New join path ---
    if (room.gameState && room.gameState.status === 'IN_GAME') {
      return { error: 'Game is already in progress. You cannot join mid-match.' };
    }

    const maxPlayers = room.targetPlayerCount ?? (room.mode === 'TRADITIONAL_4P' ? 4 : 9);
    if (room.players.length >= maxPlayers) {
      return { error: `This room is full (max ${maxPlayers} players).` };
    }

    const playerId = randomUUID();
    const sessionToken = randomUUID();

    const newPlayer: RoomPlayer = {
      playerId,
      name: params.playerName,
      socketId: params.socketId,
      sessionToken,
      isReady: false,
      isHost: false,
      isConnected: true,
      disconnectedAt: null,
      voteProposalCooldownUntil: 0,
    };

    room.players.push(newPlayer);
    return { room, player: newPlayer, isReconnect: false };
  }

  /**
   * Marks a player as disconnected. Starts a grace period before their turn is auto-passed.
   * The player slot is preserved so they can reconnect.
   */
  public markDisconnected(socketId: string): { room: Room; player: RoomPlayer } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) {
        player.isConnected = false;
        player.disconnectedAt = Date.now();
        room.lastActivityAt = Date.now();

        // Also mark disconnected in game state if active
        if (room.gameState) {
          const gsPlayer = room.gameState.players.find(p => p.id === player.playerId);
          if (gsPlayer) gsPlayer.isConnected = false;
          room.gameState.version += 1;
        }

        return { room, player };
      }
    }
    return null;
  }

  /**
   * Sets a player's ready status. Only the host can start the game.
   */
  public setReady(roomId: string, playerId: string, isReady: boolean): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.find(p => p.playerId === playerId);
    if (!player) return null;
    player.isReady = isReady;
    return room;
  }

  /**
   * Updates room settings (host only). Returns error string on unauthorized attempt.
   */
  public updateSettings(
    roomId: string,
    requestingPlayerId: string,
    settings: {
      mode?: GameMode;
      rulePreset?: GameRulePreset;
      targetPlayerCount?: number;
      turnTimeoutSeconds?: number;
    }
  ): Room | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };
    const player = room.players.find(p => p.playerId === requestingPlayerId);
    if (!player?.isHost) return { error: 'Only the room host can change settings' };
    if (room.gameState?.status === 'IN_GAME') return { error: 'Cannot change settings mid-game' };

    if (settings.targetPlayerCount) {
      const count = Math.max(2, Math.min(9, settings.targetPlayerCount));
      room.targetPlayerCount = count;
      room.mode = count <= 4 ? 'TRADITIONAL_4P' : 'CUSTOM_RADIAL';
    } else if (settings.mode) {
      room.mode = settings.mode;
      if (room.mode === 'TRADITIONAL_4P' && room.targetPlayerCount > 4) {
        room.targetPlayerCount = 4;
      } else if (room.mode === 'CUSTOM_RADIAL' && room.targetPlayerCount <= 4) {
        room.targetPlayerCount = 6;
      }
    }

    if (settings.rulePreset) room.rulePreset = settings.rulePreset;
    if (settings.turnTimeoutSeconds) room.turnTimeoutSeconds = settings.turnTimeoutSeconds;
    return room;
  }

  /**
   * Starts the game. Enforces: host-only, minimum 2 players, all ready.
   */
  public startGame(
    roomId: string,
    requestingPlayerId: string
  ): { gameState: GameState } | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };

    const requester = room.players.find(p => p.playerId === requestingPlayerId);
    if (!requester?.isHost) return { error: 'Only the host can start the game' };

    const connectedPlayers = room.players.filter(p => p.isConnected);
    if (connectedPlayers.length < 2) return { error: 'At least 2 connected players are required to start' };

    const notReady = connectedPlayers.filter(p => !p.isHost && !p.isReady);
    if (notReady.length > 0) {
      return { error: `Waiting for ${notReady.map(p => p.name).join(', ')} to ready up` };
    }

    // Enforce max player limits per targetPlayerCount / mode
    const maxAllowed = room.targetPlayerCount ?? (room.mode === 'TRADITIONAL_4P' ? 4 : 9);
    if (connectedPlayers.length > maxAllowed) {
      return { error: `Room supports a maximum of ${maxAllowed} players` };
    }

    const initialPlayers = connectedPlayers.map(p => ({
      id: p.playerId,
      name: p.name,
      isHost: p.isHost,
    }));

    const gameState = LudoEngine.createInitialGameState(
      roomId,
      room.mode,
      initialPlayers,
      room.turnTimeoutSeconds,
      room.rulePreset
    );

    room.gameState = gameState;
    room.lastActivityAt = Date.now();
    return { gameState };
  }

  /**
   * Transfers host role to the next connected player when the host disconnects.
   */
  public transferHostIfNeeded(roomId: string, departingPlayerId: string): RoomPlayer | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const departing = room.players.find(p => p.playerId === departingPlayerId);
    if (!departing?.isHost) return null;

    // Find next connected non-host player
    const nextHost = room.players.find(p => p.playerId !== departingPlayerId && p.isConnected);
    if (!nextHost) return null;

    departing.isHost = false;
    nextHost.isHost = true;

    // Sync in game state if active
    if (room.gameState) {
      const gsOld = room.gameState.players.find(p => p.id === departingPlayerId);
      const gsNew = room.gameState.players.find(p => p.id === nextHost.playerId);
      if (gsOld) gsOld.isHost = false;
      if (gsNew) gsNew.isHost = true;
      room.gameState.version += 1;
    }

    return nextHost;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomBySocketId(socketId: string): { room: Room; player: RoomPlayer } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.socketId === socketId);
      if (player) return { room, player };
    }
    return null;
  }

  private sweepExpiredRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt > ROOM_TTL_MS) {
        this.rooms.delete(roomId);
      }
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }
}
