import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, fullWidth, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 min-touch select-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base active:scale-95 disabled:opacity-50 disabled:pointer-events-none';

    const variants = {
      primary:   'bg-accent-primary hover:bg-accent-primaryHover text-white shadow-glow hover:shadow-glow',
      secondary: 'bg-white/8 hover:bg-white/14 text-white border border-border-subtle hover:border-border-bright',
      ghost:     'text-white/70 hover:text-white hover:bg-white/8',
      danger:    'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30',
      gold:      'bg-accent-gold/15 hover:bg-accent-gold/25 text-accent-gold border border-accent-gold/30 shadow-glow-gold',
    };

    const sizes = {
      sm: 'text-sm px-4 py-2 h-9',
      md: 'text-sm px-5 py-2.5 h-11',
      lg: 'text-base px-7 py-3 h-12',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
