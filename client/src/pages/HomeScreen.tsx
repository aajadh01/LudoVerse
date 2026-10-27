import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameRoom } from '@/hooks/useGameRoom';
import { useSocket } from '@/hooks/useSocket';
import { LocalLudoEngine, LocalMatchRecord } from '@/lib/localEngine';
import { GameRulePreset } from '@ludoverse/shared';
import { cn } from '@/lib/utils';
import {
  Users,
  Smartphone,
  Globe2,
  Trophy,
  HelpCircle,
  X,
  Plus,
  ArrowRight,
  Wifi,
  WifiOff,
  Loader2,
  Sparkles,
} from 'lucide-react';

export function HomeScreen() {
  const navigate = useNavigate();
  const { connected, connecting } = useSocket();
  const { createRoom, joinRoom } = useGameRoom();

  const [savedName, setSavedName] = useState(() => localStorage.getItem('ludoverse_player_name') || '');
  const [activeModal, setActiveModal] = useState<'FRIENDS' | 'HISTORY' | 'RULES' | null>(null);

  // Friends multiplayer modal state
  const [friendsTab, setFriendsTab] = useState<'create' | 'join'>('create');
  const [roomCode, setRoomCode] = useState('');
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [rulePreset, setRulePreset] = useState<GameRulePreset>('CLASSIC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Local match history
  const [history, setHistory] = useState<LocalMatchRecord[]>([]);

  const saveName = (name: string) => {
    setSavedName(name);
    localStorage.setItem('ludoverse_player_name', name);
  };

  const handleCreateRoom = () => {
    if (!savedName.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError('');

    const mode = playerCount > 4 ? 'CUSTOM_RADIAL' : 'TRADITIONAL_4P';
    createRoom(
      savedName.trim(),
      {
        mode,
        rulePreset,
        targetPlayerCount: playerCount,
      },
      (roomId: string | null, err?: string) => {
        setLoading(false);
        if (roomId) navigate(`/room/${roomId}`);
        else setError(err || 'Failed to create room');
      }
    );
  };

  const handleJoinRoom = () => {
    if (!savedName.trim()) {
      setError('Please enter your name');
      return;
    }
    const clean = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 6) {
      setError('Enter a valid 6-character room code');
      return;
    }
    setLoading(true);
    setError('');

    joinRoom(clean, savedName.trim(), undefined, (err) => {
      setLoading(false);
      if (err) setError(err);
      else navigate(`/room/${clean}`);
    });
  };

  const openHistory = () => {
    setHistory(LocalLudoEngine.getHistory());
    setActiveModal('HISTORY');
  };

  return (
    <div className="min-h-screen flex flex-col ludo-king-bg text-white select-none relative overflow-x-hidden">
      {/* ── Top Bar: Profile & System Controls ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#002868]/90 border-b border-[#FFC928]/30 shadow-lg z-20">
        {/* Profile Pill */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-white/10 border border-white/20 shadow-inner">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#087BE8] to-[#29B6E8] border border-white flex items-center justify-center font-black text-sm shadow">
            {savedName.trim() ? savedName.trim().slice(0, 2).toUpperCase() : '👤'}
          </div>
          <div className="flex flex-col">
            <input
              type="text"
              value={savedName}
              onChange={(e) => saveName(e.target.value)}
              placeholder="Your Name"
              maxLength={20}
              className="bg-transparent text-xs font-black text-[#FFC928] placeholder-white/50 focus:outline-none w-28 sm:w-36"
            />
            <span className="text-[9px] text-sky-200">Player Profile</span>
          </div>
        </div>

        {/* Action icons: Connection status, History, Rules */}
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <div
            className={cn(
              'px-2.5 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 border',
              connected
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : connecting
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-red-500/20 text-red-300 border-red-500/40'
            )}
          >
            {connected ? (
              <>
                <Wifi size={12} /> <span className="hidden sm:inline">Online</span>
              </>
            ) : connecting ? (
              <>
                <Loader2 size={12} className="animate-spin" /> <span className="hidden sm:inline">Connecting</span>
              </>
            ) : (
              <>
                <WifiOff size={12} /> <span className="hidden sm:inline">Offline</span>
              </>
            )}
          </div>

          <button
            onClick={openHistory}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-all"
            title="Match History"
          >
            <Trophy size={16} className="text-[#FFC928]" />
          </button>

          <button
            onClick={() => setActiveModal('RULES')}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-all"
            title="Game Rules"
          >
            <HelpCircle size={16} className="text-sky-300" />
          </button>
        </div>
      </header>

      {/* ── Main Home Arena: Logo & Only 2 Primary Mode Buttons ── */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-lg mx-auto w-full gap-8">
        {/* LudoVerse Arcade Logo & Token Cluster */}
        <div className="flex flex-col items-center text-center animate-fade-in">
          <div className="relative mb-3">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#FFE978] via-[#FFC928] to-[#D99A00] p-1 shadow-2xl border-2 border-white flex items-center justify-center transform -rotate-3 hover:rotate-0 transition-transform">
              <div className="w-full h-full rounded-2xl bg-[#0756B8] flex items-center justify-center border border-white/40">
                <span className="text-4xl">🎲</span>
              </div>
            </div>
            {/* Quadrant Token Dots */}
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#00A651] border-2 border-white shadow text-[10px] font-black flex items-center justify-center">●</div>
            <div className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-[#E52521] border-2 border-white shadow text-[10px] font-black flex items-center justify-center">⬥</div>
          </div>

          <h1
            className="text-4xl sm:text-5xl font-black tracking-tight text-white"
            style={{ textShadow: '0 3px 0 #07305D, 0 6px 14px rgba(0,0,0,0.7)' }}
          >
            Ludo<span className="text-[#FFC928]">Verse</span>
          </h1>
          <p className="text-xs sm:text-sm font-bold text-sky-200 uppercase tracking-widest mt-1">
            Choose Your Game Mode
          </p>
        </div>

        {/* ── THE ONLY 2 PRIMARY CHOICES ── */}
        <div className="w-full flex flex-col gap-4 animate-slide-up">
          {/* 1. PASS & PLAY BUTTON */}
          <button
            onClick={() => navigate('/pass-and-play')}
            className="group relative w-full p-5 rounded-3xl bg-gradient-to-r from-[#0756B8] via-[#087BE8] to-[#0756B8] border-2 border-[#FFC928] shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_32px_rgba(255,201,40,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-4">
              {/* Illustrated Pass & Play Icon */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFE978] to-[#FFC928] p-1 shadow-md border-2 border-white flex items-center justify-center shrink-0">
                <div className="w-full h-full rounded-xl bg-[#00377D] flex items-center justify-center text-white">
                  <Smartphone size={28} className="text-[#FFE978]" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-[#FFC928] tracking-wide">
                    PASS & PLAY
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[9px] font-black uppercase">
                    Offline
                  </span>
                </div>
                <p className="text-xs text-sky-100 font-semibold mt-0.5">
                  Play with friends on 1 phone · 2 to 4 Players
                </p>
              </div>
            </div>

            <div className="w-10 h-10 rounded-2xl bg-white/10 group-hover:bg-[#FFC928] group-hover:text-[#07305D] text-white flex items-center justify-center transition-all border border-white/20 shrink-0">
              <ArrowRight size={20} />
            </div>
          </button>

          {/* 2. FRIENDS (ONLINE MULTIPLAYER) BUTTON */}
          <button
            onClick={() => {
              setError('');
              setActiveModal('FRIENDS');
            }}
            className="group relative w-full p-5 rounded-3xl bg-gradient-to-r from-[#00377D] via-[#0756B8] to-[#00377D] border-2 border-[#29B6E8] shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_32px_rgba(41,182,232,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-4">
              {/* Illustrated Friends Multiplayer Icon */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#29B6E8] to-[#087BE8] p-1 shadow-md border-2 border-white flex items-center justify-center shrink-0">
                <div className="w-full h-full rounded-xl bg-[#002868] flex items-center justify-center text-white">
                  <Users size={28} className="text-[#29B6E8]" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                    FRIENDS
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-[9px] font-black uppercase">
                    Online
                  </span>
                </div>
                <p className="text-xs text-sky-200 font-semibold mt-0.5">
                  Private Rooms · Video & Voice Chat · WhatsApp Link
                </p>
              </div>
            </div>

            <div className="w-10 h-10 rounded-2xl bg-white/10 group-hover:bg-[#29B6E8] group-hover:text-[#002868] text-white flex items-center justify-center transition-all border border-white/20 shrink-0">
              <ArrowRight size={20} />
            </div>
          </button>
        </div>
      </main>

      {/* ── FRIENDS MULTIPLAYER MODAL ── */}
      {activeModal === 'FRIENDS' && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fade-in">
          <div className="relative w-full max-w-md bg-gradient-to-b from-[#0756B8] via-[#00377D] to-[#04153B] border-2 border-[#FFC928] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-[#002868] border-b border-[#FFC928]/30">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-[#FFC928]" />
                <h3 className="text-lg font-black text-[#FFC928]">Play With Friends</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Name Input Row */}
            <div className="p-4 border-b border-white/10 bg-[#020B20]/50">
              <label className="text-[11px] font-black uppercase text-[#FFC928] tracking-wider block mb-1.5">
                Your Nickname
              </label>
              <input
                type="text"
                value={savedName}
                onChange={(e) => saveName(e.target.value)}
                placeholder="Enter your name"
                maxLength={24}
                className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-bold text-sm focus:outline-none focus:border-[#FFC928]"
              />
            </div>

            {/* Mode Switch Tabs: Create vs Join */}
            <div className="grid grid-cols-2 border-b border-white/10">
              <button
                onClick={() => setFriendsTab('create')}
                className={cn(
                  'py-3 text-xs font-black uppercase transition-all',
                  friendsTab === 'create'
                    ? 'bg-[#087BE8] text-white border-b-2 border-[#FFC928]'
                    : 'text-white/60 hover:text-white'
                )}
              >
                + Create Room
              </button>
              <button
                onClick={() => setFriendsTab('join')}
                className={cn(
                  'py-3 text-xs font-black uppercase transition-all',
                  friendsTab === 'join'
                    ? 'bg-[#087BE8] text-white border-b-2 border-[#FFC928]'
                    : 'text-white/60 hover:text-white'
                )}
              >
                → Join Room
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4">
              {friendsTab === 'create' ? (
                <>
                  {/* Player Count Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-sky-200">Player Count</span>
                      <span className="text-xs font-black text-[#FFC928]">
                        {playerCount <= 4 ? `${playerCount} Players (Traditional)` : `${playerCount} Players (Radial)`}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                      {[2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setPlayerCount(count)}
                          className={cn(
                            'py-2 rounded-xl text-xs font-black border transition-all',
                            playerCount === count
                              ? 'bg-[#FFC928] text-[#07305D] border-white shadow-md'
                              : 'bg-white/10 border-white/20 text-white/70 hover:text-white'
                          )}
                        >
                          {count}P
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 5-9 Player Radial Mode Settings */}
                  {playerCount >= 5 && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/15 flex flex-col gap-2">
                      <span className="text-xs font-bold text-[#FFC928]">Radial Rules Mode</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRulePreset('CLASSIC')}
                          className={cn(
                            'p-2 rounded-lg text-left border text-xs font-bold transition-all',
                            rulePreset === 'CLASSIC'
                              ? 'bg-[#087BE8] border-[#FFC928] text-white'
                              : 'bg-white/5 border-white/10 text-white/60'
                          )}
                        >
                          <div>Normal Rules</div>
                          <div className="text-[10px] font-normal text-sky-200">4 tokens / player</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRulePreset('RAPID')}
                          className={cn(
                            'p-2 rounded-lg text-left border text-xs font-bold transition-all',
                            rulePreset === 'RAPID'
                              ? 'bg-amber-500 border-[#FFC928] text-white'
                              : 'bg-white/5 border-white/10 text-white/60'
                          )}
                        >
                          <div>Rapid Game</div>
                          <div className="text-[10px] font-normal text-amber-200">2 tokens / player</div>
                        </button>
                      </div>
                    </div>
                  )}

                  {error && <p className="text-xs text-red-400 font-bold">{error}</p>}

                  <button
                    onClick={handleCreateRoom}
                    disabled={loading || !connected}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FFE978] via-[#FFC928] to-[#D99A00] text-[#07305D] font-black text-sm uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Creating Room…' : `Create ${playerCount}-Player Room →`}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-bold text-sky-200 block mb-1.5">
                      Enter 6-Character Room Code
                    </label>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                      placeholder="ABC123"
                      maxLength={6}
                      className="w-full py-3 text-center text-xl font-mono font-black tracking-widest uppercase rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-[#FFC928]"
                    />
                  </div>

                  {error && <p className="text-xs text-red-400 font-bold">{error}</p>}

                  <button
                    onClick={handleJoinRoom}
                    disabled={loading || !connected || roomCode.length < 6}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FFE978] via-[#FFC928] to-[#D99A00] text-[#07305D] font-black text-sm uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Joining Room…' : 'Join Room Now →'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LOCAL MATCH HISTORY MODAL ── */}
      {activeModal === 'HISTORY' && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fade-in">
          <div className="relative w-full max-w-md bg-gradient-to-b from-[#0756B8] to-[#04153B] border-2 border-[#FFC928] rounded-3xl shadow-2xl p-5 flex flex-col gap-4 max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Trophy size={20} className="text-[#FFC928]" />
                <h3 className="text-lg font-black text-[#FFC928]">Pass & Play History</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5">
              {history.length === 0 ? (
                <div className="py-12 text-center text-white/50 text-xs">
                  No local matches played yet.
                </div>
              ) : (
                history.map((record) => (
                  <div
                    key={record.id}
                    className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#FFC928]">
                        Winner: {record.winnerName}
                      </span>
                      <span className="text-[10px] text-white/50">
                        {new Date(record.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {record.players.map((p, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-lg bg-white/10 text-[10px] font-bold text-sky-200"
                        >
                          {p.name}: {p.kills} kills
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── GAME RULES MODAL ── */}
      {activeModal === 'RULES' && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fade-in">
          <div className="relative w-full max-w-md bg-gradient-to-b from-[#0756B8] to-[#04153B] border-2 border-[#FFC928] rounded-3xl shadow-2xl p-5 flex flex-col gap-4 max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle size={20} className="text-[#FFC928]" />
                <h3 className="text-lg font-black text-[#FFC928]">Ludo Rules</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto text-xs text-sky-100 flex flex-col gap-3 leading-relaxed">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-black text-[#FFC928] mb-1">🎲 Yard Exit</h4>
                <p>Roll a 6 to bring a pawn out of the yard onto your starting cell.</p>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-black text-[#FFC928] mb-1">⚔️ Captures & Hunter</h4>
                <p>Landing on an opponent pawn outside safe cells captures it back to yard and grants you a bonus turn!</p>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-black text-[#FFC928] mb-1">★ Safe Cells</h4>
                <p>Pawns on spawn squares and star squares (★) cannot be captured.</p>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <h4 className="font-black text-[#FFC928] mb-1">🚫 3 Consecutive Sixes</h4>
                <p>Rolling three sixes in a row forfeits your turn immediately.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
