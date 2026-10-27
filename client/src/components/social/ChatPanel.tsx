import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/hooks/useGameRoom';
import { PLAYER_COLORS, REACTIONS } from '@/lib/constants';
import { GameState } from '@ludoverse/shared';
import { Send } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  myPlayerId: string;
  gameState: GameState;
  onSend: (text: string) => void;
  onReaction: (emoji: string) => void;
}

export function ChatPanel({ messages, myPlayerId, gameState, onSend, onReaction }: ChatPanelProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Reaction picker */}
      <div className="flex gap-1.5 px-4 py-3 border-b border-border-subtle flex-wrap">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => onReaction(emoji)}
            className="text-xl min-touch w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-90 transition-all"
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted mt-6">No messages yet. Say hello! 👋</p>
        )}
        {messages.map(msg => {
          const player = gameState.players.find(p => p.id === msg.playerId);
          const color = player ? PLAYER_COLORS[player.color] : null;
          const isMe = msg.playerId === myPlayerId;

          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isMe && (
                <div
                  className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ backgroundColor: `${color?.hex}22`, border: `1.5px solid ${color?.hex}` }}
                >
                  <span style={{ color: color?.hex }}>{color?.glyph}</span>
                </div>
              )}
              <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                {!isMe && (
                  <span className="text-xs font-medium" style={{ color: color?.hex }}>
                    {msg.playerName}
                  </span>
                )}
                <div
                  className={`px-3 py-2 rounded-2xl text-sm text-white ${
                    isMe
                      ? 'bg-accent-primary/80 rounded-tr-sm'
                      : 'bg-white/8 rounded-tl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-safe pt-3 border-t border-border-subtle flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Type a message..."
          maxLength={200}
          className="flex-1 h-10 px-3 rounded-xl bg-white/6 border border-border-subtle text-white text-sm placeholder-white/30 focus:outline-none focus:border-accent-primary transition-colors"
          aria-label="Chat message"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="w-10 h-10 rounded-xl bg-accent-primary flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all"
          aria-label="Send message"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
