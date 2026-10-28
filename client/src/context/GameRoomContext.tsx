import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameMode, GameRulePreset } from '@ludoverse/shared';
import { getSocket, saveSession, loadSession, clearSession, getOrCreateUserId } from '@/hooks/useSocket';

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface FloatingReaction {
  id: string;
  playerId: string;
  emoji: string;
  timestamp: number;
}

export interface EarlyEndVoteUI {
  proposedBy: string;
  proposedByName: string;
  expiresAt: number;
  votes: Record<string, 'ACCEPT' | 'REJECT'>;
  resolved: boolean;
  accepted: boolean;
}

export interface GameRoomContextType {
  gameState: GameState | null;
  playerId: string | null;
  sessionToken: string | null;
  errorMsg: string | null;
  chatMessages: ChatMessage[];
  reactions: FloatingReaction[];
  earlyEndVote: EarlyEndVoteUI | null;
  createRoom: (
    playerName: string,
    optionsOrCb?: { mode?: GameMode; rulePreset?: GameRulePreset; targetPlayerCount?: number } | GameMode | ((roomId: string | null, err?: string) => void),
    rulePresetOrCb?: GameRulePreset | ((roomId: string | null, err?: string) => void),
    cb?: (roomId: string | null, err?: string) => void
  ) => void;
  joinRoom: (roomId: string, playerName: string, sessionToken?: string, cb?: (err?: string) => void) => void;
  rollDice: (roomId: string) => void;
  moveToken: (roomId: string, tokenId: number) => void;
  setReady: (roomId: string, isReady: boolean) => void;
  startGame: (roomId: string) => void;
  updateSettings: (roomId: string, settings: { mode?: GameMode; rulePreset?: GameRulePreset; targetPlayerCount?: number; turnTimeoutSeconds?: number }) => void;
  sendChat: (roomId: string, text: string) => void;
  sendReaction: (roomId: string, emoji: string) => void;
  proposeEarlyEnd: (roomId: string) => void;
  castVote: (roomId: string, vote: 'ACCEPT' | 'REJECT') => void;
  leaveRoom: (roomId: string) => void;
}

const GameRoomContext = createContext<GameRoomContextType | null>(null);

