import mongoose, { Schema, Document } from 'mongoose';
import { GameMode, GameRulePreset, PlayerColor, CaptureTransaction, MatchAwards } from '@ludoverse/shared';

export interface IMatchDocument extends Document {
  roomId: string;
  mode: GameMode;
  rulePreset?: GameRulePreset;
  players: {
    id: string;
    name: string;
    color: PlayerColor;
    finishRank?: number;
  }[];
  winner?: {
    id: string;
    name: string;
    color: PlayerColor;
  };
  awards: MatchAwards;
  totalCaptures: number;
  captureLedger: CaptureTransaction[];
  durationSeconds: number;
  status: 'COMPLETED' | 'EARLY_ENDED';
  createdAt: Date;
}

const MatchSchema = new Schema<IMatchDocument>({
  roomId: { type: String, required: true, index: true },
  mode: { type: String, required: true },
  rulePreset: { type: String },
  players: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String, required: true },
    finishRank: { type: Number },
  }],
  winner: {
    id: { type: String },
    name: { type: String },
    color: { type: String },
  },
  awards: { type: Schema.Types.Mixed, default: {} },
  totalCaptures: { type: Number, default: 0 },
  captureLedger: [Schema.Types.Mixed],
  durationSeconds: { type: Number, default: 0 },
  status: { type: String, enum: ['COMPLETED', 'EARLY_ENDED'], required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const MatchModel = mongoose.model<IMatchDocument>('Match', MatchSchema);
