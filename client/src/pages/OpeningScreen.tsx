import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface OpeningScreenProps {
  onComplete: () => void;
}

export function OpeningScreen({ onComplete }: OpeningScreenProps) {
  const [stage, setStage] = useState<'enter' | 'ready' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setStage('ready'), 350);
    const t2 = setTimeout(() => {
      setStage('exit');
      setTimeout(onComplete, 350);
    }, 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onComplete]);

  return (
    <div
      onClick={onComplete}
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer select-none ludo-king-bg overflow-hidden transition-opacity duration-300',
        stage === 'exit' ? 'opacity-0' : 'opacity-100'
      )}
    >
      {/* ── Background Subtle Radiance & Board Geometry ── */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-[#00377D]/60 via-[#087BE8]/30 to-transparent blur-3xl animate-pulse" />
      </div>

      {/* ── Central LudoVerse Emblem Box ── */}
      <div
        className={cn(
          'relative flex flex-col items-center transition-all duration-700 transform',
          stage === 'enter' ? 'scale-75 opacity-0 translate-y-6' : 'scale-100 opacity-100 translate-y-0'
        )}
      >
        {/* Floating 4 Colorful Ludo Tokens surrounding the Emblem */}
        <div className="relative w-44 h-44 flex items-center justify-center">
          {/* Top Token - Green */}
          <div className="absolute -top-3 w-10 h-10 rounded-full bg-[#00A651] border-2 border-white shadow-xl flex items-center justify-center text-white text-xs font-black animate-bounce">
            ●
          </div>
          {/* Bottom Token - Blue */}
          <div className="absolute -bottom-3 w-10 h-10 rounded-full bg-[#0072CE] border-2 border-white shadow-xl flex items-center justify-center text-white text-xs font-black animate-bounce delay-150">
            ▲
          </div>
          {/* Left Token - Red */}
          <div className="absolute -left-3 w-10 h-10 rounded-full bg-[#E52521] border-2 border-white shadow-xl flex items-center justify-center text-white text-xs font-black animate-bounce delay-300">
            ⬥
          </div>
          {/* Right Token - Yellow */}
          <div className="absolute -right-3 w-10 h-10 rounded-full bg-[#FFC20E] border-2 border-white shadow-xl flex items-center justify-center text-white text-xs font-black animate-bounce delay-75">
            ★
          </div>

          {/* Central Dimensional Golden Dice Emblem */}
          <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-[#FFE978] via-[#FFC928] to-[#D99A00] p-1.5 shadow-2xl border-2 border-white flex items-center justify-center transform rotate-6 hover:rotate-0 transition-transform">
            <div className="w-full h-full rounded-2xl bg-gradient-to-br from-[#0756B8] to-[#002868] flex flex-col items-center justify-center border border-white/40">
              <span className="text-4xl filter drop-shadow">🎲</span>
              <span className="text-[10px] font-black text-[#FFE978] tracking-widest uppercase mt-0.5">
                ORIGINAL
              </span>
            </div>
          </div>
        </div>

        {/* LudoVerse Glossy Arcade Title */}
        <div className="mt-6 text-center">
          <h1
            className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]"
            style={{
              textShadow: '0 3px 0 #07305D, 0 6px 14px rgba(0,0,0,0.7)',
            }}
          >
            Ludo<span className="text-[#FFC928]">Verse</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-bold text-sky-200 tracking-wider uppercase">
            Mobile · Desktop · Arcade Board Game
          </p>
        </div>

        {/* Tap to continue indicator */}
        <div className="mt-8 flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs font-semibold animate-pulse">
          <span>Tap anywhere to start</span>
          <span>→</span>
        </div>
      </div>
    </div>
  );
}
