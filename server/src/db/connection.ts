import mongoose from 'mongoose';
import { MatchModel, IMatchDocument } from './models/MatchModel.js';
import { GameState, MatchAwards } from '@ludoverse/shared';

// In-memory fallback repository when MONGODB_URI is not provided
const inMemoryMatches: any[] = [];

let isConnectedToMongo = false;

export async function connectDB(): Promise<void> {
  const uri = process.env['MONGODB_URI'];

  if (!uri) {
    console.log('ℹ️  MONGODB_URI not set. Running with high-performance in-memory match persistence.');
    console.log('   (To connect to MongoDB Atlas, add MONGODB_URI in server/.env)');
    return;
  }

  try {
    await mongoose.connect(uri);
    isConnectedToMongo = true;
    console.log('✅ Connected to MongoDB Atlas successfully.');
  } catch (err) {
    console.error('⚠️  MongoDB connection failed, falling back to in-memory store:', (err as Error).message);
    isConnectedToMongo = false;
  }
}

export async function saveMatch(gameState: GameState, awards: MatchAwards): Promise<void> {
  const winnerPlayer = gameState.winnerPlayerId
    ? gameState.players.find(p => p.id === gameState.winnerPlayerId)
    : undefined;

  const durationSeconds = gameState.matchStartTime && gameState.matchEndTime
    ? Math.round((gameState.matchEndTime - gameState.matchStartTime) / 1000)
    : 0;

  const matchRecord = {
    roomId: gameState.roomId,
    mode: gameState.mode,
    rulePreset: gameState.rulePreset,
    players: gameState.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      finishRank: p.finishRank,
    })),
    winner: winnerPlayer ? {
      id: winnerPlayer.id,
      name: winnerPlayer.name,
      color: winnerPlayer.color,
    } : undefined,
    awards,
    totalCaptures: gameState.captureLedger.length,
    captureLedger: gameState.captureLedger,
    durationSeconds,
    status: gameState.status as 'COMPLETED' | 'EARLY_ENDED',
    createdAt: new Date(),
  };

  if (isConnectedToMongo) {
    try {
      await MatchModel.create(matchRecord);
      console.log(`💾 Match ${gameState.roomId} persisted to MongoDB Atlas.`);
    } catch (err) {
      console.error('Failed to save match to MongoDB:', (err as Error).message);
      inMemoryMatches.unshift(matchRecord);
    }
  } else {
    inMemoryMatches.unshift(matchRecord);
    if (inMemoryMatches.length > 200) inMemoryMatches.pop(); // keep last 200 matches in memory
    console.log(`💾 Match ${gameState.roomId} stored in memory repository.`);
  }
}

export async function getRecentMatches(limit = 20): Promise<any[]> {
  if (isConnectedToMongo) {
    try {
      return await MatchModel.find().sort({ createdAt: -1 }).limit(limit).lean();
    } catch {
      return inMemoryMatches.slice(0, limit);
    }
  }
  return inMemoryMatches.slice(0, limit);
}
