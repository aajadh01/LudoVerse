import React, { useEffect, useRef } from 'react';
import { PlayerState } from '@ludoverse/shared';
import { PLAYER_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Crown, WifiOff, Mic, MicOff, Video, VideoOff, Loader2 } from 'lucide-react';

interface IntegratedPlayerDiceStationProps {
  player: PlayerState;
  isActive: boolean;
  isMe: boolean;
  isSpeaking?: boolean;
  orientation?: 'left' | 'right'; // 'left' means avatar on left, dice on right (facing board)
  // Media props
  stream?: MediaStream | null;
  cameraEnabled?: boolean;
  isRemoteCameraOn?: boolean;
  micEnabled?: boolean;
  onToggleCamera?: () => void;
  onToggleMic?: () => void;
  // Dice props
  turnPhase: 'WAITING_FOR_ROLL' | 'WAITING_FOR_MOVE';
  currentDice: number | null;
  isRolling?: boolean;
  onRollDice?: () => void;
  // Stats
  capturesCount?: number;
  className?: string;
}

const DICE_DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

export function IntegratedPlayerDiceStation({
  player,
  isActive,
  isMe,
  isSpeaking,
  orientation = 'left',
  stream,
  cameraEnabled,
  isRemoteCameraOn,
  micEnabled,
  onToggleCamera,
  onToggleMic,
  turnPhase,
  currentDice,
  isRolling,
  onRollDice,
  capturesCount = 0,
  className,
}: IntegratedPlayerDiceStationProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const color = PLAYER_COLORS[player.color] || PLAYER_COLORS.red;

  // Stream video track attach with explicit play() trigger
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream && stream.getVideoTracks().length > 0) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  const hasActiveVideo = Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled));
  const isCameraActive = isMe ? !!cameraEnabled : !!isRemoteCameraOn || hasActiveVideo;

  const canRollNow = isActive && turnPhase === 'WAITING_FOR_ROLL' && isMe && !isRolling;
  const showDiceSlot = isActive || currentDice !== null;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border-2 transition-all duration-300 shadow-2xl select-none bg-gradient-to-b from-[#0B2A6B] to-[#04153B]',
        isActive
          ? 'border-[#FFC928] ring-4 ring-[#FFC928]/40 shadow-[#FFC928]/40 scale-[1.02] z-30'
          : 'border-[#1C458A]',
        'min-w-[170px] max-w-[210px] w-full',
        className
      )}
    >
      {/* ── Top Header Strip (Ludo King Banner Style) ── */}
      <div className="flex items-center justify-between px-2.5 py-1 bg-gradient-to-r from-[#00377D] via-[#0756B8] to-[#00377D] border-b border-[#FFC928]/30 rounded-t-xl text-white">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs">🌐</span>
          <span className="text-[11px] font-black tracking-tight truncate max-w-[90px]">
            {player.name}
          </span>
          {isMe && <span className="text-[9px] text-[#FFC928] font-bold shrink-0">(You)</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {player.isHost && (
            <Crown size={12} className="text-[#FFC928]" aria-label="Host" />
          )}
          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-400/20 text-[#FFC928] border border-[#FFC928]/40">
            ★ {player.tokens ? player.tokens.filter((t) => t.status === 'HOME').length : 0}/4
          </span>
        </div>
      </div>

      {/* ── Station Middle Body: Avatar & Docked Dice Slot ── */}
      <div className={cn(
        'p-2 flex items-center justify-between gap-2',
        orientation === 'right' ? 'flex-row-reverse' : 'flex-row'
      )}>
        {/* 1. Avatar / Camera Video Box */}
        <div className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-xl overflow-hidden bg-[#0A1628] border-2 border-[#FFC928]/70 shadow-inner shrink-0 flex items-center justify-center">
          {hasActiveVideo ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : isCameraActive ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#0A1E40] text-emerald-300">
              <Loader2 size={16} className="animate-spin text-emerald-400" />
              <span className="text-[8px] font-black uppercase">Live</span>
            </div>
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center"
              style={{ backgroundColor: `${color.hex}22` }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shadow-md border-2 border-white"
                style={{ backgroundColor: color.hex, color: '#FFFFFF' }}
              >
                {player.name.slice(0, 2).toUpperCase()}
              </div>
            </div>
          )}

          {/* Camera live badge */}
          {isCameraActive && (
            <div className="absolute top-1 right-1 flex items-center gap-1 px-1 py-0.2 rounded-full bg-emerald-600 text-white text-[7px] font-black uppercase shadow">
              <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
              Cam
            </div>
          )}

          {/* Speaking ping indicator */}
          {isSpeaking && (
            <div className="absolute top-1 left-1 px-1 rounded-full bg-emerald-500 text-white text-[7px] font-bold animate-pulse">
              Mic
            </div>
          )}

          {/* Disconnected overlay */}
          {!player.isConnected && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-1 z-10">
              <WifiOff size={14} className="text-red-400 animate-pulse" />
              <span className="text-[8px] text-red-300 font-bold">Away</span>
            </div>
          )}

          {/* Token Color Pip */}
          <div
            className="absolute bottom-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] shadow border border-white"
            style={{ backgroundColor: color.hex, color: '#FFF' }}
          >
            {color.glyph}
          </div>
        </div>

        {/* 2. Docked Dice Box & Animated Turn Pointer */}
        <div className="relative flex-1 flex items-center justify-center">
          {/* Animated Yellow Turn Pointer Arrow */}
          {isActive && turnPhase === 'WAITING_FOR_ROLL' && (
            <div
              className={cn(
                'absolute z-20 pointer-events-none text-[#FFC928] text-lg font-black animate-bounce',
                orientation === 'left' ? '-left-3' : '-right-3'
              )}
            >
              {orientation === 'left' ? '▶' : '◀'}
            </div>
          )}

          {/* The Dice Slot */}
          <div
            onClick={() => canRollNow && onRollDice?.()}
            className={cn(
              'relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl border-2 transition-all duration-200 flex items-center justify-center shadow-lg',
              isActive
                ? 'border-[#FFC928] bg-gradient-to-br from-white/20 to-white/5 ring-2 ring-[#FFC928]/40'
                : 'border-white/15 bg-black/20 opacity-70',
              canRollNow ? 'cursor-pointer hover:scale-110 active:scale-95 animate-pulse' : 'cursor-default',
              isRolling && 'animate-spin-dice'
            )}
            style={{
              boxShadow: isActive ? `0 0 16px ${color.hex}60` : undefined,
            }}
            title={canRollNow ? 'Click to Roll Dice!' : undefined}
          >
            {isRolling ? (
              <div className="text-2xl animate-spin text-white">🎲</div>
            ) : currentDice ? (
              // Authentic Ludo King Colored Dice Face
              <div
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg shadow-md flex items-center justify-center border-2 border-white/80"
                style={{ backgroundColor: color.hex }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full p-1">
                  {(DICE_DOTS[currentDice] || []).map(([cx, cy], i) => (
                    <circle
                      key={i}
                      cx={cx}
                      cy={cy}
                      r={10}
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth={1}
                    />
                  ))}
                </svg>
              </div>
            ) : isActive ? (
              // Ready to roll placeholder
              <div className="flex flex-col items-center justify-center text-[#FFC928]">
                <span className="text-xl">🎲</span>
                {canRollNow && (
                  <span className="text-[8px] font-black uppercase text-white bg-amber-500 px-1 rounded shadow">
                    ROLL
                  </span>
                )}
              </div>
            ) : (
              <div className="text-lg opacity-30 text-white">🎲</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Controls & Hunter Stats ── */}
      <div className="px-2 py-1 bg-[#020B20]/80 rounded-b-xl border-t border-white/10 flex items-center justify-between text-[10px]">
        {/* Hunter captures count */}
        <div className="flex items-center gap-1 text-amber-300 font-bold">
          <span>⚔️</span>
          <span>{capturesCount} Kills</span>
        </div>

        {/* Cam & Mic controls if local user */}
        {isMe && onToggleCamera && onToggleMic ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleMic}
              className={cn(
                'p-1 rounded text-[10px] font-bold transition-all',
                micEnabled ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/50 hover:text-white'
              )}
              title={micEnabled ? 'Mute' : 'Unmute'}
            >
              {micEnabled ? <Mic size={11} /> : <MicOff size={11} />}
            </button>
            <button
              type="button"
              onClick={onToggleCamera}
              className={cn(
                'p-1 rounded text-[10px] font-bold transition-all',
                cameraEnabled ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/50 hover:text-white'
              )}
              title={cameraEnabled ? 'Turn Off Cam' : 'Turn On Cam'}
            >
              {cameraEnabled ? <Video size={11} /> : <VideoOff size={11} />}
            </button>
          </div>
        ) : (
          <span className="text-white/50 font-semibold" style={{ color: color.hex }}>
            {color.name}
          </span>
        )}
      </div>
    </div>
  );
}