export function GameRoomProvider({ children }: { children: React.ReactNode }) {
  const socket = getSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(() => loadSession()?.playerId ?? null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => loadSession()?.sessionToken ?? null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [earlyEndVote, setEarlyEndVote] = useState<EarlyEndVoteUI | null>(null);

  const reactionsTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Socket event listeners
  useEffect(() => {
    const onJoined = (data: { roomId: string; playerId: string; sessionToken: string; gameState: GameState }) => {
      saveSession({
        roomId: data.roomId,
        playerId: data.playerId,
        sessionToken: data.sessionToken,
        playerName: data.gameState.players.find(p => p.id === data.playerId)?.name ?? '',
      });
      setGameState(data.gameState);
      setPlayerId(data.playerId);
      setSessionToken(data.sessionToken);
      setErrorMsg(null);
    };

    const onStateUpdate = (gs: GameState) => {
      setGameState(prev => {
        if (prev && gs.version < prev.version) {
          console.warn(`[Lobby] Rejected stale state update (incoming v${gs.version} < current v${prev.version})`);
          return prev;
        }
        return gs;
      });
    };

    const onGameStarted = (gs: GameState) => {
      setGameState(gs);
    };

    const onDiceRolled = (data: { playerId: string; dice: number; legalMoveTokenIds: number[] }) => {
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          currentTurnDice: data.dice,
          legalMoveTokenIds: data.legalMoveTokenIds,
          turnPhase: data.legalMoveTokenIds && data.legalMoveTokenIds.length > 0 ? 'WAITING_FOR_MOVE' : 'WAITING_FOR_ROLL',
        };
      });
    };

    const onTokenMoved = (data: { gameState: GameState }) => {
      setGameState(data.gameState);
    };

    const onTokenCaptured = (data: { gameState: GameState }) => {
      setGameState(data.gameState);
    };

    const onTurnPassed = (data: { activePlayerIndex: number }) => {
      setGameState(prev => prev ? { ...prev, activePlayerIndex: data.activePlayerIndex } : prev);
    };

    const onMatchEnded = (data: { gameState: GameState }) => {
      setGameState(data.gameState);
    };

    const onError = (data: { message: string }) => {
      setErrorMsg(data.message);
      if (
        data.message.toLowerCase().includes('not found') ||
        data.message.toLowerCase().includes('expired') ||
        data.message.toLowerCase().includes('already started') ||
        data.message.toLowerCase().includes('full')
      ) {
        clearSession();
      }
      setTimeout(() => setErrorMsg(null), 4000);
    };

    const onChatMessage = (msg: ChatMessage) => {
      setChatMessages(prev => [...prev.slice(-99), { ...msg, id: `${msg.playerId}-${msg.timestamp}` }]);
    };

    const onReaction = (data: { playerId: string; emoji: string; timestamp: number }) => {
      const id = `${data.playerId}-${data.timestamp}`;
      const reaction: FloatingReaction = { id, ...data };
      setReactions(prev => [...prev, reaction]);

      const timer = setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id));
        reactionsTimers.current.delete(id);
      }, 3000);
      reactionsTimers.current.set(id, timer);
    };

    const onVoteStarted = (data: { proposedBy: string; proposedByName: string; expiresAt: number }) => {
      setEarlyEndVote({ ...data, votes: { [data.proposedBy]: 'ACCEPT' }, resolved: false, accepted: false });
    };

    const onVoteUpdated = (data: { votes: Record<string, 'ACCEPT' | 'REJECT'> }) => {
      setEarlyEndVote(prev => prev ? { ...prev, votes: data.votes } : prev);
    };

    const onVoteResolved = (data: { accepted: boolean }) => {
      setEarlyEndVote(prev => prev ? { ...prev, resolved: true, accepted: data.accepted } : prev);
      setTimeout(() => setEarlyEndVote(null), 3000);
    };

    socket.on('room:joined', onJoined);
    socket.on('room:state_update', onStateUpdate);
    socket.on('game:started', onGameStarted);
    socket.on('game:dice_rolled', onDiceRolled as never);
    socket.on('game:token_moved', onTokenMoved as never);
    socket.on('game:token_captured', onTokenCaptured as never);
    socket.on('game:turn_passed', onTurnPassed as never);
    socket.on('game:match_ended', onMatchEnded as never);
    socket.on('room:error', onError);
    socket.on('chat:message', onChatMessage as never);
    socket.on('chat:reaction', onReaction as never);
    socket.on('vote:started', onVoteStarted as never);
    socket.on('vote:updated', onVoteUpdated as never);
    socket.on('vote:resolved', onVoteResolved as never);

    if (!socket.connected) {
      socket.connect();
    }

    // Auto-reconnect if session exists
    const tryReconnect = () => {
      const session = loadSession();
      if (session?.roomId && session?.sessionToken) {
        socket.emit('room:join', {
          roomId: session.roomId.toUpperCase(),
          playerName: session.playerName,
          sessionToken: session.sessionToken,
          userId: session.userId || getOrCreateUserId(),
        });
      }
    };

    if (socket.connected) {
      tryReconnect();
    } else {
      socket.once('connect', tryReconnect);
    }

    return () => {
      socket.off('room:joined', onJoined);
      socket.off('room:state_update', onStateUpdate);
      socket.off('game:started', onGameStarted);
      socket.off('game:dice_rolled', onDiceRolled as never);
      socket.off('game:token_moved', onTokenMoved as never);
      socket.off('game:token_captured', onTokenCaptured as never);
      socket.off('game:turn_passed', onTurnPassed as never);
      socket.off('game:match_ended', onMatchEnded as never);
      socket.off('room:error', onError);
      socket.off('chat:message', onChatMessage as never);
      socket.off('chat:reaction', onReaction as never);
      socket.off('vote:started', onVoteStarted as never);
      socket.off('vote:updated', onVoteUpdated as never);
      socket.off('vote:resolved', onVoteResolved as never);
      reactionsTimers.current.forEach(t => clearTimeout(t));
    };
  }, [socket]);

  const createRoom = useCallback((
    playerName: string,
    optionsOrCb?: { mode?: GameMode; rulePreset?: GameRulePreset; targetPlayerCount?: number } | GameMode | ((roomId: string | null, err?: string) => void),
    rulePresetOrCb?: GameRulePreset | ((roomId: string | null, err?: string) => void),
    cb?: (roomId: string | null, err?: string) => void
  ) => {
    let mode: GameMode = 'TRADITIONAL_4P';
    let rulePreset: GameRulePreset = 'CLASSIC';
    let targetPlayerCount: number | undefined = undefined;
    let callback: ((roomId: string | null, err?: string) => void) | undefined = cb;

    if (typeof optionsOrCb === 'function') {
      callback = optionsOrCb;
    } else if (typeof optionsOrCb === 'object' && optionsOrCb !== null) {
      mode = optionsOrCb.mode ?? (optionsOrCb.targetPlayerCount && optionsOrCb.targetPlayerCount > 4 ? 'CUSTOM_RADIAL' : 'TRADITIONAL_4P');
      rulePreset = optionsOrCb.rulePreset ?? 'CLASSIC';
      targetPlayerCount = optionsOrCb.targetPlayerCount;
      if (typeof rulePresetOrCb === 'function') {
        callback = rulePresetOrCb;
      }
    } else if (typeof optionsOrCb === 'string') {
      mode = optionsOrCb;
      if (typeof rulePresetOrCb === 'function') {
        callback = rulePresetOrCb;
      } else if (rulePresetOrCb) {
        rulePreset = rulePresetOrCb;
      }
    }

    if (!targetPlayerCount) {
      targetPlayerCount = mode === 'CUSTOM_RADIAL' ? 6 : 4;
    }

    if (!socket.connected) {
      socket.connect();
    }

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const msg = 'Server response timed out. Please check your connection or server status.';
        setErrorMsg(msg);
        callback?.(null, msg);
      }
    }, 6000);

    const userId = getOrCreateUserId();
    socket.emit('room:create', { playerName, mode, rulePreset, targetPlayerCount, userId }, (res) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (res.success && res.roomId) {
        setErrorMsg(null);
        callback?.(res.roomId);
      } else {
        const err = res.error || 'Failed to create room';
        setErrorMsg(err);
        callback?.(null, err);
      }
    });
  }, [socket]);

  const joinRoom = useCallback((roomId: string, playerName: string, token?: string, cb?: (err?: string) => void) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    const existingSession = loadSession(cleanRoomId);
    const tokenToUse = token || existingSession?.sessionToken;
    const userId = getOrCreateUserId();

    if (!socket.connected) {
      socket.connect();
    }

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const msg = 'Server response timed out. The room may have expired or server restarted.';
        setErrorMsg(msg);
        cb?.(msg);
      }
    }, 6000);

    socket.emit('room:join', { roomId: cleanRoomId, playerName, sessionToken: tokenToUse, userId }, (res) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (!res.success) {
        const err = res.error || 'Failed to join room';
        if (
          err.toLowerCase().includes('not found') ||
          err.toLowerCase().includes('expired') ||
          err.toLowerCase().includes('full')
        ) {
          clearSession(cleanRoomId);
        }
        setErrorMsg(err);
        cb?.(err);
      } else {
        setErrorMsg(null);
        cb?.();
      }
    });
  }, [socket]);

  const rollDice = useCallback((rId: string) => {
    socket.emit('game:roll_dice', { roomId: rId });
  }, [socket]);

  const moveToken = useCallback((rId: string, tokenId: number) => {
    socket.emit('game:move_token', { roomId: rId, tokenId });
  }, [socket]);

  const setReady = useCallback((rId: string, isReady: boolean) => {
    socket.emit('room:ready', { roomId: rId, isReady });
  }, [socket]);

  const startGame = useCallback((rId: string) => {
    socket.emit('room:start_game', { roomId: rId });
  }, [socket]);

  const updateSettings = useCallback((rId: string, settings: { mode?: GameMode; rulePreset?: GameRulePreset; targetPlayerCount?: number; turnTimeoutSeconds?: number }) => {
    setGameState(prev => {
      if (!prev) return prev;
      const nextTarget = settings.targetPlayerCount ?? prev.targetPlayerCount;
      const nextMode = settings.mode ?? (nextTarget && nextTarget > 4 ? 'CUSTOM_RADIAL' : prev.mode);
      const nextPreset = settings.rulePreset ?? prev.rulePreset;
      return {
        ...prev,
        mode: nextMode,
        rulePreset: nextPreset,
        targetPlayerCount: nextTarget,
        tokensPerPlayer: (nextMode === 'CUSTOM_RADIAL' && nextPreset === 'RAPID') ? 2 : 4,
      };
    });
    socket.emit('room:update_settings', { roomId: rId, ...settings });
  }, [socket]);

  const sendChat = useCallback((rId: string, text: string) => {
    socket.emit('chat:send', { roomId: rId, text });
  }, [socket]);

  const sendReaction = useCallback((rId: string, emoji: string) => {
    socket.emit('chat:react', { roomId: rId, emoji });
  }, [socket]);

  const proposeEarlyEnd = useCallback((rId: string) => {
    socket.emit('vote:propose', { roomId: rId });
  }, [socket]);

  const castVote = useCallback((rId: string, vote: 'ACCEPT' | 'REJECT') => {
    socket.emit('vote:cast', { roomId: rId, vote });
  }, [socket]);

  const leaveRoom = useCallback((rId: string) => {
    const clean = rId.trim().toUpperCase();
    socket.emit('room:leave', { roomId: clean });
    clearSession(clean);
    setGameState(null);
    setPlayerId(null);
    setSessionToken(null);
  }, [socket]);

  return (
    <GameRoomContext.Provider value={{
      gameState,
      playerId,
      sessionToken,
      errorMsg,
      chatMessages,
      reactions,
      earlyEndVote,
      createRoom,
      joinRoom,
      rollDice,
      moveToken,
      setReady,
      startGame,
      updateSettings,
      sendChat,
      sendReaction,
      proposeEarlyEnd,
      castVote,
      leaveRoom,
    }}>
      {children}
    </GameRoomContext.Provider>
  );
}

export function useGameRoom(): GameRoomContextType {
  const context = useContext(GameRoomContext);
  if (!context) {
    throw new Error('useGameRoom must be used within a GameRoomProvider');
  }
  return context;
}
