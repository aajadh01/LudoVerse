import { GameState } from '@ludoverse/shared';
import { PLAYER_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Shield, Sword } from 'lucide-react';

// Pure client-side leaderboard computation — mirrors server HunterTracker exactly
function computeLeaderboard(state: GameState) {
  const entries: Record<string, {
    playerId: string;
    playerName: string;
    playerColor: string;
    totalCaptures: number;
    timesCaptured: number;
    breakdown: Record<string, number>;
  }> = {};

  for (const p of state.players) {
    entries[p.id] = {
      playerId: p.id,
      playerName: p.name,
      playerColor: p.color,
      totalCaptures: 0,
      timesCaptured: 0,
      breakdown: {},
    };
  }

  for (const tx of state.captureLedger) {
    if (entries[tx.capturingPlayerId]) {
      entries[tx.capturingPlayerId].totalCaptures++;
      entries[tx.capturingPlayerId].breakdown[tx.capturedPlayerId] =
        (entries[tx.capturingPlayerId].breakdown[tx.capturedPlayerId] ?? 0) + 1;
    }
    if (entries[tx.capturedPlayerId]) {
      entries[tx.capturedPlayerId].timesCaptured++;
    }
  }

  return Object.values(entries).sort((a, b) =>
    b.totalCaptures - a.totalCaptures || a.timesCaptured - b.timesCaptured
  );
}

interface HunterLeaderboardProps {
  gameState: GameState;
}

export function HunterLeaderboard({ gameState }: HunterLeaderboardProps) {
  const leaderboard = computeLeaderboard(gameState);
  const totalCaptures = gameState.captureLedger.length;

  if (totalCaptures === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <span className="text-4xl">🎯</span>
        <p className="text-white font-semibold">No captures yet</p>
        <p className="text-sm text-muted">Be the first Hunter to send a token flying!</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      {/* Summary */}
      <div className="flex justify-between items-center bg-white/5 rounded-xl px-4 py-3">
        <span className="text-sm text-muted">Total Captures</span>
        <span className="text-lg font-bold text-white">{totalCaptures}</span>
      </div>

      {/* Rankings */}
      <div className="flex flex-col gap-2">
        {leaderboard.map((entry, idx) => {
          const color = PLAYER_COLORS[entry.playerColor as keyof typeof PLAYER_COLORS];
          const isHunter = idx === 0 && entry.totalCaptures > 0;

          return (
            <div
              key={entry.playerId}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 border border-transparent',
                isHunter ? 'bg-accent-primary/10 border-accent-primary/30' : 'bg-white/5'
              )}
            >
              {/* Rank */}
              <span className="w-5 text-sm font-bold text-muted shrink-0">
                {isHunter ? '🎯' : `#${idx + 1}`}
              </span>

              {/* Player avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ backgroundColor: `${color?.hex}22`, border: `2px solid ${color?.hex}` }}
              >
                <span style={{ color: color?.hex }}>{color?.glyph}</span>
              </div>

              {/* Name */}
              <span className="flex-1 text-sm font-semibold text-white truncate">{entry.playerName}</span>

              {/* Stats */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1 text-xs">
                  <Sword size={11} className="text-red-400" />
                  <span className="font-bold text-white">{entry.totalCaptures}</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <Shield size={11} className="text-blue-400" />
                  <span className="text-muted">{entry.timesCaptured}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Capture matrix */}
      {totalCaptures > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Capture Matrix</h3>
          <div className="flex flex-col gap-1.5">
            {leaderboard.filter(e => e.totalCaptures > 0).map(entry => {
              const color = PLAYER_COLORS[entry.playerColor as keyof typeof PLAYER_COLORS];
              return (
                <div key={`matrix-${entry.playerId}`} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold" style={{ color: color?.hex }}>
                    {entry.playerName}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(entry.breakdown).map(([victimId, count]) => {
                      const victim = gameState.players.find(p => p.id === victimId);
                      const victimColor = victim ? PLAYER_COLORS[victim.color] : null;
                      return (
                        <div
                          key={victimId}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 text-xs"
                        >
                          <span style={{ color: victimColor?.hex }}>{victimColor?.glyph}</span>
                          <span className="text-muted">{victim?.name}</span>
                          <span className="font-bold text-white">×{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
