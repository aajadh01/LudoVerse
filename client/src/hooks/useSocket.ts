import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@ludoverse/shared';
import { SERVER_URL } from '@/lib/constants';

export type SocketType = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface UseSocketReturn {
  socket: SocketType | null;
  connected: boolean;
  connecting: boolean;
}

// Singleton socket instance so HMR doesn't multiply connections
let _socket: SocketType | null = null;

export function getSocket(): SocketType {
  if (!_socket) {
    _socket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      reconnectionAttempts: Infinity,
      timeout: 10_000,
    });
  } else if (!_socket.connected && !_socket.active) {
    _socket.connect();
  }
  return _socket;
}

export function useSocket() {
  const socketRef = useRef<SocketType>(getSocket());
  const [connected, setConnected] = useState(socketRef.current.connected);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const socket = socketRef.current;

    const onConnect = () => { setConnected(true); setConnecting(false); };
    const onDisconnect = () => { setConnected(false); };
    const onConnectError = () => { setConnecting(true); };
    const onReconnectAttempt = () => { setConnecting(true); };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);

    if (!socket.connected) {
      socket.connect();
      setConnecting(true);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
    };
  }, []);

  return { socket: socketRef.current, connected, connecting };
}

// ── Session persistence ─────────────────────────────────────────────────────

const SESSION_KEY = 'lv_session';

interface Session {
  roomId: string;
  playerId: string;
  sessionToken: string;
  playerName: string;
}

export function saveSession(session: Session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
