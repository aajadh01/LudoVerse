import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlayerColor, TRADITIONAL_COLORS } from '@ludoverse/shared';
import { PLAYER_COLORS } from '@/lib/constants';
import { LocalLudoEngine } from '@/lib/localEngine';
import { cn } from '@/lib/utils';
import { ArrowLeft, Users, Trophy, Play, RotateCcw } from 'lucide-react';

interface PlayerSlot {
  name: string;
  color: PlayerColor;
}

export function PassAndPlaySetup() {
  const navigate = useNavigate();
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [players, setPlayers] = useState<PlayerSlot[]>([
    { name: 'Player 1', color: 'red' },
    { name: 'Player 2', color: 'green' },
    { name: 'Player 3', color: 'yellow' },
    { name: 'Player 4', color: 'blue' },
  ]);

  const [hasSavedGame] = useState<boolean>(() => !!LocalLudoEngine.loadGame());

  const handleCountChange = (count: number) => {
    setPlayerCount(count);
    const defaults: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
    setPlayers((prev) => {
      const next: PlayerSlot[] = [];
      for (let i = 0; i < count; i++) {
        next.push({
          name: prev[i]?.name || `Player ${i + 1}`,
          color: defaults[i] || 'red',
        });
      }
      return next;
    });
  };

  const updateName = (index: number, name: string) => {
    setPlayers((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name };
      return updated;
    });
  };

  const handleStartGame = () => {
    const config = players.slice(0, playerCount).map((p, idx) => ({
      name: p.name.trim() || `Player ${idx + 1}`,
      color: p.color,
    }));
    const state = LocalLudoEngine.createGame(config);
    LocalLudoEngine.saveGame(state);
    navigate('/pass-and-play/game');
  };

  const handleResumeGame = () => {
    navigate('/pass-and-play/game');
  };

  return (
    <div className="min-h-screen flex flex-col ludo-king-bg text-white select-none">
      {/* ── Top Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#002868]/90 border-b border-[#FFC928]/40 shadow-lg">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-all"
        >
          <ArrowLeft size={16} />
          <span>Home</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FFC928] text-[#07305D] flex items-center justify-center font-black text-base shadow">
            📱
          </div>
          <div>
            <h1 className="text-base font-black text-[#FFC928] tracking-wide">PASS & PLAY</h1>
            <p className="text-[10px] text-sky-200">Local Offline · 1 Device</p>
          </div>
        </div>
        <div className="w-16" />
      </header>

      {/* ── Setup Content ── */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-between gap-4">
        <div className="flex flex-col gap-4">
          {/* Resume Previous Match Prompt */}
          {hasSavedGame && (
            <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/20 to-amber-600/10 border-2 border-[#FFC928] shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-[#FFC928]">Saved Match Found</p>
                <p className="text-[10px] text-white/70">Resume your game where you left off</p>
              </div>
              <button
                onClick={handleResumeGame}
                className="px-3 py-1.5 rounded-xl bg-[#FFC928] text-[#07305D] text-xs font-black flex items-center gap-1 shadow-md hover:bg-[#FFE978] transition-all"
              >
                <RotateCcw size={12} />
                <span>Resume</span>
              </button>
            </div>
          )}

          {/* Number of Players Selector */}
          <div className="p-4 rounded-2xl bg-[#002868]/80 border border-[#FFC928]/30 shadow-xl">
            <label className="text-xs font-black text-[#FFC928] uppercase tracking-wider block mb-2">
              Select Player Count
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleCountChange(count)}
                  className={cn(
                    'py-3 rounded-xl font-black text-sm border-2 transition-all flex flex-col items-center justify-center gap-0.5',
                    playerCount === count
                      ? 'border-[#FFC928] bg-gradient-to-b from-[#087BE8] to-[#0756B8] text-white shadow-lg ring-2 ring-[#FFC928]/40 scale-105'
                      : 'border-white/15 bg-white/5 text-white/60 hover:text-white'
                  )}
                >
                  <span>{count} Players</span>
                  <span className="text-[10px] opacity-75 font-normal">
                    {count === 2 ? 'Head to Head' : count === 3 ? 'Triangle Match' : 'Classic 4-Corner'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Player Names & Color Badges */}
          <div className="p-4 rounded-2xl bg-[#002868]/80 border border-[#FFC928]/30 shadow-xl flex flex-col gap-3">
            <label className="text-xs font-black text-[#FFC928] uppercase tracking-wider">
              Player Details & Colors
            </label>
            <div className="flex flex-col gap-2.5">
              {players.slice(0, playerCount).map((player, idx) => {
                const colorInfo = PLAYER_COLORS[player.color];
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2 rounded-xl bg-[#04153B] border border-white/10"
                  >
                    {/* Color badge preview */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-md border border-white/80 shrink-0"
                      style={{ backgroundColor: colorInfo.hex }}
                    >
                      {colorInfo.glyph}
                    </div>

                    {/* Name input */}
                    <div className="flex-1">
                      <input
                        type="text"
                        value={player.name}
                        onChange={(e) => updateName(idx, e.target.value)}
                        placeholder={`Player ${idx + 1}`}
                        maxLength={20}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white placeholder-white/40 focus:outline-none focus:border-[#FFC928]"
                      />
                    </div>

                    {/* Corner hint */}
                    <span className="text-[10px] font-bold text-white/50 shrink-0">
                      {idx === 0 ? 'Top-L' : idx === 1 ? 'Top-R' : idx === 2 ? 'Bot-R' : 'Bot-L'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Start Game Action Button */}
        <div className="pt-2">
          <button
            onClick={handleStartGame}
            className="w-full py-4 rounded-2xl bg-gradient-to-b from-[#FFE978] via-[#FFC928] to-[#D99A00] text-[#07305D] text-base font-black tracking-wide uppercase shadow-2xl border-2 border-white hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Play size={18} fill="#07305D" />
            <span>Start Pass & Play Match</span>
          </button>
        </div>
      </main>
    </div>
  );
}
