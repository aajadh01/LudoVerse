import { useParams, useNavigate } from 'react-router-dom';
import { useGameRoom } from '@/hooks/useGameRoom';
import { PLAYER_COLORS } from '@/lib/constants';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sword, Shield, Trophy, Target, RotateCcw, Home } from 'lucide-react';

// Client-side award computation (mirrors server logic)
function computeAwards(gameState: NonNullable<ReturnType<typeof useGameRoom>['gameState']>) {
  const ledger = gameState.captureLedger;
  const captures: Record<string, number> = {};
  const captured: Record<string, number> = {};

  for (const tx of ledger) {
    captures[tx.capturingPlayerId] = (captures[tx.capturingPlayerId] ?? 0) + 1;
    captured[tx.capturedPlayerId] = (captured[tx.capturedPlayerId] ?? 0) + 1;
  }

  const champion = gameState.status === 'COMPLETED' && gameState.winnerPlayerId
    ? gameState.players.find(p => p.id === gameState.winnerPlayerId)
    : undefined;

  const sortedByCaptures = [...gameState.players].sort((a, b) => (captures[b.id] ?? 0) - (captures[a.id] ?? 0));
  const hunter = sortedByCaptures[0] && (captures[sortedByCaptures[0].id] ?? 0) > 0 ? sortedByCaptures[0] : undefined;

  const sortedByVictim = [...gameState.players].sort((a, b) => (captured[b.id] ?? 0) - (captured[a.id] ?? 0));
  const mostTargeted = sortedByVictim[0] && (captured[sortedByVictim[0].id] ?? 0) > 0 ? sortedByVictim[0] : undefined;

  const sortedBySurvivor = [...gameState.players].sort((a, b) => (captured[a.id] ?? 0) - (captured[b.id] ?? 0));
  const survivor = sortedBySurvivor[0];

  return { champion, hunter, mostTargeted, survivor, captures, captured };
}

export default function ResultsPage() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { gameState, playerId } = useGameRoom();

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { champion, hunter, mostTargeted, survivor, captures, captured } = computeAwards(gameState);
  const isEarlyEnded = gameState.status === 'EARLY_ENDED';

  const handleRematch = () => navigate(`/room/${roomId}`, { replace: true });
  const handleHome = () => navigate('/', { replace: true });

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center px-4 py-8 pt-safe overflow-y-auto">
      {/* Header */}
      <div className="text-center mb-8 animate-slide-up">
        {isEarlyEnded ? (
          <>
            <div className="text-5xl mb-2">🏳️</div>
            <h1 className="text-2xl font-extrabold text-white">Match Ended Early</h1>
            <p className="text-sm text-muted mt-1">All players agreed to end the match</p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-2 animate-bounce-in">🏆</div>
            <h1 className="text-2xl font-extrabold text-white">Match Over!</h1>
            {champion && (
              <p className="text-base text-accent-gold font-bold mt-1">
                {champion.name} wins! {champion.id === playerId ? ' That\'s you! 🎉' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {/* Awards */}
      <div className="w-full max-w-sm flex flex-col gap-3 mb-6">
        {!isEarlyEnded && champion && (
          <AwardCard
            icon="👑"
            title="Champion"
            subtitle="First to bring all tokens home"
            playerName={champion.name}
            playerColor={champion.color}
            isMe={champion.id === playerId}
            highlight
          />
        )}

        {hunter && (
          <AwardCard
            icon="🎯"
            title="Hunter"
            subtitle={`${captures[hunter.id] ?? 0} token captures`}
            playerName={hunter.name}
            playerColor={hunter.color}
            isMe={hunter.id === playerId}
          />
        )}

        {mostTargeted && (
          <AwardCard
            icon="🎯"
            title="Most Targeted"
            subtitle={`Captured ${captured[mostTargeted.id] ?? 0} times`}
            playerName={mostTargeted.name}
            playerColor={mostTargeted.color}
            isMe={mostTargeted.id === playerId}
          />
        )}

        {survivor && (
          <AwardCard
            icon="🛡️"
            title="Survivor"
            subtitle={`Only captured ${captured[survivor.id] ?? 0} times`}
            playerName={survivor.name}
            playerColor={survivor.color}
            isMe={survivor.id === playerId}
          />
        )}
      </div>

      {/* Capture Matrix */}
      {gameState.captureLedger.length > 0 && (
        <Card className="w-full max-w-sm mb-6">
          <div className="px-5 pt-4 pb-2">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Sword size={16} className="text-red-400" />
              Capture Summary
            </h3>
          </div>
          <div className="px-5 pb-4 flex flex-col gap-2">
            {gameState.players.map(player => {
              const playerCaptures = gameState.captureLedger.filter(tx => tx.capturingPlayerId === player.id);
              const color = PLAYER_COLORS[player.color];
              return (
                <div key={player.id} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-sm"
                    style={{ backgroundColor: `${color.hex}20`, border: `1.5px solid ${color.hex}` }}
                  >
                    <span style={{ color: color.hex }}>{color.glyph}</span>
                  </div>
                  <span className="text-sm font-medium text-white flex-1">{player.name}</span>
                  <div className="flex items-center gap-1.5">
                    <Sword size={12} className="text-red-400" />
                    <span className="text-sm font-bold text-white">{captures[player.id] ?? 0}</span>
                    <Shield size={12} className="text-blue-400 ml-2" />
                    <span className="text-sm text-muted">{captured[player.id] ?? 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="w-full max-w-sm flex flex-col gap-3 pb-safe">
        <Button onClick={handleRematch} fullWidth size="lg">
          <RotateCcw size={16} /> Play Again
        </Button>
        <Button onClick={handleHome} variant="secondary" fullWidth size="lg">
          <Home size={16} /> Back to Home
        </Button>
      </div>
    </div>
  );
}

// ── Award Card ────────────────────────────────────────────────────────────────

interface AwardCardProps {
  icon: string;
  title: string;
  subtitle: string;
  playerName: string;
  playerColor: string;
  isMe: boolean;
  highlight?: boolean;
}

function AwardCard({ icon, title, subtitle, playerName, playerColor, isMe, highlight }: AwardCardProps) {
  const color = PLAYER_COLORS[playerColor as keyof typeof PLAYER_COLORS];

  return (
    <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl border animate-fade-in ${
      highlight
        ? 'bg-accent-gold/8 border-accent-gold/30'
        : 'bg-white/5 border-border-subtle'
    }`}>
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">{title}</p>
        <p className="text-sm font-bold text-white truncate">
          {playerName}{isMe && ' (You)'}
        </p>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <div
        className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-sm font-bold"
        style={{ backgroundColor: `${color?.hex}20`, border: `2px solid ${color?.hex}` }}
      >
        <span style={{ color: color?.hex }}>{color?.glyph}</span>
      </div>
    </div>
  );
}
