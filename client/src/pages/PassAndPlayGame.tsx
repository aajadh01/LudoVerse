import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameState, PlayerColor } from '@ludoverse/shared';
import { LocalLudoEngine } from '@/lib/localEngine';
import { LudoBoard } from '@/components/board/LudoBoard';
import { IntegratedPlayerDiceStation } from '@/components/game/IntegratedPlayerDiceStation';
import { PLAYER_COLORS } from '@/lib/constants';
import { sounds } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { ArrowLeft, RotateCcw, ShieldCheck, Trophy, Sparkles } from 'lucide-react';

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

export function PassAndPlayGame() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(() => LocalLudoEngine.loadGame());
  const [isRolling, setIsRolling] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [enableHandoffMode, setEnableHandoffMode] = useState(false);

  // If no state, go back to setup
  useEffect(() => {
    if (!gameState) {
      navigate('/pass-and-play');
    }
  }, [gameState, navigate]);

  if (!gameState) return null;

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const activeColor = PLAYER_COLORS[activePlayer.color] || PLAYER_COLORS.red;

  const handleRollDice = () => {
    if (gameState.turnPhase !== 'WAITING_FOR_ROLL' || isRolling) return;

    sounds.playDiceRoll();
    setIsRolling(true);

    setTimeout(() => {
      setIsRolling(false);
      const res = LocalLudoEngine.rollDice(gameState);
      if (res) {
        setGameState({ ...gameState });
        if (res.passed) {
          if (enableHandoffMode) setShowHandoff(true);
        } else if (gameState.turnPhase === 'WAITING_FOR_MOVE') {
          // Auto-move single token or all in same place
          const autoTokenId = shouldAutoMoveToken(activePlayer, res.legalMoveTokenIds);
          if (autoTokenId !== null) {
            setTimeout(() => {
              handleTokenClick(activePlayer.id, autoTokenId);
            }, 420);
          }
        }
      }
    }, 450);
  };

  const handleTokenClick = (_playerId: string, tokenId: number) => {
    if (gameState.turnPhase !== 'WAITING_FOR_MOVE') return;

    sounds.playTokenMove();
    const res = LocalLudoEngine.moveToken(gameState, tokenId);
    if (res) {
      setGameState({ ...gameState });
      if (!res.grantsBonusTurn && enableHandoffMode && !res.finished) {
        setShowHandoff(true);
      }
    }
  };

  const handleRestart = () => {
    if (confirm('Start a new Pass & Play game? Current match progress will be cleared.')) {
      LocalLudoEngine.clearGame();
      navigate('/pass-and-play');
    }
  };

  const isGameOver = gameState.status === 'COMPLETED';
  const winner = gameState.players.find((p) => p.id === gameState.winnerPlayerId);

  // Group players for desktop 3-column & mobile layout
  // Standard 4 positions:
  // p0 = Red (Top-Left)
  // p1 = Green (Top-Right)
  // p2 = Yellow (Bottom-Right)
  // p3 = Blue (Bottom-Left)
  const p0 = gameState.players[0];
  const p1 = gameState.players[1];
  const p2 = gameState.players[2];
  const p3 = gameState.players[3];

  return (
    <div className="min-h-screen flex flex-col ludo-king-bg text-white select-none relative overflow-x-hidden">
      {/* ── Top App Bar ── */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-2.5 bg-[#002868]/95 border-b border-[#FFC928]/40 shadow-xl z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-all"
          >
            <ArrowLeft size={14} />
            <span>Quit</span>
          </button>
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-base">📱</span>
            <span className="text-xs sm:text-sm font-black text-[#FFC928]">Pass & Play</span>
          </div>
        </div>

        {/* Turn Indicator Banner */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#04153B] border border-[#FFC928]/50 shadow-md">
          <span
            className="w-3 h-3 rounded-full animate-ping"
            style={{ backgroundColor: activeColor.hex }}
          />
          <span className="text-xs font-black" style={{ color: activeColor.hex }}>
            {activePlayer.name}'s Turn
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setEnableHandoffMode(!enableHandoffMode)}
            className={cn(
              'px-2.5 py-1 rounded-xl text-xs font-bold border transition-all flex items-center gap-1',
              enableHandoffMode
                ? 'bg-[#FFC928] text-[#07305D] border-[#FFC928]'
                : 'bg-white/10 text-white/70 border-white/20'
            )}
            title="Privacy handoff screen between turns"
          >
            <ShieldCheck size={14} />
            <span className="hidden sm:inline">Handoff</span>
          </button>
          <button
            onClick={handleRestart}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-all"
            title="Restart Match"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </header>

      {/* ── Main Board Arena ── */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 max-w-7xl mx-auto w-full">
        {/* ── DESKTOP 3-COLUMN VIEW (hidden on mobile) ── */}
        <div className="hidden lg:grid grid-cols-[220px_1fr_220px] gap-6 items-center w-full max-w-5xl">
          {/* Left Column: Top-Left (p0: Red) & Bottom-Left (p3: Blue) */}
          <div className="flex flex-col justify-between h-[560px] py-4">
            {p0 ? (
              <IntegratedPlayerDiceStation
                player={p0}
                isActive={gameState.activePlayerIndex === 0}
                isMe={gameState.activePlayerIndex === 0}
                turnPhase={gameState.turnPhase as any}
                currentDice={gameState.activePlayerIndex === 0 ? gameState.currentTurnDice : null}
                isRolling={gameState.activePlayerIndex === 0 && isRolling}
                onRollDice={handleRollDice}
                orientation="left"
                capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p0.id).length}
              />
            ) : <div />}

            {p3 ? (
              <IntegratedPlayerDiceStation
                player={p3}
                isActive={gameState.activePlayerIndex === 3}
                isMe={gameState.activePlayerIndex === 3}
                turnPhase={gameState.turnPhase as any}
                currentDice={gameState.activePlayerIndex === 3 ? gameState.currentTurnDice : null}
                isRolling={gameState.activePlayerIndex === 3 && isRolling}
                onRollDice={handleRollDice}
                orientation="left"
                capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p3.id).length}
              />
            ) : <div />}
          </div>

          {/* Center Column: 15x15 Classic Board */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-[560px] aspect-square rounded-2xl p-1 bg-white/5 border border-white/15 shadow-2xl">
              <LudoBoard
                players={gameState.players}
                activePlayerIndex={gameState.activePlayerIndex}
                legalMoveTokenIds={gameState.legalMoveTokenIds}
                onTokenClick={handleTokenClick}
                onRollDice={handleRollDice}
                turnPhase={gameState.turnPhase}
                myPlayerId={activePlayer.id}
              />
            </div>
          </div>

          {/* Right Column: Top-Right (p1: Green) & Bottom-Right (p2: Yellow) */}
          <div className="flex flex-col justify-between h-[560px] py-4">
            {p1 ? (
              <IntegratedPlayerDiceStation
                player={p1}
                isActive={gameState.activePlayerIndex === 1}
                isMe={gameState.activePlayerIndex === 1}
                turnPhase={gameState.turnPhase as any}
                currentDice={gameState.activePlayerIndex === 1 ? gameState.currentTurnDice : null}
                isRolling={gameState.activePlayerIndex === 1 && isRolling}
                onRollDice={handleRollDice}
                orientation="right"
                capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p1.id).length}
              />
            ) : <div />}

            {p2 ? (
              <IntegratedPlayerDiceStation
                player={p2}
                isActive={gameState.activePlayerIndex === 2}
                isMe={gameState.activePlayerIndex === 2}
                turnPhase={gameState.turnPhase as any}
                currentDice={gameState.activePlayerIndex === 2 ? gameState.currentTurnDice : null}
                isRolling={gameState.activePlayerIndex === 2 && isRolling}
                onRollDice={handleRollDice}
                orientation="right"
                capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p2.id).length}
              />
            ) : <div />}
          </div>
        </div>

        {/* ── MOBILE / PORTRAIT VIEW (shown on mobile & tablet) ── */}
        <div className="flex lg:hidden flex-col items-center justify-between w-full max-w-md h-full gap-2">
          {/* Top Row: p0 (Red) & p1 (Green) */}
          <div className="w-full flex items-center justify-between gap-2 px-1">
            {p0 ? (
              <div className="flex-1 max-w-[190px]">
                <IntegratedPlayerDiceStation
                  player={p0}
                  isActive={gameState.activePlayerIndex === 0}
                  isMe={gameState.activePlayerIndex === 0}
                  turnPhase={gameState.turnPhase as any}
                  currentDice={gameState.activePlayerIndex === 0 ? gameState.currentTurnDice : null}
                  isRolling={gameState.activePlayerIndex === 0 && isRolling}
                  onRollDice={handleRollDice}
                  orientation="left"
                  capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p0.id).length}
                />
              </div>
            ) : <div className="flex-1" />}

            {p1 ? (
              <div className="flex-1 max-w-[190px]">
                <IntegratedPlayerDiceStation
                  player={p1}
                  isActive={gameState.activePlayerIndex === 1}
                  isMe={gameState.activePlayerIndex === 1}
                  turnPhase={gameState.turnPhase as any}
                  currentDice={gameState.activePlayerIndex === 1 ? gameState.currentTurnDice : null}
                  isRolling={gameState.activePlayerIndex === 1 && isRolling}
                  onRollDice={handleRollDice}
                  orientation="right"
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
              legalMoveTokenIds={gameState.legalMoveTokenIds}
              onTokenClick={handleTokenClick}
              onRollDice={handleRollDice}
              turnPhase={gameState.turnPhase}
              myPlayerId={activePlayer.id}
            />
          </div>

          {/* Bottom Row: p3 (Blue) & p2 (Yellow) */}
          <div className="w-full flex items-center justify-between gap-2 px-1">
            {p3 ? (
              <div className="flex-1 max-w-[190px]">
                <IntegratedPlayerDiceStation
                  player={p3}
                  isActive={gameState.activePlayerIndex === 3}
                  isMe={gameState.activePlayerIndex === 3}
                  turnPhase={gameState.turnPhase as any}
                  currentDice={gameState.activePlayerIndex === 3 ? gameState.currentTurnDice : null}
                  isRolling={gameState.activePlayerIndex === 3 && isRolling}
                  onRollDice={handleRollDice}
                  orientation="left"
                  capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p3.id).length}
                />
              </div>
            ) : <div className="flex-1" />}

            {p2 ? (
              <div className="flex-1 max-w-[190px]">
                <IntegratedPlayerDiceStation
                  player={p2}
                  isActive={gameState.activePlayerIndex === 2}
                  isMe={gameState.activePlayerIndex === 2}
                  turnPhase={gameState.turnPhase as any}
                  currentDice={gameState.activePlayerIndex === 2 ? gameState.currentTurnDice : null}
                  isRolling={gameState.activePlayerIndex === 2 && isRolling}
                  onRollDice={handleRollDice}
                  orientation="right"
                  capturesCount={gameState.captureLedger.filter((c) => c.capturingPlayerId === p2.id).length}
                />
              </div>
            ) : <div className="flex-1" />}
          </div>
        </div>
      </main>

      {/* ── Privacy Turn Handoff Modal (Optional between turns) ── */}
      {showHandoff && !isGameOver && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
          <div className="max-w-xs w-full p-6 rounded-3xl bg-gradient-to-b from-[#0756B8] to-[#002868] border-2 border-[#FFC928] shadow-2xl flex flex-col items-center gap-4">
            <div
              className="w-16 h-16 rounded-full border-4 border-white shadow-xl flex items-center justify-center text-2xl font-black text-white animate-bounce"
              style={{ backgroundColor: activeColor.hex }}
            >
              {activeColor.glyph}
            </div>
            <div>
              <p className="text-xs uppercase font-bold text-sky-200 tracking-wider">Pass Device To</p>
              <h2 className="text-2xl font-black text-[#FFC928]">{activePlayer.name}</h2>
            </div>
            <button
              onClick={() => setShowHandoff(false)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#FFE978] to-[#FFC928] text-[#07305D] font-black text-sm uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-95 transition-all"
            >
              I Am Ready! Let's Play →
            </button>
          </div>
        </div>
      )}

      {/* ── Match Victory Screen ── */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
          <div className="max-w-sm w-full p-6 rounded-3xl bg-gradient-to-b from-[#0756B8] to-[#002868] border-2 border-[#FFC928] shadow-2xl flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-[#FFC928] border-4 border-white shadow-2xl flex items-center justify-center text-4xl animate-bounce">
              🏆
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#FFC928]">MATCH COMPLETE!</h2>
              <p className="text-sm font-bold text-white mt-1">
                Winner: <span className="text-[#FFC928]">{winner?.name || 'Champion'}</span>
              </p>
            </div>

            {/* Local Hunter Kills Summary */}
            <div className="w-full p-3 rounded-xl bg-[#04153B] border border-white/10 flex flex-col gap-2">
              <span className="text-[11px] font-black text-[#FFC928] uppercase tracking-wider">
                Hunter Leaderboard
              </span>
              {gameState.players.map((p) => {
                const kills = gameState.captureLedger.filter((c) => c.capturingPlayerId === p.id).length;
                return (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="font-bold">{p.name}</span>
                    <span className="font-mono text-amber-300 font-bold">{kills} captures</span>
                  </div>
                );
              })}
            </div>

            <div className="w-full flex gap-2">
              <button
                onClick={() => {
                  LocalLudoEngine.clearGame();
                  navigate('/pass-and-play');
                }}
                className="flex-1 py-3 rounded-xl bg-[#FFC928] text-[#07305D] font-black text-xs uppercase shadow hover:bg-[#FFE978] transition-all"
              >
                Play Again
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex-1 py-3 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-xs uppercase hover:bg-white/20 transition-all"
              >
                Home Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
