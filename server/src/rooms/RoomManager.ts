import { randomUUID } from 'node:crypto';
import { GameState, GameMode, GameRulePreset } from '@ludoverse/shared';
import { LudoEngine } from '../engine/LudoEngine.js';

export interface RoomPlayer {
  playerId: string;
  userId: string;
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
  version: number;
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
    userId?: string;
    mode?: GameMode;
    rulePreset?: GameRulePreset;
    targetPlayerCount?: number;
    turnTimeoutSeconds?: number;
  }): { room: Room; player: RoomPlayer } {
    const roomId = this.generateRoomCode();
    const playerId = randomUUID();
    const sessionToken = randomUUID();
    const userId = params.userId?.trim() || playerId;

    const hostPlayer: RoomPlayer = {
      playerId,
      userId,
      name: params.hostName.trim().slice(0, 24),
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
      version: 1,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    console.log(`[RoomManager] Room ${roomId} created by host "${hostPlayer.name}" (userId: ${userId})`);
    return { room, player: hostPlayer };
  }

  /**
   * Joins an existing room, or reconnects an existing session.
   * Fully idempotent: rejoining with the same userId or sessionToken reuses the existing membership slot.
   */
  public joinRoom(params: {
    roomId: string;
    playerName: string;
    socketId: string;
    userId?: string;
    sessionToken?: string;
  }): { room: Room; player: RoomPlayer; isReconnect: boolean } | { error: string } {
    const cleanRoomId = params.roomId.trim().toUpperCase();
    const room = this.rooms.get(cleanRoomId);
    if (!room) {
      return { error: 'Room not found. The room may have expired or the code is incorrect.' };
    }

    room.lastActivityAt = Date.now();
    const reqUserId = params.userId?.trim();

    // ── 1. Idempotent Reconnection Check ─────────────────────
    // Match by sessionToken OR userId OR socketId
    const existing = room.players.find(p =>
      (params.sessionToken && p.sessionToken === params.sessionToken) ||
      (reqUserId && p.userId === reqUserId) ||
      (p.socketId === params.socketId)
    );

    if (existing) {
      console.log(`[RoomManager] Idempotent join: Reusing existing player "${existing.name}" (${existing.playerId}, userId: ${existing.userId}) in room ${cleanRoomId}`);
      existing.socketId = params.socketId;
      existing.isConnected = true;
      existing.disconnectedAt = null;
      if (params.playerName && params.playerName.trim()) {
        existing.name = params.playerName.trim().slice(0, 24);
      }
      if (reqUserId && !existing.userId) {
        existing.userId = reqUserId;
      }

      if (room.gameState) {
        const gsPlayer = room.gameState.players.find(p => p.id === existing.playerId);
        if (gsPlayer) {
          gsPlayer.isConnected = true;
          if (existing.name) gsPlayer.name = existing.name;
        }
        room.gameState.version += 1;
      }
      room.version += 1;
      return { room, player: existing, isReconnect: true };
    }

    // ── 2. New Join Path ─────────────────────────────────────
    if (room.gameState && room.gameState.status === 'IN_GAME') {
      return { error: 'Game is already in progress. You cannot join mid-match.' };
    }

    const maxPlayers = room.targetPlayerCount ?? (room.mode === 'TRADITIONAL_4P' ? 4 : 9);
    if (room.players.length >= maxPlayers) {
      return { error: `This room is full (max ${maxPlayers} players).` };
    }

    const playerId = randomUUID();
    const sessionToken = randomUUID();
    const userId = reqUserId || playerId;

    const newPlayer: RoomPlayer = {
      playerId,
      userId,
      name: params.playerName.trim().slice(0, 24),
      socketId: params.socketId,
      sessionToken,
      isReady: false,
      isHost: room.players.length === 0, // Fallback if previous host departed
      isConnected: true,
      disconnectedAt: null,
      voteProposalCooldownUntil: 0,
    };

    room.players.push(newPlayer);
    room.version += 1;
    console.log(`[RoomManager] New player "${newPlayer.name}" (${newPlayer.playerId}, userId: ${userId}) joined room ${cleanRoomId} (total: ${room.players.length})`);
    return { room, player: newPlayer, isReconnect: false };
  }

  /**
   * Explicitly leaves a room.
   * If in lobby, removes the player slot completely and migrates host if needed.
   * If in game, marks player disconnected so tokens/turns remain coherent.
   */
  public leaveRoom(roomId: string, playerId: string): { remainingRoom: Room; removedPlayer: RoomPlayer; newHost?: RoomPlayer } | null {
    const cleanRoomId = roomId.trim().toUpperCase();
    const room = this.rooms.get(cleanRoomId);
    if (!room) return null;

    const playerIndex = room.players.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) return null;

    const removedPlayer = room.players[playerIndex];

    if (room.gameState && room.gameState.status === 'IN_GAME') {
      // In game: mark disconnected, preserve player slot and tokens
      removedPlayer.isConnected = false;
      removedPlayer.disconnectedAt = Date.now();
      const gsPlayer = room.gameState.players.find(p => p.id === playerId);
      if (gsPlayer) {
        gsPlayer.isConnected = false;
      }
      room.gameState.version += 1;
      room.lastActivityAt = Date.now();
      console.log(`[RoomManager] Player "${removedPlayer.name}" disconnected from active match in ${cleanRoomId}`);
      return { remainingRoom: room, removedPlayer };
    }

    // In lobby: explicitly remove from room.players!
    room.players.splice(playerIndex, 1);
    room.version += 1;
    room.lastActivityAt = Date.now();
    console.log(`[RoomManager] Player "${removedPlayer.name}" explicitly left lobby in ${cleanRoomId} (remaining: ${room.players.length})`);

    let newHost: RoomPlayer | undefined;
    if (removedPlayer.isHost && room.players.length > 0) {
      const nextHost = room.players.find(p => p.isConnected) || room.players[0];
      nextHost.isHost = true;
      newHost = nextHost;
      console.log(`[RoomManager] Host migrated to "${nextHost.name}" in room ${cleanRoomId}`);
    }

    return { remainingRoom: room, removedPlayer, newHost };
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
        room.version += 1;
        room.lastActivityAt = Date.now();

        // Also mark disconnected in game state if active
        if (room.gameState) {
          const gsPlayer = room.gameState.players.find(p => p.id === player.playerId);
          if (gsPlayer) gsPlayer.isConnected = false;
          room.gameState.version += 1;
        }

        console.log(`[RoomManager] Socket ${socketId} disconnected: player "${player.name}" in room ${room.roomId}`);
        return { room, player };
      }
    }
    return null;
  }

  /**
   * Sets a player's ready status. Only the host can start the game.
   */
  public setReady(roomId: string, playerId: string, isReady: boolean): Room | null {
    const cleanRoomId = roomId.trim().toUpperCase();
    const room = this.rooms.get(cleanRoomId);
    if (!room) return null;
    const player = room.players.find(p => p.playerId === playerId);
    if (!player) return null;
    player.isReady = isReady;
    room.version += 1;
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
    const cleanRoomId = roomId.trim().toUpperCase();
    const room = this.rooms.get(cleanRoomId);
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
    room.version += 1;
    return room;
  }

  /**
   * Starts the game. Enforces: host-only, minimum 2 unique connected players, all ready.
   */
  public startGame(
    roomId: string,
    requestingPlayerId: string
  ): { gameState: GameState } | { error: string } {
    const cleanRoomId = roomId.trim().toUpperCase();
    const room = this.rooms.get(cleanRoomId);
    if (!room) return { error: 'Room not found' };

    const requester = room.players.find(p => p.playerId === requestingPlayerId);
    if (!requester?.isHost) return { error: 'Only the host can start the game' };

    if (room.gameState && room.gameState.status === 'IN_GAME') {
      return { error: 'Game is already in progress' };
    }

    // Deduplicate any unexpected duplicate records defensively
    const seenUserIds = new Set<string>();
    const deduplicated: RoomPlayer[] = [];
    for (const p of room.players) {
      const idKey = p.userId || p.playerId;
      if (!seenUserIds.has(idKey)) {
        seenUserIds.add(idKey);
        deduplicated.push(p);
      }
    }
    room.players = deduplicated;

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
      cleanRoomId,
      room.mode,
      initialPlayers,
      room.turnTimeoutSeconds,
      room.rulePreset
    );

    room.gameState = gameState;
    room.version += 1;
    room.lastActivityAt = Date.now();
    console.log(`[RoomManager] Game started in room ${cleanRoomId} with ${initialPlayers.length} players`);
    return { gameState };
  }

  /**
   * Transfers host role to the next connected player when the host disconnects.
   */
  public transferHostIfNeeded(roomId: string, departingPlayerId: string): RoomPlayer | null {
    const cleanRoomId = roomId.trim().toUpperCase();
    const room = this.rooms.get(cleanRoomId);
    if (!room) return null;

    const departing = room.players.find(p => p.playerId === departingPlayerId);
    if (!departing?.isHost) return null;

    // Find next connected non-host player
    const nextHost = room.players.find(p => p.playerId !== departingPlayerId && p.isConnected);
    if (!nextHost) return null;

    departing.isHost = false;
    nextHost.isHost = true;
    room.version += 1;

    // Sync in game state if active
    if (room.gameState) {
      const gsOld = room.gameState.players.find(p => p.id === departingPlayerId);
      const gsNew = room.gameState.players.find(p => p.id === nextHost.playerId);
      if (gsOld) gsOld.isHost = false;
      if (gsNew) gsNew.isHost = true;
      room.gameState.version += 1;
    }

    console.log(`[RoomManager] Transferred host to "${nextHost.name}" in room ${cleanRoomId}`);
    return nextHost;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.trim().toUpperCase());
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
        console.log(`[RoomManager] Sweeping expired inactive room ${roomId}`);
        this.rooms.delete(roomId);
      }
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }
}
