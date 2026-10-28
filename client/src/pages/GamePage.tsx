import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameRoom } from '@/hooks/useGameRoom';
import { useMediaChat } from '@/hooks/useMediaChat';
import { sounds } from '@/lib/sound';
import { LudoBoard } from '@/components/board/LudoBoard';
import { RadialBoard } from '@/components/board/RadialBoard';
import { IntegratedPlayerDiceStation } from '@/components/game/IntegratedPlayerDiceStation';
import { PlayerVideoStation } from '@/components/game/PlayerVideoStation';
import { HunterLeaderboard } from '@/components/leaderboard/HunterLeaderboard';
import { ChatPanel } from '@/components/social/ChatPanel';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PLAYER_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { loadSession, clearSession } from '@/hooks/useSocket';
import {
  Trophy,
  MessageCircle,
  Flag,
  WifiOff,
  Loader2,
  CheckCircle,
  XCircle,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  ArrowLeft,
  AlertCircle,
  Home,
  RefreshCw,
} from 'lucide-react';

function shouldAutoMoveToken(player: any, legalMoveTokenIds: number[]): number | null {
  if (!legalMoveTokenIds || legalMoveTokenIds.length === 0) return null;

  // Case 1: Exactly 1 single legal move exists
  if (legalMoveTokenIds.length === 1) {
    return legalMoveTokenIds[0];
  }

  // Case 2: All legal tokens are at the exact same location (e.g. all in yard or on the same cell)
  const legalTokens = player.tokens.filter((t: any) => legalMoveTokenIds.includes(t.id));
  if (legalTokens.length > 0) {
    const first = legalTokens[0];
    const allInSamePlace = legalTokens.every(
      (t: any) => t.status === first.status && t.stepCount === first.stepCount
    );
    if (allInSamePlace) {
      return first.id;
    }
  }

  return null;
}

