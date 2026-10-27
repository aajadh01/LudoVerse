import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useGameRoom } from '@/hooks/useGameRoom';
import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';
import { GameRulePreset } from '@ludoverse/shared';
import { Gamepad2, Users, Zap, Trophy, Wifi, WifiOff, Loader2 } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const { connected, connecting } = useSocket();
  const { createRoom, joinRoom } = useGameRoom();

  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [activeMode, setActiveMode] = useState<'create' | 'join' | null>(null);
  const [selectedPlayerCount, setSelectedPlayerCount] = useState<number>(4);
  const [selectedRulePreset, setSelectedRulePreset] = useState<GameRulePreset>('CLASSIC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    if (!playerName.trim()) { setError('Enter your name to continue'); nameInputRef.current?.focus(); return; }
    setLoading(true); setError('');
    const mode = selectedPlayerCount > 4 ? 'CUSTOM_RADIAL' : 'TRADITIONAL_4P';
    createRoom(
      playerName.trim(),
      {
        mode,
        rulePreset: selectedRulePreset,
        targetPlayerCount: selectedPlayerCount,
      },
      (roomId: string | null, err?: string) => {
        setLoading(false);
        if (roomId) navigate(`/room/${roomId}`);
        else setError(err ?? 'Failed to create room');
      }
    );
  };

  const handleJoin = async () => {
    if (!playerName.trim()) { setError('Enter your name to continue'); return; }
    const code = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) { setError('Enter a valid 6-character room code'); return; }
    setLoading(true); setError('');
    joinRoom(code, playerName.trim(), undefined, (err) => {
      setLoading(false);
      if (err) setError(err);
      else navigate(`/room/${code}`);
    });
  };

  const handleCodeInput = (val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRoomCode(clean);
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg-base overflow-x-hidden">
      {/* ── Connection status bar ── */}
      <div className={cn(
        'fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 py-1.5 text-xs font-medium transition-all',
        connecting ? 'bg-amber-500/15 text-amber-300' : connected ? 'hidden' : 'bg-red-500/15 text-red-300'
      )}>
        {connecting ? <Loader2 size={11} className="animate-spin" /> : <WifiOff size={11} />}
        {connecting ? 'Connecting to server…' : 'Disconnected — retrying…'}
      </div>

      {/* ── Hero ── */}
      <header className="relative flex flex-col items-center justify-center px-6 pt-20 pb-12 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-primary/8 rounded-full blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3 mb-4 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-accent-primary/20 border border-accent-primary/30 flex items-center justify-center">
            <Gamepad2 size={24} className="text-accent-primary" />
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">LudoVerse</h1>
            <p className="text-sm text-accent-primary font-medium">Multiplayer · Social · Competitive</p>
          </div>
        </div>

        {/* Board illustration (SVG placeholder) */}
        <div className="relative w-full max-w-xs mx-auto my-6 animate-float">
          <div className="aspect-square rounded-3xl bg-gradient-to-br from-accent-primary/15 to-bg-elevated border border-border-subtle shadow-card flex items-center justify-center">
            <MiniBoard />
          </div>
        </div>

        <p className="text-white/70 text-base max-w-xs mx-auto animate-fade-in">
          Play classic Ludo online with friends. Real-time multiplayer, voice chat, and live Hunter rankings.
        </p>
      </header>

      {/* ── Main Action Card ── */}
      <main className="flex-1 flex flex-col items-center px-4 pb-8 gap-4">
        <div className="w-full max-w-sm bg-elevated border border-border-subtle rounded-3xl overflow-hidden shadow-card animate-slide-up">
          {/* Name input */}
          <div className="px-5 pt-5 pb-4 border-b border-border-subtle">
            <Input
              ref={nameInputRef}
              label="Your Name"
              placeholder="Enter your name"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={24}
              autoComplete="nickname"
              error={error && !playerName.trim() ? error : undefined}
            />
          </div>

          {/* Mode tabs */}
          <div className="flex border-b border-border-subtle">
            {(['create', 'join'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setActiveMode(mode); setError(''); }}
                className={cn(
                  'flex-1 py-3.5 text-sm font-semibold transition-colors',
                  activeMode === mode
                    ? 'text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5'
                    : 'text-white/50 hover:text-white/80'
                )}
              >
                {mode === 'create' ? '+ Create Room' : '→ Join Room'}
              </button>
            ))}
          </div>

          <div className="px-5 py-5 flex flex-col gap-4">
            {activeMode === 'create' && (
              <div className="flex flex-col gap-4 animate-fade-in">
                {/* Player count selector (2 to 9) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-white font-bold uppercase tracking-wider">Number of Players</label>
                    <span className="text-xs font-semibold text-accent-gold">
                      {selectedPlayerCount <= 4
                        ? `${selectedPlayerCount} Players (Classic 4-Corner)`
                        : selectedPlayerCount === 5
                        ? '5 Players (Pentagon)'
                        : selectedPlayerCount === 6
                        ? '6 Players (Hexagon)'
                        : selectedPlayerCount === 7
                        ? '7 Players (Septagon)'
                        : selectedPlayerCount === 8
                        ? '8 Players (Octagon)'
                        : '9 Players (Nonagon)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {[2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setSelectedPlayerCount(count)}
                        className={cn(
                          'py-2 rounded-xl text-xs font-bold border transition-all text-center',
                          selectedPlayerCount === count
                            ? 'bg-accent-primary text-white border-accent-primary ring-2 ring-accent-primary/40 shadow-md'
                            : 'bg-white/5 border-border-subtle text-white/60 hover:text-white hover:bg-white/10'
                        )}
                      >
                        {count}P
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5-9 Player Rule Preset */}
                {selectedPlayerCount >= 5 && (
                  <div className="p-3 rounded-2xl bg-white/3 border border-border-subtle flex flex-col gap-2 animate-fade-in">
                    <label className="text-xs text-muted font-medium">Rules Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRulePreset('CLASSIC')}
                        className={cn(
                          'p-2 rounded-xl text-left border transition-all',
                          selectedRulePreset === 'CLASSIC'
                            ? 'bg-accent-primary/20 border-accent-primary text-white'
                            : 'bg-white/5 border-border-subtle text-white/50 hover:text-white'
                        )}
                      >
                        <p className="text-xs font-bold text-white">Normal Rules</p>
                        <p className="text-[10px] text-muted">4 tokens / player</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRulePreset('RAPID')}
                        className={cn(
                          'p-2 rounded-xl text-left border transition-all',
                          selectedRulePreset === 'RAPID'
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                            : 'bg-white/5 border-border-subtle text-white/50 hover:text-white'
                        )}
                      >
                        <p className="text-xs font-bold text-amber-400">Rapid Game</p>
                        <p className="text-[10px] text-muted">2 tokens / player</p>
                      </button>
                    </div>
                  </div>
                )}

                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button
                  onClick={handleCreate}
                  loading={loading}
                  disabled={!connected}
                  fullWidth
                  size="lg"
                >
                  Create {selectedPlayerCount}-Player Room →
                </Button>
              </div>
            )}

            {activeMode === 'join' && (
              <div className="flex flex-col gap-3 animate-fade-in">
                <Input
                  label="Room Code"
                  placeholder="ABC123"
                  value={roomCode}
                  onChange={e => handleCodeInput(e.target.value)}
                  maxLength={6}
                  className="tracking-widest text-center font-mono text-lg uppercase"
                  autoComplete="off"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button
                  onClick={handleJoin}
                  loading={loading}
                  disabled={!connected || roomCode.length < 6}
                  fullWidth
                  size="lg"
                >
                  Join Room
                </Button>
              </div>
            )}

            {!activeMode && (
              <div className="flex flex-col gap-3 animate-fade-in">
                <Button onClick={() => setActiveMode('create')} fullWidth size="lg">
                  Create Room
                </Button>
                <Button onClick={() => setActiveMode('join')} variant="secondary" fullWidth size="lg">
                  Join with Code
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mt-2 animate-fade-in">
          {[
            { icon: <Users size={13} />, label: '2–9 Players' },
            { icon: <Zap size={13} />, label: 'Real-time' },
            { icon: <Trophy size={13} />, label: 'Hunter Rankings' },
          ].map(f => (
            <div
              key={f.label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-border-subtle text-xs text-muted"
            >
              <span className="text-accent-primary">{f.icon}</span>
              {f.label}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// ── Mini decorative board ────────────────────────────────────────────────────
function MiniBoard() {
  const colors = ['#EF4444', '#10B981', '#F59E0B', '#3B82F6'];
  return (
    <svg viewBox="0 0 120 120" className="w-40 h-40 opacity-80">
      {/* Background */}
      <rect width={120} height={120} fill="#111827" rx={12} />
      {/* Four quadrants */}
      {[
        { x: 0, y: 60, color: colors[0] },
        { x: 0, y: 0, color: colors[1] },
        { x: 60, y: 0, color: colors[2] },
        { x: 60, y: 60, color: colors[3] },
      ].map((q, i) => (
        <rect key={i} x={q.x + 2} y={q.y + 2} width={56} height={56} fill={q.color} fillOpacity={0.18} rx={6} />
      ))}
      {/* Center */}
      <rect x={44} y={44} width={32} height={32} fill="#1F2937" rx={4} />
      <text x={60} y={64} textAnchor="middle" fontSize={14} fill="#F59E0B">★</text>
      {/* Tokens */}
      {[
        { cx: 20, cy: 80, c: colors[0] },
        { cx: 20, cy: 20, c: colors[1] },
        { cx: 100, cy: 20, c: colors[2] },
        { cx: 100, cy: 100, c: colors[3] },
      ].map((t, i) => (
        <circle key={i} cx={t.cx} cy={t.cy} r={8} fill={t.c} fillOpacity={0.85} stroke="#0B0E14" strokeWidth={1.5} />
      ))}
    </svg>
  );
}
