import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  GameState,
} from '@ludoverse/shared';
import { RoomManager, DISCONNECT_GRACE_MS, VOTE_COOLDOWN_MS } from '../rooms/RoomManager.js';
import { LudoEngine } from '../engine/LudoEngine.js';
import { HunterTracker } from '../engine/HunterTracker.js';
import { VoteEngine } from '../engine/VoteEngine.js';
import { saveMatch } from '../db/connection.js';

type LudoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type LudoServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerSocketHandlers(io: LudoServer, roomManager: RoomManager): void {
  // Track pending disconnect timers for graceful timeout handling
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Track turn timers per room
  const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────

  function broadcastState(roomId: string, gameState: GameState): void {
    io.to(roomId).emit('room:state_update', gameState);
  }

  function startTurnTimer(io: LudoServer, roomId: string, timeoutSeconds: number): void {
    clearTurnTimer(roomId);
    const timer = setTimeout(() => {
      const room = roomManager.getRoom(roomId);
      if (!room?.gameState || room.gameState.status !== 'IN_GAME') return;

      const state = room.gameState;
      const activePlayer = state.players[state.activePlayerIndex];

      // Auto-pass the turn (handle both WAITING_FOR_ROLL and WAITING_FOR_MOVE)
      try {
        if (state.turnPhase === 'WAITING_FOR_MOVE' && state.currentTurnDice !== null) {
          // Auto-select the first legal token
          const firstLegal = state.legalMoveTokenIds[0];
          if (firstLegal !== undefined) {
            LudoEngine.moveToken(state, activePlayer.id, firstLegal);
          } else {
            LudoEngine.advanceToNextTurn(state);
          }
        } else {
          LudoEngine.advanceToNextTurn(state);
        }
      } catch {
        LudoEngine.advanceToNextTurn(state);
      }

      state.version += 1;
      broadcastState(roomId, state);

      if (state.status === 'IN_GAME') {
        startTurnTimer(io, roomId, timeoutSeconds);
      }
    }, timeoutSeconds * 1000);

    turnTimers.set(roomId, timer);
  }

  function clearTurnTimer(roomId: string): void {
    const timer = turnTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      turnTimers.delete(roomId);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Connection
  // ──────────────────────────────────────────────────────────

  io.on('connection', (socket: LudoSocket) => {
    // ── Room: Create ─────────────────────────────────────────
    socket.on('room:create', (data, callback) => {
      try {
        const { room, player } = roomManager.createRoom({
          hostName: data.playerName.trim().slice(0, 24),
          socketId: socket.id,
          mode: data.mode,
          rulePreset: data.rulePreset,
          targetPlayerCount: data.targetPlayerCount,
          turnTimeoutSeconds: data.turnTimeoutSeconds,
        });

        socket.join(room.roomId);
      socket.join(`player:${player.playerId}`);
        socket.join(`player:${player.playerId}`);

        const gameState: GameState = {
          roomId: room.roomId,
          mode: room.mode,
          rulePreset: room.rulePreset,
          targetPlayerCount: room.targetPlayerCount,
          tokensPerPlayer: (room.mode === 'CUSTOM_RADIAL' && room.rulePreset === 'RAPID') ? 2 : 4,
          status: 'LOBBY',
          players: [{
            id: player.playerId,
            name: player.name,
            color: 'red',
            playerIndex: 0,
            tokens: [],
            isReady: false,
            isHost: true,
            isConnected: true,
            hasFinished: false,
          }],
          activePlayerIndex: 0,
          currentTurnDice: null,
          consecutiveSixes: 0,
          turnPhase: 'WAITING_FOR_ROLL',
          legalMoveTokenIds: [],
          captureLedger: [],
          earlyEndVote: null,
          turnDeadline: null,
          matchStartTime: null,
          matchEndTime: null,
          winnerPlayerId: null,
          version: 1,
        };

        callback?.({ success: true, roomId: room.roomId });

        socket.emit('room:joined', {
          roomId: room.roomId,
          playerId: player.playerId,
          sessionToken: player.sessionToken,
          gameState,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create room';
        callback?.({ success: false, error: message });
      }
    });

    // ── Room: Join ───────────────────────────────────────────
    socket.on('room:join', (data, callback) => {
      const result = roomManager.joinRoom({
        roomId: data.roomId.trim().toUpperCase(),
        playerName: data.playerName.trim().slice(0, 24),
        socketId: socket.id,
        sessionToken: data.sessionToken,
      });

      if ('error' in result) {
        callback?.({ success: false, error: result.error });
        socket.emit('room:error', { message: result.error });
        return;
      }

      const { room, player, isReconnect } = result;

      // Cancel any pending disconnect forfeit timer for this player
      const timerKey = `${room.roomId}:${player.playerId}`;
      const pendingTimer = disconnectTimers.get(timerKey);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        disconnectTimers.delete(timerKey);
      }

      socket.join(room.roomId);
      socket.join(`player:${player.playerId}`);
      callback?.({ success: true });

      // Deliver the full current game state snapshot for reconnection
      const snapshotState: GameState = room.gameState ?? buildLobbyState(room);

      socket.emit('room:joined', {
        roomId: room.roomId,
        playerId: player.playerId,
        sessionToken: player.sessionToken,
        gameState: snapshotState,
      });

      if (isReconnect) {
        // Notify others this player is back
        socket.to(room.roomId).emit('room:player_joined', {
          playerId: player.playerId,
          playerName: player.name,
          playerColor: room.gameState?.players.find(p => p.id === player.playerId)?.color ?? 'red',
        });
        // Send fresh full state to re-hydrate reconnected client
        broadcastState(room.roomId, snapshotState);
      } else {
        socket.to(room.roomId).emit('room:player_joined', {
          playerId: player.playerId,
          playerName: player.name,
          playerColor: 'red',
        });
      }
    });

    // ── Room: Ready Toggle ───────────────────────────────────
    socket.on('room:ready', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const room = roomManager.setReady(data.roomId, entry.player.playerId, data.isReady);
      if (!room) return;

      broadcastState(data.roomId, buildLobbyState(room));
    });

    // ── Room: Update Settings (Host Only) ───────────────────
    socket.on('room:update_settings', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const result = roomManager.updateSettings(data.roomId, entry.player.playerId, {
        mode: data.mode,
        rulePreset: data.rulePreset,
        targetPlayerCount: data.targetPlayerCount,
        turnTimeoutSeconds: data.turnTimeoutSeconds,
      });

      if ('error' in result) {
        socket.emit('room:error', { message: result.error });
        return;
      }

      broadcastState(data.roomId, buildLobbyState(result));
    });

    // ── Room: Start Game (Host Only) ─────────────────────────
    socket.on('room:start_game', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const result = roomManager.startGame(data.roomId, entry.player.playerId);
      if ('error' in result) {
        socket.emit('room:error', { message: result.error, code: 'START_FAILED' });
        return;
      }

      const room = roomManager.getRoom(data.roomId)!;
      io.to(data.roomId).emit('game:started', result.gameState);
      startTurnTimer(io, data.roomId, room.turnTimeoutSeconds);
    });

    // ── Game: Roll Dice ──────────────────────────────────────
    socket.on('game:roll_dice', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const room = roomManager.getRoom(data.roomId);
      if (!room?.gameState) return;

      try {
        clearTurnTimer(data.roomId);
        const rollResult = LudoEngine.rollDice(room.gameState, entry.player.playerId);

        io.to(data.roomId).emit('game:dice_rolled', {
          playerId: entry.player.playerId,
          dice: rollResult.dice,
          legalMoveTokenIds: rollResult.legalMoveTokenIds,
        });

        if (rollResult.wasTurnPassed) {
          io.to(data.roomId).emit('game:turn_passed', {
            activePlayerIndex: room.gameState.activePlayerIndex,
            playerId: room.gameState.players[room.gameState.activePlayerIndex].id,
            reason: rollResult.reason,
          });
        }

        broadcastState(data.roomId, room.gameState);
        startTurnTimer(io, data.roomId, room.turnTimeoutSeconds);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid move';
        socket.emit('room:error', { message: msg, code: 'INVALID_ROLL' });
      }
    });

    // ── Game: Move Token ─────────────────────────────────────
    socket.on('game:move_token', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const room = roomManager.getRoom(data.roomId);
      if (!room?.gameState) return;

      try {
        clearTurnTimer(data.roomId);
        const prevLedgerLen = room.gameState.captureLedger.length;

        const moveResult = LudoEngine.moveToken(
          room.gameState,
          entry.player.playerId,
          data.tokenId
        );

        // Broadcast token movement
        const token = moveResult.validation.token!;
        io.to(data.roomId).emit('game:token_moved', {
          playerId: entry.player.playerId,
          tokenId: data.tokenId,
          fromStep: token.stepCount - (room.gameState.currentTurnDice ?? 0),
          toStep: token.stepCount,
          fromCommon: token.commonIndex,
          toCommon: token.commonIndex,
          gameState: room.gameState,
        });

        // Emit capture events for any captures that occurred
        const newCaptures = room.gameState.captureLedger.slice(prevLedgerLen);
        for (const capture of newCaptures) {
          const leaderboard = HunterTracker.computeLeaderboard(room.gameState);
          io.to(data.roomId).emit('game:token_captured', {
            capture,
            hunterLeaderboard: leaderboard,
            gameState: room.gameState,
          });
        }

        if (room.gameState.status === 'COMPLETED' || room.gameState.status === 'EARLY_ENDED') {
          clearTurnTimer(data.roomId);
          const awards = HunterTracker.computeAwards(room.gameState);
          const leaderboard = HunterTracker.computeLeaderboard(room.gameState);
          io.to(data.roomId).emit('game:match_ended', {
            gameState: room.gameState,
            awards,
            hunterLeaderboard: leaderboard,
          });
          saveMatch(room.gameState, awards).catch(() => {});
        } else {
          broadcastState(data.roomId, room.gameState);
          startTurnTimer(io, data.roomId, room.turnTimeoutSeconds);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid move';
        socket.emit('room:error', { message: msg, code: 'INVALID_MOVE' });
      }
    });

    // ── Vote: Propose Early End ──────────────────────────────
    socket.on('vote:propose', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const room = roomManager.getRoom(data.roomId);
      if (!room?.gameState) return;

      // Enforce cooldown
      if (entry.player.voteProposalCooldownUntil > Date.now()) {
        const remainingSecs = Math.ceil((entry.player.voteProposalCooldownUntil - Date.now()) / 1000);
        socket.emit('room:error', { message: `Please wait ${remainingSecs}s before proposing again`, code: 'VOTE_COOLDOWN' });
        return;
      }

      const result = VoteEngine.proposeEarlyEnd(room.gameState, entry.player.playerId, 25);
      if (!result.success) {
        socket.emit('room:error', { message: result.error ?? 'Could not start vote', code: 'VOTE_FAILED' });
        return;
      }

      entry.player.voteProposalCooldownUntil = Date.now() + VOTE_COOLDOWN_MS;

      const vote = room.gameState.earlyEndVote!;
      io.to(data.roomId).emit('vote:started', {
        proposedBy: entry.player.playerId,
        proposedByName: entry.player.name,
        expiresAt: vote.expiresAt,
      });

      broadcastState(data.roomId, room.gameState);

      // Auto-resolve when vote expires
      setTimeout(() => {
        if (!room.gameState?.earlyEndVote?.active) return;
        const resolution = VoteEngine.checkResolution(room.gameState);
        room.gameState.earlyEndVote!.active = false;
        io.to(data.roomId).emit('vote:resolved', {
          accepted: resolution.accepted,
          reason: resolution.reason,
        });
        broadcastState(data.roomId, room.gameState);
      }, 25_000);
    });

    // ── Vote: Cast ───────────────────────────────────────────
    socket.on('vote:cast', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const room = roomManager.getRoom(data.roomId);
      if (!room?.gameState) return;

      const { success, resolution, error } = VoteEngine.castVote(
        room.gameState,
        entry.player.playerId,
        data.vote
      );

      if (!success) {
        socket.emit('room:error', { message: error ?? 'Vote failed', code: 'VOTE_FAILED' });
        return;
      }

      io.to(data.roomId).emit('vote:updated', { votes: room.gameState.earlyEndVote?.votes ?? {} });

      if (resolution.isResolved) {
        io.to(data.roomId).emit('vote:resolved', {
          accepted: resolution.accepted,
          reason: resolution.reason,
        });

        if (resolution.accepted) {
          clearTurnTimer(data.roomId);
          const awards = HunterTracker.computeAwards(room.gameState);
          const leaderboard = HunterTracker.computeLeaderboard(room.gameState);
          io.to(data.roomId).emit('game:match_ended', {
            gameState: room.gameState,
            awards,
            hunterLeaderboard: leaderboard,
          });
          saveMatch(room.gameState, awards).catch(() => {});
        } else {
          broadcastState(data.roomId, room.gameState);
        }
      }
    });

    // ── Chat: Send ───────────────────────────────────────────
    socket.on('chat:send', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const text = data.text.trim().slice(0, 200);
      if (!text) return;

      io.to(data.roomId).emit('chat:message', {
        playerId: entry.player.playerId,
        playerName: entry.player.name,
        text,
        timestamp: Date.now(),
      });
    });

    // ── Chat: Reaction ───────────────────────────────────────
    socket.on('chat:react', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      const allowed = ['🎉', '😂', '😱', '🔥', '👏', '💀', '🎯', '😤', '🏆', '🤣'];
      if (!allowed.includes(data.emoji)) return;

      io.to(data.roomId).emit('chat:reaction', {
        playerId: entry.player.playerId,
        emoji: data.emoji,
        timestamp: Date.now(),
      });
    });

    // ── WebRTC: Signaling ────────────────────────────────────
    socket.on('webrtc:signal', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      if (data.targetPlayerId) {
        // Direct unicast signal to player's private channel
        io.to(`player:${data.targetPlayerId}`).emit('webrtc:signal', {
          senderPlayerId: entry.player.playerId,
          signal: data.signal,
        });
      } else {
        // Broadcast signal to whole room except sender
        socket.to(data.roomId).emit('webrtc:signal', {
          senderPlayerId: entry.player.playerId,
          signal: data.signal,
        });
      }
    });

    // ── Media Status (Cam / Mic live indicators) ─────────────
    socket.on('media:status', (data) => {
      const entry = roomManager.getRoomBySocketId(socket.id);
      if (!entry) return;

      socket.to(data.roomId).emit('media:player_status', {
        playerId: entry.player.playerId,
        cameraEnabled: data.cameraEnabled,
        micEnabled: data.micEnabled,
      });
    });

    // ── Room: Leave ──────────────────────────────────────────
    socket.on('room:leave', (data) => {
      handleLeave(socket, data.roomId);
    });

    // ── Disconnect ───────────────────────────────────────────
    socket.on('disconnect', () => {
      const info = roomManager.markDisconnected(socket.id);
      if (!info) return;

      const { room, player } = info;

      socket.to(room.roomId).emit('room:player_left', {
        playerId: player.playerId,
        playerName: player.name,
      });

      if (room.gameState?.status === 'IN_GAME') {
        broadcastState(room.roomId, room.gameState);

        // Start grace period: if player doesn't reconnect within 30s,
        // their turns will be auto-passed until they return
        const timerKey = `${room.roomId}:${player.playerId}`;
        const timer = setTimeout(() => {
          disconnectTimers.delete(timerKey);

          // If still disconnected, consider transferring host
          if (!player.isConnected) {
            if (player.isHost) {
              const newHost = roomManager.transferHostIfNeeded(room.roomId, player.playerId);
              if (newHost && room.gameState) {
                broadcastState(room.roomId, room.gameState);
              }
            }
          }
        }, DISCONNECT_GRACE_MS);

        disconnectTimers.set(timerKey, timer);
      } else if (room.players.filter(p => p.isConnected).length === 0) {
        // All players disconnected from lobby - room will be cleaned up naturally by TTL
      }
    });
  });

  function handleLeave(socket: LudoSocket, roomId: string): void {
    const info = roomManager.getRoomBySocketId(socket.id);
    if (!info) return;

    const { room, player } = info;
    socket.leave(roomId);

    // If host leaves lobby, migrate to next player
    if (player.isHost && !room.gameState) {
      const newHost = roomManager.transferHostIfNeeded(roomId, player.playerId);
      if (newHost) {
        io.to(roomId).emit('room:state_update', buildLobbyState(room));
      }
    }

    io.to(roomId).emit('room:player_left', {
      playerId: player.playerId,
      playerName: player.name,
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

import { GameState as GS, TRADITIONAL_COLORS, ALL_PLAYER_COLORS } from '@ludoverse/shared';
import type { Room } from '../rooms/RoomManager.js';

function buildLobbyState(room: Room): GS {
  const colors = room.mode === 'TRADITIONAL_4P' ? TRADITIONAL_COLORS : ALL_PLAYER_COLORS;
  return {
    roomId: room.roomId,
    mode: room.mode,
    rulePreset: room.rulePreset,
    targetPlayerCount: room.targetPlayerCount,
    tokensPerPlayer: (room.mode === 'CUSTOM_RADIAL' && room.rulePreset === 'RAPID') ? 2 : 4,
    status: 'LOBBY',
    players: room.players.map((p, index) => ({
      id: p.playerId,
      name: p.name,
      color: colors[index] ?? ALL_PLAYER_COLORS[index % ALL_PLAYER_COLORS.length],
      playerIndex: index,
      tokens: [],
      isReady: p.isReady,
      isHost: p.isHost,
      isConnected: p.isConnected,
      hasFinished: false,
    })),
    activePlayerIndex: 0,
    currentTurnDice: null,
    consecutiveSixes: 0,
    turnPhase: 'WAITING_FOR_ROLL',
    legalMoveTokenIds: [],
    captureLedger: [],
    earlyEndVote: null,
    turnDeadline: null,
    matchStartTime: null,
    matchEndTime: null,
    winnerPlayerId: null,
    version: 1,
  };
}
