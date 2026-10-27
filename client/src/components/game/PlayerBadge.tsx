import { PlayerState } from '@ludoverse/shared';
import { PLAYER_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Crown, Wifi, WifiOff, Volume2 } from 'lucide-react';

interface PlayerBadgeProps {
  player: PlayerState;
  isActive: boolean;
  isMe: boolean;
  isSpeaking?: boolean;
  position: 'tl' | 'tr' | 'bl' | 'br';
}

export function PlayerBadge({ player, isActive, isMe, isSpeaking, position }: PlayerBadgeProps) {
  const color = PLAYER_COLORS[player.color];
  const tokensHome = player.tokens.filter(t => t.status === 'HOME').length;
  const tokensTotal = player.tokens.length;

  const posClass = {
    tl: 'top-0 left-0 rounded-br-2xl',
    tr: 'top-0 right-0 rounded-bl-2xl',
    bl: 'bottom-0 left-0 rounded-tr-2xl',
    br: 'bottom-0 right-0 rounded-tl-2xl',
  }[position];

  return (
    <div
      className={cn(
        'absolute flex items-center gap-2 px-2.5 py-2 backdrop-blur-md bg-elevated/90 border border-border-subtle transition-all duration-200',
        posClass,
        isActive && 'border-opacity-100',
      )}
      style={{
        borderColor: isActive ? color.hex : undefined,
        boxShadow: isActive ? `0 0 12px ${color.hex}33` : undefined,
      }}
    >
      {/* Active turn indicator */}
      {isActive && (
        <span
          className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full animate-pulse-ring"
          style={{ backgroundColor: color.hex }}
          aria-label="Current turn"
        />
      )}

      {/* Avatar / color dot */}
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-transform",
          isSpeaking && "scale-110 shadow-[0_0_10px_#10B981]"
        )}
        style={{
          backgroundColor: isSpeaking ? '#10B98133' : `${color.hex}22`,
          border: `2px solid ${isSpeaking ? '#10B981' : color.hex}`
        }}
        aria-hidden="true"
      >
        {isSpeaking ? (
          <Volume2 size={13} className="text-emerald-400 animate-pulse" />
        ) : (
          <span style={{ color: color.hex }}>{color.glyph}</span>
        )}
      </div>

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-white truncate max-w-[80px]">
            {isMe ? `${player.name} (You)` : player.name}
          </span>
          {player.isHost && <Crown size={10} className="text-accent-gold shrink-0" aria-label="Host" />}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Token home progress */}
          <div className="flex gap-0.5">
            {Array.from({ length: tokensTotal }, (_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: i < tokensHome ? color.hex : `${color.hex}33`,
                }}
                aria-hidden="true"
              />
            ))}
          </div>
          {/* Connection indicator */}
          {player.isConnected
            ? <Wifi size={9} className="text-emerald-400 shrink-0" aria-label="Connected" />
            : <WifiOff size={9} className="text-red-400 shrink-0 animate-pulse-ring" aria-label="Disconnected" />
          }
        </div>
      </div>

      {player.hasFinished && (
        <span className="text-xs font-bold text-accent-gold shrink-0" aria-label={`Finished rank ${player.finishRank}`}>
          #{player.finishRank}
        </span>
      )}
    </div>
  );
}
