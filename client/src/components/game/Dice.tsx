import { useState } from 'react';
import { cn } from '@/lib/utils';

interface DiceProps {
  value: number | null;
  rolling?: boolean;
  disabled?: boolean;
  isMyTurn: boolean;
  onClick: () => void;
}

const DICE_DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

export function Dice({ value, rolling, disabled, isMyTurn, onClick }: DiceProps) {
  const [justRolled, setJustRolled] = useState(false);

  const handleClick = () => {
    if (disabled || !isMyTurn) return;
    setJustRolled(true);
    setTimeout(() => setJustRolled(false), 500);
    onClick();
  };

  const dots = value ? DICE_DOTS[value] : [];
  const isSix = value === 6;

  return (
    <button
      onClick={handleClick}
      disabled={disabled || !isMyTurn}
      aria-label={value ? `Dice shows ${value}. ${isMyTurn ? 'Click to roll again' : ''}` : 'Click to roll dice'}
      className={cn(
        'relative w-16 h-16 rounded-2xl border-2 transition-all duration-200 select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
        'active:scale-90',
        isMyTurn && !disabled
          ? 'cursor-pointer border-accent-primary bg-elevated shadow-glow hover:scale-105'
          : 'cursor-default border-border-subtle bg-white/5 opacity-60',
        isSix && 'border-accent-gold shadow-glow-gold',
        justRolled && 'animate-spin-dice',
        rolling && 'animate-pulse-ring'
      )}
    >
      {value ? (
        <svg viewBox="0 0 100 100" className="w-full h-full p-1.5">
          {dots.map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={8}
              fill={isSix ? '#F59E0B' : '#F8FAFC'}
            />
          ))}
        </svg>
      ) : (
        <div className="flex items-center justify-center h-full">
          <span className="text-2xl">🎲</span>
        </div>
      )}

      {isMyTurn && !disabled && !value && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-accent-primary rounded-full animate-pulse-ring" />
      )}
    </button>
  );
}
