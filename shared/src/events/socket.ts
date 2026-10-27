import { 
  GameState, 
  GameMode, 
  GameRulePreset,
  CaptureTransaction, 
  HunterRankingEntry, 
  MatchAwards, 
  PlayerColor 
} from '../types/game.js';

export interface RoomCreatePayload {
  playerName: string;
  mode: GameMode;
  rulePreset?: GameRulePreset;
  targetPlayerCount?: number;
  turnTimeoutSeconds?: number;
}

export interface RoomJoinPayload {
  roomId: string;
  playerName: string;
  sessionToken?: string;
}

export interface RoomPlayerReadyPayload {
  roomId: string;
  isReady: boolean;
}

export interface RoomUpdateSettingsPayload {
  roomId: string;
  turnTimeoutSeconds?: number;
  mode?: GameMode;
  rulePreset?: GameRulePreset;
  targetPlayerCount?: number;
}

export interface RollDicePayload {
  roomId: string;
}

export interface MoveTokenPayload {
  roomId: string;
  tokenId: number;
}

export interface ProposeEarlyEndPayload {
  roomId: string;
}

export interface CastEarlyEndVotePayload {
  roomId: string;
  vote: 'ACCEPT' | 'REJECT';
}

export interface SendChatPayload {
  roomId: string;
  text: string;
}

export interface SendReactionPayload {
  roomId: string;
  emoji: string;
}

// Media signaling payload for WebRTC
export interface WebRTCSignalPayload {
  roomId: string;
  targetPlayerId?: string;
  signal: any;
}

// Server to Client Events & Payloads
export interface ServerToClientEvents {
  'room:joined': (data: { roomId: string; playerId: string; sessionToken: string; gameState: GameState }) => void;
  'room:state_update': (gameState: GameState) => void;
  'room:player_joined': (data: { playerId: string; playerName: string; playerColor: PlayerColor }) => void;
  'room:player_left': (data: { playerId: string; playerName: string }) => void;
  'room:error': (data: { message: string; code?: string }) => void;

  'game:started': (gameState: GameState) => void;
  'game:dice_rolled': (data: { playerId: string; dice: number; legalMoveTokenIds: number[] }) => void;
  'game:token_moved': (data: { 
    playerId: string; 
    tokenId: number; 
    fromStep: number; 
    toStep: number; 
    fromCommon: number; 
    toCommon: number;
    gameState: GameState;
  }) => void;
  'game:token_captured': (data: { 
    capture: CaptureTransaction; 
    hunterLeaderboard: HunterRankingEntry[];
    gameState: GameState;
  }) => void;
  'game:turn_passed': (data: { activePlayerIndex: number; playerId: string; reason?: string }) => void;
  'game:match_ended': (data: { 
    gameState: GameState; 
    awards: MatchAwards; 
    hunterLeaderboard: HunterRankingEntry[];
  }) => void;

  'vote:started': (data: { proposedBy: string; proposedByName: string; expiresAt: number }) => void;
  'vote:updated': (data: { votes: Record<string, 'ACCEPT' | 'REJECT'> }) => void;
  'vote:resolved': (data: { accepted: boolean; reason: string }) => void;

  'chat:message': (data: { playerId: string; playerName: string; text: string; timestamp: number }) => void;
  'chat:reaction': (data: { playerId: string; emoji: string; timestamp: number }) => void;

  'webrtc:signal': (data: { senderPlayerId: string; signal: any }) => void;
  'media:player_status': (data: { playerId: string; cameraEnabled: boolean; micEnabled: boolean }) => void;
}

export interface ClientToServerEvents {
  'room:create': (data: RoomCreatePayload, callback?: (res: { success: boolean; roomId?: string; error?: string }) => void) => void;
  'room:join': (data: RoomJoinPayload, callback?: (res: { success: boolean; error?: string }) => void) => void;
  'room:ready': (data: RoomPlayerReadyPayload) => void;
  'room:update_settings': (data: RoomUpdateSettingsPayload) => void;
  'room:start_game': (data: { roomId: string }) => void;
  'room:leave': (data: { roomId: string }) => void;

  'game:roll_dice': (data: RollDicePayload) => void;
  'game:move_token': (data: MoveTokenPayload) => void;

  'vote:propose': (data: ProposeEarlyEndPayload) => void;
  'vote:cast': (data: CastEarlyEndVotePayload) => void;

  'chat:send': (data: SendChatPayload) => void;
  'chat:react': (data: SendReactionPayload) => void;

  'webrtc:signal': (data: WebRTCSignalPayload) => void;
  'media:status': (data: { roomId: string; cameraEnabled: boolean; micEnabled: boolean }) => void;
}
