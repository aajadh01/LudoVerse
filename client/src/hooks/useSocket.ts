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

// ── Session persistence & Identity ──────────────────────────────────────────

const SESSION_KEY = 'lv_session';

export interface Session {
  roomId: string;
  playerId: string;
  sessionToken: string;
  playerName: string;
  userId?: string;
}

/**
 * Generates or retrieves a persistent, device-scoped guest/user identity.
 * Survives page reloads, tab navigation, and room departures.
 */
export function getOrCreateUserId(): string {
  let uid = localStorage.getItem('lv_user_id');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    localStorage.setItem('lv_user_id', uid);
  }
  return uid;
}

export function saveSession(session: Session) {
  const enriched: Session = {
    ...session,
    userId: session.userId || getOrCreateUserId(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(enriched));
  if (session.roomId) {
    localStorage.setItem(`lv_room_${session.roomId.toUpperCase()}`, JSON.stringify(enriched));
  }
}

export function loadSession(roomId?: string): Session | null {
  try {
    if (roomId) {
      const roomRaw = localStorage.getItem(`lv_room_${roomId.toUpperCase()}`);
      if (roomRaw) return JSON.parse(roomRaw) as Session;
    }
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as Session;
    return null;
  } catch {
    return null;
  }
}

export function clearSession(roomId?: string) {
  sessionStorage.removeItem(SESSION_KEY);
  if (roomId) {
    localStorage.removeItem(`lv_room_${roomId.toUpperCase()}`);
  }
}
