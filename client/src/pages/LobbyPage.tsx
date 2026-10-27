import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameRoom } from '@/hooks/useGameRoom';
import { loadSession, clearSession } from '@/hooks/useSocket';
import { PLAYER_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  Crown, Copy, Check, Users, Settings, WifiOff, LogOut,
  Share2, MessageSquare, Loader2, Home, Plus, AlertCircle, RefreshCw
} from 'lucide-react';

export default function LobbyPage() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const {
    gameState, playerId, joinRoom, setReady, startGame,
    updateSettings, leaveRoom, errorMsg
  } = useGameRoom();

  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [directName, setDirectName] = useState(() => localStorage.getItem('ludoverse_player_name') || '');
  const [isJoiningDirect, setIsJoiningDirect] = useState(false);
  
  // Check if we already have a session for this specific room
  const initialSession = loadSession();
  const cleanRoomId = roomId.toUpperCase();
  const hasMatchingSession = initialSession?.roomId === cleanRoomId && Boolean(initialSession?.sessionToken);

  // If no matching session exists, we do NOT wait at all; show the Join prompt immediately
  const [timedOutWaiting, setTimedOutWaiting] = useState(!hasMatchingSession);
  const reconnectAttempted = useRef(false);

  // Auto-redirect if game starts
  useEffect(() => {
    if (gameState?.status === 'IN_GAME') {
      navigate(`/room/${cleanRoomId}/game`, { replace: true });
    }
  }, [gameState?.status, navigate, cleanRoomId]);

  // Attempt auto-reconnect if session exists
  useEffect(() => {
    if (!gameState && hasMatchingSession && !reconnectAttempted.current) {
      reconnectAttempted.current = true;
      const session = loadSession();
      if (session?.roomId === cleanRoomId && session?.sessionToken) {
        joinRoom(cleanRoomId, session.playerName, session.sessionToken, (err) => {
          if (err) {
            clearSession();
            setTimedOutWaiting(true);
          }
        });
      }
      // Safety watchdog: never spin longer than 2.2 seconds
      const timer = setTimeout(() => {
        setTimedOutWaiting(true);
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [cleanRoomId, gameState, hasMatchingSession, joinRoom]);

  // Handle direct join from WhatsApp or shared link
  const handleDirectJoin = () => {
    const trimmed = directName.trim();
    if (!trimmed || isJoiningDirect) return;
    localStorage.setItem('ludoverse_player_name', trimmed);
    setIsJoiningDirect(true);
    joinRoom(cleanRoomId, trimmed, undefined, (_err) => {
      setIsJoiningDirect(false);
      setTimedOutWaiting(true);
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(cleanRoomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareUrl = `${window.location.origin}/room/${cleanRoomId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // WhatsApp Direct Sharing (works seamlessly on Mobile App and Laptop/Web)
  const handleWhatsAppShare = () => {
    const shareText = `🎲 Play LudoVerse with me!\nRoom Code: ${cleanRoomId}\n\n👉 Click below to join directly:\n${shareUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // Native Mobile Share Sheet
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Play LudoVerse with me!',
          text: `Join my Ludo room: ${cleanRoomId}`,
          url: shareUrl,
        });
      } catch {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const handleLeave = () => {
    clearSession();
    leaveRoom(cleanRoomId);
    navigate('/', { replace: true });
  };

  // ── Error Screen: If room not found or session expired ──
  if (errorMsg && (!gameState || gameState.roomId !== cleanRoomId)) {
    return (
      <div className="min-h-screen ludo-king-bg flex flex-col items-center justify-center p-4 select-none">
        <div className="w-full max-w-sm bg-[#002868]/95 border-2 border-[#FFC928] rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-3">
            <AlertCircle size={32} className="text-red-400" />
          </div>
          <h2 className="text-xl font-black text-white">Room Notice</h2>
          <p className="text-xs text-sky-200 font-medium mt-1 mb-3">
            {errorMsg}
          </p>
          <div className="w-full bg-[#001740] rounded-xl p-3 border border-white/10 mb-5">
            <p className="text-[11px] text-sky-300 font-bold">Room Code:</p>
            <p className="text-xl font-mono font-black text-[#FFC928] tracking-widest">{cleanRoomId}</p>
            <p className="text-[10px] text-white/50 mt-1">The host may have ended the game or the code has expired.</p>
          </div>

          <div className="w-full flex flex-col gap-2.5">
            <button
              onClick={() => {
                clearSession();
                navigate('/', { replace: true });
              }}
              className="w-full py-3 px-4 rounded-xl font-black text-sm uppercase tracking-wide bg-gradient-to-b from-[#FFE978] to-[#FFC928] text-[#07305D] border-2 border-[#FFE978] shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Home size={18} />
              Return Home
            </button>
            <button
              onClick={() => {
                clearSession();
                setTimedOutWaiting(true);
                handleDirectJoin();
              }}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-white/10 hover:bg-white/15 border border-white/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} />
              Try Reconnecting
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading Screen: While auto-reconnecting (max 2.2s watchdog) ──
  if ((!gameState || gameState.roomId !== cleanRoomId) && !timedOutWaiting) {
    return (
      <div className="min-h-screen ludo-king-bg flex items-center justify-center p-4 select-none">
        <div className="flex flex-col items-center gap-3 bg-[#002868]/90 border border-[#FFC928]/40 px-6 py-5 rounded-2xl shadow-2xl">
          <Loader2 size={36} className="animate-spin text-[#FFC928]" />
          <p className="text-white text-sm font-black tracking-wide">Connecting to room {cleanRoomId}…</p>
          <p className="text-sky-200 text-xs">Rejoining your active match</p>
        </div>
      </div>
    );
  }

  // ── Direct Join Prompt (when invited via WhatsApp link or session expired) ──
  if (!gameState || gameState.roomId !== cleanRoomId) {
    return (
      <div className="min-h-screen ludo-king-bg flex flex-col items-center justify-center px-4 py-8 select-none">
        <div className="w-full max-w-sm bg-[#002868]/95 border-2 border-[#FFC928] rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-slide-up">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#0756B8] border-2 border-[#FFC928] flex items-center justify-center mx-auto mb-2 shadow-md">
              <span className="text-2xl">🎲</span>
            </div>
            <h1 className="text-2xl font-black text-[#FFE978] tracking-wide uppercase drop-shadow">Join Ludo Room</h1>
            <p className="text-xs text-sky-200 font-bold mt-0.5">Enter your name to join the game</p>
            <div className="inline-block mt-2 px-3 py-1 bg-[#001740] border border-[#FFC928]/50 rounded-xl text-base font-mono font-black tracking-widest text-[#FFC928]">
              {cleanRoomId}
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-1">
            <div>
              <label className="text-[11px] font-bold text-sky-200 uppercase tracking-wider mb-1 block">Your Name</label>
              <input
                type="text"
                placeholder="Enter player name"
                value={directName}
                onChange={e => setDirectName(e.target.value)}
                maxLength={24}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleDirectJoin()}
                className="w-full px-4 py-3 bg-[#001740] border-2 border-white/20 focus:border-[#FFC928] rounded-xl text-white font-bold text-sm outline-none transition-all placeholder:text-white/30"
              />
            </div>

            <button
              onClick={handleDirectJoin}
              disabled={!directName.trim() || isJoiningDirect}
              className="w-full py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wide bg-gradient-to-b from-[#FFE978] to-[#FFC928] text-[#07305D] border-2 border-[#FFE978] shadow-lg active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-1"
            >
              {isJoiningDirect ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Joining Room…
                </>
              ) : (
                <>
                  Join Match →
                </>
              )}
            </button>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <button
              onClick={() => {
                clearSession();
                navigate('/');
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-sky-200 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <Home size={14} />
              Create New Room / Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const me = gameState.players.find(p => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const connectedPlayers = gameState.players.filter(p => p.isConnected);
  const allReady = connectedPlayers.filter(p => !p.isHost).every(p => p.isReady);
  const canStart = isHost && connectedPlayers.length >= 2 && allReady;

  return (
    <div className="min-h-screen ludo-king-bg flex flex-col items-center px-4 py-6 select-none">
      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between mb-3 bg-[#002868]/90 border border-[#FFC928]/40 px-4 py-3 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-lg font-black text-[#FFE978] uppercase tracking-wide">Game Lobby</h1>
          <p className="text-[11px] text-sky-200 font-bold">Waiting for players to get ready</p>
        </div>
        <button
          onClick={handleLeave}
          className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-white border border-red-500/40 transition-colors"
          aria-label="Leave room"
          title="Leave Room"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Room code & Instant Share Card */}
      <div className="w-full max-w-sm mb-3 bg-[#002868]/95 border-2 border-[#FFC928] rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 pt-3.5 pb-3 flex items-center justify-between border-b border-white/10 bg-[#001F52]">
          <div>
            <p className="text-[10px] text-sky-200 font-black uppercase tracking-wider">Room Code</p>
            <p className="text-2xl font-black text-[#FFC928] tracking-widest font-mono drop-shadow">{cleanRoomId}</p>
          </div>
          <button
            onClick={handleCopyCode}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all shadow-md',
              copied ? 'bg-emerald-500 text-white' : 'bg-gradient-to-b from-[#FFE978] to-[#FFC928] text-[#07305D]'
            )}
            aria-label="Copy code"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* WhatsApp & Social Share Action Row */}
        <div className="p-3 bg-[#001740] flex gap-2">
          {/* Direct WhatsApp Share button */}
          <button
            onClick={handleWhatsAppShare}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-black text-xs shadow-lg active:scale-95 transition-all"
            aria-label="Share via WhatsApp"
          >
            <MessageSquare size={16} />
            Share WhatsApp
          </button>

          {/* Native Share / Copy Link */}
          <button
            onClick={handleNativeShare}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs active:scale-95 transition-all"
            aria-label="Share invite link"
          >
            {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
            {copiedLink ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {/* Game Mode & Rules Configuration (Host controls) */}
      <div className="w-full max-w-sm mb-3 bg-[#002868]/95 border border-[#FFC928]/50 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-white/10 bg-[#001F52] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-[#FFC928]" />
            <span className="text-xs font-black text-white uppercase tracking-wider">Mode & Rules</span>
          </div>
          {isHost && (
            <span className="text-[10px] font-black text-[#FFC928] px-2 py-0.5 rounded-full bg-[#FFC928]/15 border border-[#FFC928]/40">
              Host Controls
            </span>
          )}
        </div>

        <div className="p-3.5 flex flex-col gap-3">
          {/* Player Count Selector (2 to 9) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-sky-200 font-bold">Player Count</label>
              <span className="text-xs font-black text-[#FFC928]">
                {(gameState.targetPlayerCount ?? (gameState.mode === 'TRADITIONAL_4P' ? 4 : 6))} Players Max
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
              {[2, 3, 4, 5, 6, 7, 8, 9].map((count) => {
                const currentCount = gameState.targetPlayerCount ?? (gameState.mode === 'TRADITIONAL_4P' ? 4 : 6);
                const isSelected = currentCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    disabled={!isHost}
                    onClick={() => isHost && updateSettings(cleanRoomId, {
                      targetPlayerCount: count,
                      mode: count > 4 ? 'CUSTOM_RADIAL' : 'TRADITIONAL_4P',
                    })}
                    className={cn(
                      'py-1.5 rounded-lg text-xs font-black border transition-all text-center',
                      isSelected
                        ? 'bg-gradient-to-b from-[#FFE978] to-[#FFC928] text-[#07305D] border-[#FFE978] shadow-md scale-105'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    )}
                  >
                    {count}P
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-sky-200 mt-1 font-medium">
              {(gameState.targetPlayerCount ?? (gameState.mode === 'TRADITIONAL_4P' ? 4 : 6)) <= 4
                ? 'Classic 4-Corner Ludo Board'
                : (gameState.targetPlayerCount ?? 6) === 5
                ? '5-Player Regular Pentagon Board'
                : (gameState.targetPlayerCount ?? 6) === 6
                ? '6-Player Regular Hexagon Board'
                : (gameState.targetPlayerCount ?? 6) === 7
                ? '7-Player Regular Septagon Board'
                : (gameState.targetPlayerCount ?? 6) === 8
                ? '8-Player Regular Octagon Board'
                : '9-Player Regular Nonagon Board'}
            </p>
          </div>

          {/* Radial Rule Presets (Normal Rules vs Rapid Game) */}
          {gameState.mode === 'CUSTOM_RADIAL' && (
            <div className="pt-2 border-t border-white/10 animate-fade-in">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-sky-200 font-bold">5–9 Player Rules</label>
                {!isHost && <span className="text-[10px] text-white/50 italic">Controlled by Host</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => isHost && updateSettings(cleanRoomId, { rulePreset: 'CLASSIC' })}
                  className={cn(
                    'p-2.5 rounded-xl text-left border transition-all select-none',
                    isHost ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default opacity-80',
                    gameState.rulePreset !== 'RAPID'
                      ? 'bg-gradient-to-b from-[#FFE978]/20 to-[#FFC928]/20 border-[#FFC928] text-white shadow-md'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                  )}
                >
                  <p className="text-xs font-black text-white">Normal Rules</p>
                  <p className="text-[10px] text-sky-200 mt-0.5">4 tokens / player</p>
                </button>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => isHost && updateSettings(cleanRoomId, { rulePreset: 'RAPID' })}
                  className={cn(
                    'p-2.5 rounded-xl text-left border transition-all select-none',
                    isHost ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default opacity-80',
                    gameState.rulePreset === 'RAPID'
                      ? 'bg-gradient-to-b from-[#FFE978]/20 to-[#FFC928]/20 border-[#FFC928] text-white shadow-md'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                  )}
                >
                  <p className="text-xs font-black text-[#FFE978]">Rapid Game</p>
                  <p className="text-[10px] text-sky-200 mt-0.5">2 tokens / player</p>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Players List */}
      <div className="w-full max-w-sm mb-3 bg-[#002868]/95 border border-[#FFC928]/50 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/10 bg-[#001F52]">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#FFC928]" />
            <span className="text-xs font-black text-white uppercase tracking-wider">Players</span>
          </div>
          <span className="text-xs font-bold text-sky-200">
            {connectedPlayers.length} / {gameState.targetPlayerCount ?? (gameState.mode === 'TRADITIONAL_4P' ? 4 : 9)}
          </span>
        </div>

        <div className="flex flex-col divide-y divide-white/5">
          {gameState.players.map((player) => {
            const color = PLAYER_COLORS[player.color];
            const isMe = player.id === playerId;

            return (
              <div key={player.id} className="flex items-center gap-3 px-4 py-2.5">
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-black shrink-0 shadow-md"
                  style={{ backgroundColor: color.hex, border: '2px solid #FFFFFF' }}
                >
                  <span className="text-white text-base drop-shadow">{color.glyph}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white truncate">
                      {player.name}{isMe && ' (You)'}
                    </span>
                    {player.isHost && <Crown size={13} className="text-[#FFC928] shrink-0" aria-label="Host" />}
                  </div>
                  <span className="text-[11px] font-bold" style={{ color: color.hex }}>{color.name}</span>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 shrink-0">
                  {!player.isConnected && (
                    <WifiOff size={14} className="text-red-400 animate-pulse" aria-label="Disconnected" />
                  )}
                  {!player.isHost && (
                    <span className={cn(
                      'text-xs font-bold px-2.5 py-0.5 rounded-full border',
                      player.isReady
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-white/10 text-white/50 border-white/10'
                    )}>
                      {player.isReady ? 'Ready' : 'Waiting…'}
                    </span>
                  )}
                  {player.isHost && (
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-[#FFC928]/20 text-[#FFE978] border border-[#FFC928]/40">
                      Host
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action button */}
      <div className="w-full max-w-sm flex flex-col gap-2 mt-auto">
        {isHost ? (
          <button
            onClick={() => startGame(cleanRoomId)}
            disabled={!canStart}
            className={cn(
              'w-full py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wide border-2 shadow-xl transition-all',
              canStart
                ? 'bg-gradient-to-b from-[#FFE978] to-[#FFC928] text-[#07305D] border-[#FFE978] active:scale-95 cursor-pointer'
                : 'bg-white/10 text-white/40 border-white/10 cursor-not-allowed'
            )}
          >
            {canStart ? 'Start Match →' : connectedPlayers.length < 2
              ? 'Waiting for players to join…'
              : 'Waiting for players to ready up…'}
          </button>
        ) : (
          <button
            onClick={() => setReady(cleanRoomId, !(me?.isReady))}
            className={cn(
              'w-full py-3.5 px-4 rounded-xl font-black text-sm uppercase tracking-wide border-2 shadow-xl transition-all active:scale-95',
              me?.isReady
                ? 'bg-white/10 hover:bg-white/15 text-white border-white/20'
                : 'bg-gradient-to-b from-[#FFE978] to-[#FFC928] text-[#07305D] border-[#FFE978]'
            )}
          >
            {me?.isReady ? '✓ Ready — Tap to Cancel' : 'Ready Up'}
          </button>
        )}
      </div>
    </div>
  );
}