export default function GamePage() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const {
    gameState,
    playerId,
    joinRoom,
    rollDice,
    moveToken,
    sendChat,
    sendReaction,
    proposeEarlyEnd,
    castVote,
    chatMessages,
    reactions,
    earlyEndVote,
    errorMsg,
  } = useGameRoom();

  const [arenaTimedOut, setArenaTimedOut] = useState(false);
  const reconnectTried = useRef(false);

  // Attempt auto-reconnect if session exists
  useEffect(() => {
    if (!gameState && !reconnectTried.current) {
      reconnectTried.current = true;
      const clean = roomId.toUpperCase();
      const session = loadSession(clean);
      if (session?.roomId === clean && session?.sessionToken) {
        joinRoom(clean, session.playerName, session.sessionToken, (err) => {
          if (err) {
            clearSession(clean);
            setArenaTimedOut(true);
          }
        });
      }
      const timer = setTimeout(() => {
        setArenaTimedOut(true);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [gameState, joinRoom, roomId]);

  const otherPlayerIdsKey = (gameState?.players ?? [])
    .filter((p) => p.id !== playerId && p.isConnected)
    .map((p) => p.id)
    .sort()
    .join(',');

  const otherPlayerIds = useMemo(() => {
    return otherPlayerIdsKey ? otherPlayerIdsKey.split(',') : [];
  }, [otherPlayerIdsKey]);

  const {
    micEnabled,
    cameraEnabled,
    toggleMic,
    toggleCamera,
    speakingPlayers,
    localVideoStream,
    remoteStreams,
    remoteMediaStatus,
    errorMsg: mediaError,
  } = useMediaChat(roomId, playerId, otherPlayerIds);

  const [isSoundMuted, setIsSoundMuted] = useState(sounds.getMuted());
  const [sheet, setSheet] = useState<'leaderboard' | 'chat' | null>(null);

  const prevActiveIndex = useRef<number | null>(null);
  const prevCaptureCount = useRef<number>(0);

  // Sound triggers on game events
  useEffect(() => {
    if (!gameState) return;

    // Capture sound trigger
    if (gameState.captureLedger.length > prevCaptureCount.current) {
      sounds.playCapture();
    }
    prevCaptureCount.current = gameState.captureLedger.length;

    // My turn alert sound trigger
    if (prevActiveIndex.current !== null && prevActiveIndex.current !== gameState.activePlayerIndex) {
      if (gameState.players[gameState.activePlayerIndex]?.id === playerId) {
        sounds.playTurnAlert();
      }
    }
    prevActiveIndex.current = gameState.activePlayerIndex;

    // Victory sound trigger
    if (gameState.status === 'COMPLETED' && gameState.winnerPlayerId) {
      sounds.playVictory();
    }
  }, [gameState, playerId]);

  // Redirect to results when match ends
  useEffect(() => {
    if (gameState?.status === 'COMPLETED' || gameState?.status === 'EARLY_ENDED') {
      const timer = setTimeout(() => navigate(`/room/${roomId}/results`), 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState?.status, navigate, roomId]);

  // Redirect to lobby if not in game yet
  useEffect(() => {
    if (gameState?.status === 'LOBBY') {
      navigate(`/room/${roomId}`, { replace: true });
    }
  }, [gameState?.status, navigate, roomId]);

  if (!gameState || !playerId) {
    if (errorMsg || arenaTimedOut) {
      return (
        <div className="min-h-screen ludo-king-bg flex flex-col items-center justify-center p-4 select-none">
          <div className="w-full max-w-sm bg-[#002868]/95 border-2 border-[#FFC928] rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-3">
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <h2 className="text-xl font-black text-white">Arena Notice</h2>
            <p className="text-xs text-sky-200 font-medium mt-1 mb-3">
              {errorMsg || 'Match session not found or connection lost.'}
            </p>
            <div className="w-full bg-[#001740] rounded-xl p-3 border border-white/10 mb-5">
              <p className="text-[11px] text-sky-300 font-bold">Room Code:</p>
              <p className="text-xl font-mono font-black text-[#FFC928] tracking-widest">{roomId.toUpperCase()}</p>
              <p className="text-[10px] text-white/50 mt-1">This room may have ended, or the server was restarted.</p>
            </div>

            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={() => {
                  clearSession();
                  navigate(`/room/${roomId.toUpperCase()}`);
                }}
                className="w-full py-3 px-4 rounded-xl font-black text-sm uppercase tracking-wide bg-gradient-to-b from-[#FFE978] to-[#FFC928] text-[#07305D] border-2 border-[#FFE978] shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                Go to Room Lobby
              </button>
              <button
                onClick={() => {
                  clearSession();
                  navigate('/');
                }}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-white/10 hover:bg-white/15 border border-white/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Home size={14} />
                Return to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center ludo-king-bg text-white select-none">
        <div className="flex flex-col items-center gap-3 bg-[#002868]/90 border border-[#FFC928]/40 px-6 py-5 rounded-2xl shadow-2xl">
          <Loader2 size={36} className="animate-spin text-[#FFC928]" />
          <p className="text-white text-sm font-black tracking-wide">Connecting to Game Arena…</p>
          <p className="text-sky-200 text-xs">Synchronizing game board</p>
        </div>
      </div>
    );
  }

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyTurn = activePlayer?.id === playerId;
  const me = gameState.players.find((p) => p.id === playerId);
  const isRadial = gameState.mode === 'CUSTOM_RADIAL';

  const handleTokenClick = (pId: string, tokenId: number) => {
    if (isMyTurn && pId === playerId && gameState.turnPhase === 'WAITING_FOR_MOVE') {
      sounds.playTokenMove();
      moveToken(roomId, tokenId);
    }
  };

  const handleRollDice = () => {
    if (isMyTurn && gameState.turnPhase === 'WAITING_FOR_ROLL') {
      sounds.playDiceRoll();
      rollDice(roomId);
    }
  };

  // Auto-move single legal token or when all moveable tokens are in the exact same place
  const autoMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!gameState || !isMyTurn || gameState.turnPhase !== 'WAITING_FOR_MOVE') {
      if (autoMoveTimerRef.current) {
        clearTimeout(autoMoveTimerRef.current);
        autoMoveTimerRef.current = null;
      }
      return;
    }

    const autoTokenId = shouldAutoMoveToken(activePlayer, gameState.legalMoveTokenIds);
    if (autoTokenId !== null) {
      // 420ms delay so player visually sees the dice result before token automatically takes steps
      autoMoveTimerRef.current = setTimeout(() => {
        handleTokenClick(playerId, autoTokenId);
      }, 420);

      return () => {
        if (autoMoveTimerRef.current) {
          clearTimeout(autoMoveTimerRef.current);
          autoMoveTimerRef.current = null;
        }
      };
    }
  }, [gameState?.turnPhase, gameState?.version, isMyTurn]);

  // Helper to get video stream for a player
  const getPlayerStream = (pId: string) => {
    return pId === playerId ? localVideoStream : remoteStreams.get(pId);
  };

  // 4 corners player assignment:
  // p0: Red (Top-Left)
  // p1: Green (Top-Right)
  // p2: Yellow (Bottom-Right)
  // p3: Blue (Bottom-Left)
  const p0 = gameState.players[0];
  const p1 = gameState.players[1];
  const p2 = gameState.players[2];
  const p3 = gameState.players[3];

  // For Radial 5-9P: split players into Left Flank and Right Flank
  const half = Math.ceil(gameState.players.length / 2);
  const rightFlank = gameState.players.slice(0, half);
  const leftFlank = gameState.players.slice(half);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col ludo-king-bg select-none">
      {/* ── Connection alert ── */}
      {!me?.isConnected && (
        <div className="flex items-center justify-center gap-2 py-1.5 bg-red-600/90 text-white text-xs font-bold z-50 shrink-0">
          <WifiOff size={14} className="animate-pulse" />
          <span>Connection interrupted — reconnecting to room…</span>
        </div>
      )}

      {/* ── Media Alert Banner (Permissions / Network) ── */}
      {mediaError && (
        <div className="flex items-center justify-center gap-2 py-1.5 px-3 bg-amber-500 text-[#002868] text-xs font-black z-50 shrink-0 shadow-md">
          <AlertCircle size={14} />
          <span>{mediaError}</span>
        </div>
      )}

      {/* ── Top Bar ── */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-2 bg-[#002868]/95 border-b border-[#FFC928]/40 shadow-xl shrink-0 z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Lobby</span>
          </button>
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-base">🎲</span>
            <span className="text-xs sm:text-sm font-black text-[#FFC928]">Room {roomId.toUpperCase()}</span>
          </div>
        </div>

        {/* Turn Indicator Banner */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#04153B] border border-[#FFC928]/50 shadow-md">
          <span
            className="w-2.5 h-2.5 rounded-full animate-ping"
            style={{ backgroundColor: PLAYER_COLORS[activePlayer?.color || 'red'].hex }}
          />
          <span
            className="text-xs font-black"
            style={{ color: PLAYER_COLORS[activePlayer?.color || 'red'].hex }}
          >
            {isMyTurn ? 'YOUR TURN' : `${activePlayer?.name}'s Turn`}
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSheet((s) => (s === 'leaderboard' ? null : 'leaderboard'))}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-[#FFC928] transition-all relative"
            title="Hunter Rankings"
          >
            <Trophy size={16} />
            {gameState.captureLedger.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                {gameState.captureLedger.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setSheet((s) => (s === 'chat' ? null : 'chat'))}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-sky-300 transition-all relative"
            title="Chat & Reactions"
          >
            <MessageCircle size={16} />
            {chatMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#087BE8] text-white text-[9px] font-black flex items-center justify-center">
                {chatMessages.length}
              </span>
            )}
          </button>

          <button
            onClick={() => proposeEarlyEnd(roomId)}
            className="p-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-bold text-red-300 transition-all"
            title="Propose Early End"
          >
            <Flag size={16} />
          </button>
        </div>
      </header>

      {/* ── Main Arena: Board + Player Stations ── */}
      <main className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden relative">
        {isRadial ? (
          /* ── 5 to 9 Players: Radial Polygon Board with Flanks ── */
          <div className="w-full h-full flex items-center justify-center gap-4 max-w-7xl">
            {/* Left Flank */}
            <div className="hidden md:flex flex-col justify-around gap-2 z-20 shrink-0">
              {leftFlank.map((player) => (
                <PlayerVideoStation
                  key={player.id}
                  player={player}
                  isActive={gameState.activePlayerIndex === player.playerIndex}
                  isMe={player.id === playerId}
                  isSpeaking={speakingPlayers.has(player.id)}
                  stream={getPlayerStream(player.id)}
                  cameraEnabled={cameraEnabled}
                  isRemoteCameraOn={remoteMediaStatus.get(player.id)?.cameraEnabled}
                  micEnabled={micEnabled}
                  onToggleCamera={player.id === playerId ? toggleCamera : undefined}
                  onToggleMic={player.id === playerId ? toggleMic : undefined}
                />
              ))}
            </div>

            {/* Central Radial Board */}
            <div className="flex-1 max-w-[min(88vw,calc(100vh-140px))] aspect-square flex items-center justify-center">
              <RadialBoard
                players={gameState.players}
                activePlayerIndex={gameState.activePlayerIndex}
                legalMoveTokenIds={isMyTurn ? gameState.legalMoveTokenIds : []}
                onTokenClick={handleTokenClick}
                myPlayerId={playerId}
                className="w-full h-full"
              />
            </div>

            {/* Right Flank */}
            <div className="hidden md:flex flex-col justify-around gap-2 z-20 shrink-0">
              {rightFlank.map((player) => (
                <PlayerVideoStation
                  key={player.id}
                  player={player}
                  isActive={gameState.activePlayerIndex === player.playerIndex}
                  isMe={player.id === playerId}
                  isSpeaking={speakingPlayers.has(player.id)}
                  stream={getPlayerStream(player.id)}
                  cameraEnabled={cameraEnabled}
                  isRemoteCameraOn={remoteMediaStatus.get(player.id)?.cameraEnabled}
                  micEnabled={micEnabled}
                  onToggleCamera={player.id === playerId ? toggleCamera : undefined}
                  onToggleMic={player.id === playerId ? toggleMic : undefined}
                />
              ))}
            </div>
          </div>
        ) : (
          /* ── 2 to 4 Players: Traditional Square Ludo Board ── */
          <div className="w-full h-full flex items-center justify-center">
            {/* ── DESKTOP 3-COLUMN VIEW (hidden on mobile, visible on >= lg screens) ── */}
            <div className="hidden lg:grid grid-cols-[220px_1fr_220px] gap-6 items-center w-full max-w-5xl h-full max-h-[680px]">
              {/* Left Column: Top-Left (p0: Red) & Bottom-Left (p3: Blue) */}
              <div className="flex flex-col justify-between h-[560px] py-4">
                {p0 ? (
                  <IntegratedPlayerDiceStation
                    player={p0}
                    isActive={gameState.activePlayerIndex === 0}
                    isMe={p0.id === playerId}
                    turnPhase={gameState.turnPhase as any}
                    currentDice={gameState.activePlayerIndex === 0 ? gameState.currentTurnDice : null}
                    onRollDice={handleRollDice}
                    orientation="left"
                    stream={getPlayerStream(p0.id)}
                    cameraEnabled={cameraEnabled}
                    isRemoteCameraOn={remoteMediaStatus.get(p0.id)?.cameraEnabled}
                    micEnabled={micEnabled}
                    onToggleCamera={p0.id === playerId ? toggleCamera : undefined}
                    onToggleMic={p0.id === playerId ? toggleMic : undefined}
                    isSpeaking={speakingPlayers.has(p0.id)}
                    capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p0.id).length}
                  />
                ) : <div />}

                {p3 ? (
                  <IntegratedPlayerDiceStation
                    player={p3}
                    isActive={gameState.activePlayerIndex === 3}
                    isMe={p3.id === playerId}
                    turnPhase={gameState.turnPhase as any}
                    currentDice={gameState.activePlayerIndex === 3 ? gameState.currentTurnDice : null}
                    onRollDice={handleRollDice}
                    orientation="left"
                    stream={getPlayerStream(p3.id)}
                    cameraEnabled={cameraEnabled}
                    isRemoteCameraOn={remoteMediaStatus.get(p3.id)?.cameraEnabled}
                    micEnabled={micEnabled}
                    onToggleCamera={p3.id === playerId ? toggleCamera : undefined}
                    onToggleMic={p3.id === playerId ? toggleMic : undefined}
                    isSpeaking={speakingPlayers.has(p3.id)}
                    capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p3.id).length}
                  />
                ) : <div />}
              </div>

              {/* Center Column: 15x15 Ludo Board with NO overlapping cards */}
              <div className="flex items-center justify-center w-full h-full">
                <div className="w-full max-w-[560px] aspect-square rounded-2xl p-1 bg-white/5 border border-white/15 shadow-2xl">
                  <LudoBoard
                    players={gameState.players}
                    activePlayerIndex={gameState.activePlayerIndex}
                    legalMoveTokenIds={isMyTurn ? gameState.legalMoveTokenIds : []}
                    onTokenClick={handleTokenClick}
                    onRollDice={handleRollDice}
                    turnPhase={gameState.turnPhase}
                    myPlayerId={playerId}
                  />
                </div>
              </div>

              {/* Right Column: Top-Right (p1: Green) & Bottom-Right (p2: Yellow) */}
              <div className="flex flex-col justify-between h-[560px] py-4">
                {p1 ? (
                  <IntegratedPlayerDiceStation
                    player={p1}
                    isActive={gameState.activePlayerIndex === 1}
                    isMe={p1.id === playerId}
                    turnPhase={gameState.turnPhase as any}
                    currentDice={gameState.activePlayerIndex === 1 ? gameState.currentTurnDice : null}
                    onRollDice={handleRollDice}
                    orientation="right"
                    stream={getPlayerStream(p1.id)}
                    cameraEnabled={cameraEnabled}
                    isRemoteCameraOn={remoteMediaStatus.get(p1.id)?.cameraEnabled}
                    micEnabled={micEnabled}
                    onToggleCamera={p1.id === playerId ? toggleCamera : undefined}
                    onToggleMic={p1.id === playerId ? toggleMic : undefined}
                    isSpeaking={speakingPlayers.has(p1.id)}
                    capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p1.id).length}
                  />
                ) : <div />}

                {p2 ? (
                  <IntegratedPlayerDiceStation
                    player={p2}
                    isActive={gameState.activePlayerIndex === 2}
                    isMe={p2.id === playerId}
                    turnPhase={gameState.turnPhase as any}
                    currentDice={gameState.activePlayerIndex === 2 ? gameState.currentTurnDice : null}
                    onRollDice={handleRollDice}
                    orientation="right"
                    stream={getPlayerStream(p2.id)}
                    cameraEnabled={cameraEnabled}
                    isRemoteCameraOn={remoteMediaStatus.get(p2.id)?.cameraEnabled}
                    micEnabled={micEnabled}
                    onToggleCamera={p2.id === playerId ? toggleCamera : undefined}
                    onToggleMic={p2.id === playerId ? toggleMic : undefined}
                    isSpeaking={speakingPlayers.has(p2.id)}
                    capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p2.id).length}
                  />
                ) : <div />}
              </div>
            </div>

            {/* ── MOBILE PORTRAIT VIEW (visible on < lg screens) ── */}
            <div className="flex lg:hidden flex-col items-center justify-between w-full max-w-md h-full gap-2 py-1">
              {/* Top Row: p0 (Red) & p1 (Green) */}
              <div className="w-full flex items-center justify-between gap-2 px-1">
                {p0 ? (
                  <div className="flex-1 max-w-[190px]">
                    <IntegratedPlayerDiceStation
                      player={p0}
                      isActive={gameState.activePlayerIndex === 0}
                      isMe={p0.id === playerId}
                      turnPhase={gameState.turnPhase as any}
                      currentDice={gameState.activePlayerIndex === 0 ? gameState.currentTurnDice : null}
                      onRollDice={handleRollDice}
                      orientation="left"
                      stream={getPlayerStream(p0.id)}
                      cameraEnabled={cameraEnabled}
                      isRemoteCameraOn={remoteMediaStatus.get(p0.id)?.cameraEnabled}
                      micEnabled={micEnabled}
                      onToggleCamera={p0.id === playerId ? toggleCamera : undefined}
                      onToggleMic={p0.id === playerId ? toggleMic : undefined}
                      isSpeaking={speakingPlayers.has(p0.id)}
                      capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p0.id).length}
                    />
                  </div>
                ) : <div className="flex-1" />}

                {p1 ? (
                  <div className="flex-1 max-w-[190px]">
                    <IntegratedPlayerDiceStation
                      player={p1}
                      isActive={gameState.activePlayerIndex === 1}
                      isMe={p1.id === playerId}
                      turnPhase={gameState.turnPhase as any}
                      currentDice={gameState.activePlayerIndex === 1 ? gameState.currentTurnDice : null}
                      onRollDice={handleRollDice}
                      orientation="right"
                      stream={getPlayerStream(p1.id)}
                      cameraEnabled={cameraEnabled}
                      isRemoteCameraOn={remoteMediaStatus.get(p1.id)?.cameraEnabled}
                      micEnabled={micEnabled}
                      onToggleCamera={p1.id === playerId ? toggleCamera : undefined}
                      onToggleMic={p1.id === playerId ? toggleMic : undefined}
                      isSpeaking={speakingPlayers.has(p1.id)}
                      capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p1.id).length}
                    />
                  </div>
                ) : <div className="flex-1" />}
              </div>

              {/* Center Square Board */}
              <div className="w-full aspect-square max-w-[390px] rounded-2xl bg-white/5 border border-white/20 p-1 shadow-2xl flex items-center justify-center my-auto">
                <LudoBoard
                  players={gameState.players}
                  activePlayerIndex={gameState.activePlayerIndex}
                  legalMoveTokenIds={isMyTurn ? gameState.legalMoveTokenIds : []}
                  onTokenClick={handleTokenClick}
                  onRollDice={handleRollDice}
                  turnPhase={gameState.turnPhase}
                  myPlayerId={playerId}
                />
              </div>

              {/* Bottom Row: p3 (Blue) & p2 (Yellow) */}
              <div className="w-full flex items-center justify-between gap-2 px-1">
                {p3 ? (
                  <div className="flex-1 max-w-[190px]">
                    <IntegratedPlayerDiceStation
                      player={p3}
                      isActive={gameState.activePlayerIndex === 3}
                      isMe={p3.id === playerId}
                      turnPhase={gameState.turnPhase as any}
                      currentDice={gameState.activePlayerIndex === 3 ? gameState.currentTurnDice : null}
                      onRollDice={handleRollDice}
                      orientation="left"
                      stream={getPlayerStream(p3.id)}
                      cameraEnabled={cameraEnabled}
                      isRemoteCameraOn={remoteMediaStatus.get(p3.id)?.cameraEnabled}
                      micEnabled={micEnabled}
                      onToggleCamera={p3.id === playerId ? toggleCamera : undefined}
                      onToggleMic={p3.id === playerId ? toggleMic : undefined}
                      isSpeaking={speakingPlayers.has(p3.id)}
                      capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p3.id).length}
                    />
                  </div>
                ) : <div className="flex-1" />}

                {p2 ? (
                  <div className="flex-1 max-w-[190px]">
                    <IntegratedPlayerDiceStation
                      player={p2}
                      isActive={gameState.activePlayerIndex === 2}
                      isMe={p2.id === playerId}
                      turnPhase={gameState.turnPhase as any}
                      currentDice={gameState.activePlayerIndex === 2 ? gameState.currentTurnDice : null}
                      onRollDice={handleRollDice}
                      orientation="right"
                      stream={getPlayerStream(p2.id)}
                      cameraEnabled={cameraEnabled}
                      isRemoteCameraOn={remoteMediaStatus.get(p2.id)?.cameraEnabled}
                      micEnabled={micEnabled}
                      onToggleCamera={p2.id === playerId ? toggleCamera : undefined}
                      onToggleMic={p2.id === playerId ? toggleMic : undefined}
                      isSpeaking={speakingPlayers.has(p2.id)}
                      capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p2.id).length}
                    />
                  </div>
                ) : <div className="flex-1" />}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Early-End Vote Modal ── */}
      {earlyEndVote && !earlyEndVote.resolved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative w-full max-w-sm bg-[#002868] border-2 border-[#FFC928] rounded-3xl p-5 shadow-2xl animate-slide-up text-white">
            <div className="flex items-center gap-2 mb-3">
              <Flag size={20} className="text-[#FFC928]" />
              <h3 className="font-black text-lg text-[#FFC928]">End Match Early?</h3>
            </div>
            <p className="text-xs text-sky-100 mb-4">
              <span className="font-bold text-white">{earlyEndVote.proposedByName}</span> proposed to end the match early. Unanimous agreement required.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => castVote(roomId, 'REJECT')}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-xs uppercase"
              >
                Keep Playing
              </button>
              <button
                onClick={() => castVote(roomId, 'ACCEPT')}
                className="flex-1 py-2.5 rounded-xl bg-[#FFC928] hover:bg-[#FFE978] text-[#07305D] font-black text-xs uppercase"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Sheets: Leaderboard & Chat ── */}
      <BottomSheet
        open={sheet === 'leaderboard'}
        onClose={() => setSheet(null)}
        title="🎯 Hunter Leaderboard"
      >
        <HunterLeaderboard gameState={gameState} />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'chat'}
        onClose={() => setSheet(null)}
        title="💬 Chat & Reactions"
      >
        <ChatPanel
          messages={chatMessages}
          myPlayerId={playerId}
          gameState={gameState}
          onSend={(text) => sendChat(roomId, text)}
          onReaction={(emoji) => sendReaction(roomId, emoji)}
        />
      </BottomSheet>
    </div>
  );
}
