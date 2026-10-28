import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents } from '@ludoverse/shared';
import { RoomManager } from './rooms/RoomManager.js';
import { registerSocketHandlers } from './sockets/gameHandlers.js';
import { connectDB, getRecentMatches } from './db/connection.js';
import { getWebRtcConfig } from './webrtc/iceConfig.js';

const clientDistPath = fs.existsSync(path.resolve(process.cwd(), 'client/dist'))
  ? path.resolve(process.cwd(), 'client/dist')
  : path.resolve(process.cwd(), '../client/dist');

const PORT = Number(process.env['PORT'] ?? 3001);
const CLIENT_ORIGIN = process.env['CLIENT_ORIGIN'];

// ─── Express ────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (!CLIENT_ORIGIN || CLIENT_ORIGIN === '*' || CLIENT_ORIGIN.split(',').map(s => s.trim()).includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

app.get('/api/webrtc/config', async (_req, res) => {
  try {
    const config = await getWebRtcConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/matches', async (_req, res) => {
  try {
    const matches = await getRecentMatches(20);
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/room/:roomId', (req, res) => {
  const room = roomManager.getRoom(req.params['roomId']?.toUpperCase() ?? '');
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  res.json({
    roomId: room.roomId,
    mode: room.mode,
    playerCount: room.players.length,
    status: room.gameState?.status ?? 'LOBBY',
    isFull: room.players.length >= (room.mode === 'TRADITIONAL_4P' ? 4 : 9),
  });
});

// Also keep /room-info/:roomId for helper lookups
app.get('/room-info/:roomId', (req, res) => {
  const room = roomManager.getRoom(req.params['roomId']?.toUpperCase() ?? '');
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  res.json({
    roomId: room.roomId,
    mode: room.mode,
    playerCount: room.players.length,
    status: room.gameState?.status ?? 'LOBBY',
    isFull: room.players.length >= (room.mode === 'TRADITIONAL_4P' ? 4 : 9),
  });
});

// Serve frontend build from client/dist if present
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
      return next();
    }
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

// ─── HTTP + Socket.IO Server ────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Enable connection state recovery so re-connecting sockets
  // receive buffered events (max 2 min buffer)
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  pingTimeout: 20_000,
  pingInterval: 10_000,
});

const roomManager = new RoomManager();
registerSocketHandlers(io, roomManager);

// ─── Start ───────────────────────────────────────────────────────────────────
httpServer.listen(PORT, async () => {
  await connectDB();
  console.log(`✅  LudoVerse server running on http://localhost:${PORT}`);
  console.log(`🔌  WebSocket ready — accepting connections from ${CLIENT_ORIGIN}`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  roomManager.destroy();
  httpServer.close(() => process.exit(0));
});
