export type GameMode = 'TRADITIONAL_4P' | 'CUSTOM_RADIAL';

export type GameRulePreset = 'CLASSIC' | 'RAPID';

export type PlayerColor = 
  | 'red' 
  | 'green' 
  | 'yellow' 
  | 'blue' 
  | 'purple' 
  | 'orange' 
  | 'teal' 
  | 'pink' 
  | 'lime';

export interface PlayerVisualConfig {
  color: PlayerColor;
  hex: string;
  name: string;
  glyph: string; // Accessible geometric icon e.g. ⬥, ●, ★, ▲
}

export type TokenStatus = 'YARD' | 'TRACK' | 'RUNWAY' | 'HOME';

export interface TokenState {
  id: number;           // 0, 1, 2, 3
  playerId: string;     // Unique player id
  playerIndex: number;  // 0..3 (or up to 8 in radial)
  stepCount: number;    // -1 = YARD, 0..50 = TRACK, 51..55 = RUNWAY, 56 = HOME
  commonIndex: number;  // 0..51 when on common track, -1 otherwise
  status: TokenStatus;
}

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  playerIndex: number;
  tokens: TokenState[];
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  isBot?: boolean;
  hasFinished: boolean;
  finishRank?: number; // 1 = 1st, 2 = 2nd, etc.
}

export interface CaptureTransaction {
  captureId: string;       // Unique UUID v4
  matchId: string;
  timestamp: number;
  capturingPlayerId: string;
  capturingPlayerIndex: number;
  capturedPlayerId: string;
  capturedPlayerIndex: number;
  capturedTokenId: number;
  boardCell: number;       // Common track index where capture occurred
}

export interface HunterRankingEntry {
  playerId: string;
  playerName: string;
  playerColor: PlayerColor;
  totalCaptures: number;
  timesCaptured: number;
  breakdown: Record<string, number>; // victimPlayerId -> count
}

export interface MatchAwards {
  champion?: {
    playerId: string;
    playerName: string;
    playerColor: PlayerColor;
  };
  hunter?: {
    playerId: string;
    playerName: string;
    playerColor: PlayerColor;
    totalCaptures: number;
  };
  mostTargeted?: {
    playerId: string;
    playerName: string;
    playerColor: PlayerColor;
    timesCaptured: number;
  };
  survivor?: {
    playerId: string;
    playerName: string;
    playerColor: PlayerColor;
    timesCaptured: number;
  };
}

export type TurnPhase = 
  | 'WAITING_FOR_ROLL' 
  | 'WAITING_FOR_MOVE' 
  | 'ANIMATING_MOVE' 
  | 'GAME_OVER';

export interface EarlyEndVoteState {
  active: boolean;
  proposedBy: string;
  proposedByName: string;
  expiresAt: number;     // Epoch timestamp in ms
  votes: Record<string, 'ACCEPT' | 'REJECT'>; // playerId -> vote
}

export interface GameState {
  roomId: string;
  mode: GameMode;
  rulePreset?: GameRulePreset;
  targetPlayerCount?: number; // 2..9 players
  tokensPerPlayer: number; // 4 for Classic / Traditional, 2 for Rapid
  status: 'LOBBY' | 'IN_GAME' | 'EARLY_ENDED' | 'COMPLETED';
  players: PlayerState[];
  activePlayerIndex: number;
  currentTurnDice: number | null;
  consecutiveSixes: number;
  turnPhase: TurnPhase;
  legalMoveTokenIds: number[];
  captureLedger: CaptureTransaction[];
  earlyEndVote: EarlyEndVoteState | null;
  turnDeadline: number | null; // Timestamp ms when turn expires
  matchStartTime: number | null;
  matchEndTime: number | null;
  winnerPlayerId: string | null;
  version: number; // Incrementing state version for idempotent sync
}

export interface MoveIntent {
  roomId: string;
  playerId: string;
  tokenId: number;
}

export interface MoveValidationResult {
  isValid: boolean;
  reason?: string;
  token?: TokenState;
  targetStepCount?: number;
  targetCommonIndex?: number;
  capturedTokens?: TokenState[];
  grantsBonusTurn?: boolean;
  reachedHome?: boolean;
}
