import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PlayerState } from '@ludoverse/shared';
import { PLAYER_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Crown, WifiOff, Mic, MicOff, Video, VideoOff, Loader2 } from 'lucide-react';

interface PlayerVideoStationProps {
  player: PlayerState;
  isActive: boolean;
  isMe: boolean;
  isSpeaking: boolean;
  stream?: MediaStream | null;
  cameraEnabled?: boolean;
  isRemoteCameraOn?: boolean;
  micEnabled?: boolean;
  onToggleCamera?: () => void;
  onToggleMic?: () => void;
  className?: string;
  compact?: boolean;
}

export function PlayerVideoStation({
  player,
  isActive,
  isMe,
  isSpeaking,
  stream,
  cameraEnabled,
  isRemoteCameraOn,
  micEnabled,
  onToggleCamera,
  onToggleMic,
  className,
  compact = false,
}: PlayerVideoStationProps) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const color = PLAYER_COLORS[player.color];

  // Callback ref guarantees that the video element receives srcObject the moment it mounts or when stream updates
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) {
      if (stream && stream.getVideoTracks().length > 0) {
        if (el.srcObject !== stream) {
          el.srcObject = stream;
        }
        el.play().catch(() => {});
      } else {
        el.srcObject = null;
        setIsVideoPlaying(false);
      }
    }
  }, [stream]);

  // Synchronize on stream prop updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream && stream.getVideoTracks().length > 0) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
      setIsVideoPlaying(false);
    }
  }, [stream]);

  // Check if stream has an active video track
  const hasActiveVideo = Boolean(stream && stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled));
  const isCameraActive = isMe ? !!cameraEnabled : (!!isRemoteCameraOn || hasActiveVideo);

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border-2 transition-all duration-300 shadow-xl select-none bg-[#0E1E3A]',
        isActive
          ? 'border-[#FFC20E] ring-4 ring-[#FFC20E]/40 scale-[1.03] z-20 shadow-[#FFC20E]/30'
          : isSpeaking
          ? 'border-emerald-400 ring-2 ring-emerald-400/50'
          : 'border-[#1E3A8A]',
        compact ? 'w-24 sm:w-28' : 'w-28 sm:w-36',
        className
      )}
    >
      {/* Active turn badge */}
      {isActive && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-[#FFC20E] text-[#1E293B] text-[10px] font-black uppercase tracking-wider shadow-md z-30 flex items-center gap-1 border border-white">
          <span>TURN</span>
        </div>
      )}

      {/* Video Window / Avatar Area */}
      <div className={cn(
        'relative w-full rounded-t-xl overflow-hidden bg-[#0A1628] flex items-center justify-center border-b border-[#1E3A8A]',
        compact ? 'aspect-square max-h-20' : 'aspect-[4/3] max-h-24 sm:max-h-28'
      )}>
        {/* Permanent Video Element: never unmounted to ensure seamless rendering across WAN */}
        <video
          ref={setVideoRef}
          autoPlay
          playsInline
          muted
          onLoadedData={() => setIsVideoPlaying(true)}
          onPlaying={() => setIsVideoPlaying(true)}
          onPause={() => setIsVideoPlaying(false)}
          onEnded={() => setIsVideoPlaying(false)}
          onError={() => setIsVideoPlaying(false)}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isVideoPlaying && hasActiveVideo ? "opacity-100 relative z-10" : "opacity-0 absolute inset-0 pointer-events-none"
          )}
        />

        {/* Underneath Shield: Active until decoded frames are actively playing */}
        {(!isVideoPlaying || !hasActiveVideo) && (
          isCameraActive ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#0D2147] text-white">
              <Loader2 size={18} className="animate-spin text-emerald-400" />
              <span className="text-[9px] text-emerald-300 font-bold">Cam Live</span>
            </div>
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-1"
              style={{ backgroundColor: `${color.hex}25` }}
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-base font-black shadow-md"
                style={{ backgroundColor: color.hex, color: '#FFFFFF', border: '2px solid #FFFFFF' }}
              >
                {player.name.slice(0, 2).toUpperCase()}
              </div>
              {isMe && !cameraEnabled && (
                <span className="text-[9px] text-white/60 flex items-center gap-0.5 font-medium">
                  <VideoOff size={10} /> Cam off
                </span>
              )}
            </div>
          )
        )}

        {/* Live Camera indicator badge */}
        {isCameraActive && (
          <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-600/90 text-white text-[8px] font-black uppercase shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Live
          </div>
        )}

        {/* Live Speaking indicator overlay */}
        {isSpeaking && (
          <div className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[8px] font-bold shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            Talk
          </div>
        )}

        {/* Disconnected overlay */}
        {!player.isConnected && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-1 z-10">
            <WifiOff size={16} className="text-red-400 animate-pulse" />
            <span className="text-[9px] text-red-300 font-bold">Away</span>
          </div>
        )}

        {/* Player color corner badge */}
        <div
          className="absolute bottom-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shadow border border-white"
          style={{ backgroundColor: color.hex, color: '#fff' }}
          title={color.name}
        >
          {color.glyph}
        </div>
      </div>

      {/* Info Footer */}
      <div className="p-1.5 sm:p-2 flex flex-col gap-0.5 bg-[#0A1628] rounded-b-xl">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] sm:text-xs font-bold text-white truncate">
            {player.name}
            {isMe && ' (You)'}
          </span>
          {player.isHost && (
            <Crown size={12} className="text-[#FFC20E] shrink-0" aria-label="Host" />
          )}
        </div>

        {/* Controls for current player */}
        {isMe && onToggleCamera && onToggleMic ? (
          <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={onToggleMic}
              className={cn(
                'flex-1 py-1 px-1 rounded-lg text-[10px] flex items-center justify-center gap-1 font-bold transition-all',
                micEnabled
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white/10 text-white/50 hover:text-white'
              )}
              title={micEnabled ? 'Mute Mic' : 'Unmute Mic'}
              aria-label="Toggle mic"
            >
              {micEnabled ? <Mic size={11} /> : <MicOff size={11} />}
              {micEnabled ? 'Mic' : 'Off'}
            </button>
            <button
              type="button"
              onClick={onToggleCamera}
              className={cn(
                'flex-1 py-1 px-1 rounded-lg text-[10px] flex items-center justify-center gap-1 font-bold transition-all',
                cameraEnabled
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/10 text-white/50 hover:text-white'
              )}
              title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
              aria-label="Toggle camera"
            >
              {cameraEnabled ? <Video size={11} /> : <VideoOff size={11} />}
              {cameraEnabled ? 'Cam' : 'Off'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px] text-white/60">
            <span style={{ color: color.hex }} className="font-bold">{color.name}</span>
            {player.tokens && (
              <span className="font-mono font-bold text-[#FFC20E]">
                {player.tokens.filter(t => t.status === 'HOME').length}/{player.tokens.length} ★
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}