import {
  GameState,
  PlayerState,
  TokenState,
  PlayerColor,
  TRADITIONAL_BOARD,
  TRADITIONAL_COLORS,
  CaptureTransaction,
} from '@ludoverse/shared';

const LOCAL_STORAGE_KEY = 'ludoverse_pass_and_play_state';
const LOCAL_HISTORY_KEY = 'ludoverse_pass_and_play_history';

export interface LocalMatchRecord {
  id: string;
  date: number;
  players: { name: string; color: PlayerColor; kills: number; hasFinished: boolean; rank?: number }[];
  winnerName: string;
  totalTurns: number;
}

export class LocalLudoEngine {
  public static createGame(playerConfigs: { name: string; color: PlayerColor }[]): GameState {
    const players: PlayerState[] = playerConfigs.map((cfg, index) => {
      const tokens: TokenState[] = Array.from({ length: 4 }, (_, tokenId) => ({
        id: tokenId,
        playerId: `local-player-${index}`,
        playerIndex: index,
        stepCount: -1,
        commonIndex: -1,
        status: 'YARD',
      }));

      return {
        id: `local-player-${index}`,
        name: cfg.name || `Player ${index + 1}`,
        color: cfg.color,
        playerIndex: index,
        tokens,
        isReady: true,
        isHost: index === 0,
        isConnected: true,
        hasFinished: false,
      };
    });

    const now = Date.now();
    return {
      roomId: 'local-pass-and-play',
      mode: 'TRADITIONAL_4P',
      rulePreset: 'CLASSIC',
      tokensPerPlayer: 4,
      status: 'IN_GAME',
      players,
      activePlayerIndex: 0,
      currentTurnDice: null,
      consecutiveSixes: 0,
      turnPhase: 'WAITING_FOR_ROLL',
      legalMoveTokenIds: [],
      captureLedger: [],
      earlyEndVote: null,
      turnDeadline: now + 60000,
      matchStartTime: now,
      matchEndTime: null,
      winnerPlayerId: null,
      version: 1,
    };
  }

  public static rollDice(state: GameState, forcedDice?: number) {
    if (state.status !== 'IN_GAME' || state.turnPhase !== 'WAITING_FOR_ROLL') {
      return null;
    }

    const activePlayer = state.players[state.activePlayerIndex];
    const dice = forcedDice ?? Math.floor(Math.random() * 6) + 1;
    state.version += 1;

    // Consecutive sixes check
    if (dice === 6) {
      state.consecutiveSixes += 1;
      if (state.consecutiveSixes >= TRADITIONAL_BOARD.MAX_CONSECUTIVE_SIXES) {
        state.consecutiveSixes = 0;
        state.currentTurnDice = null;
        state.legalMoveTokenIds = [];
        this.advanceTurn(state);
        this.saveGame(state);
        return { dice, legalMoveTokenIds: [], passed: true, reason: 'THREE_CONSECUTIVE_SIXES' };
      }
    } else {
      state.consecutiveSixes = 0;
    }

    // Compute legal moves
    const legalMoveTokenIds: number[] = [];
    for (const t of activePlayer.tokens) {
      if (t.status === 'HOME') continue;
      if (t.status === 'YARD') {
        if (dice === 6) legalMoveTokenIds.push(t.id);
        continue;
      }
      if (t.stepCount + dice <= TRADITIONAL_BOARD.STEPS_TO_HOME) {
        legalMoveTokenIds.push(t.id);
      }
    }

    if (legalMoveTokenIds.length === 0) {
      state.currentTurnDice = null;
      state.legalMoveTokenIds = [];
      this.advanceTurn(state);
      this.saveGame(state);
      return { dice, legalMoveTokenIds: [], passed: true, reason: 'NO_LEGAL_MOVES' };
    }

    state.currentTurnDice = dice;
    state.legalMoveTokenIds = legalMoveTokenIds;
    state.turnPhase = 'WAITING_FOR_MOVE';
    this.saveGame(state);
    return { dice, legalMoveTokenIds, passed: false };
  }

  public static moveToken(state: GameState, tokenId: number) {
    if (state.turnPhase !== 'WAITING_FOR_MOVE' || !state.legalMoveTokenIds.includes(tokenId)) {
      return null;
    }

    const activePlayer = state.players[state.activePlayerIndex];
    const token = activePlayer.tokens.find((t) => t.id === tokenId);
    const dice = state.currentTurnDice;
    if (!token || dice === null) return null;

    state.version += 1;
    const startOffsets = TRADITIONAL_BOARD.START_OFFSETS as unknown as number[];
    const safeCells = TRADITIONAL_BOARD.SAFE_CELLS as unknown as number[];

    let targetStepCount: number;
    let targetCommonIndex: number;
    let targetStatus: TokenState['status'];
    let reachedHome = false;
    let hasCapture = false;

    if (token.status === 'YARD') {
      targetStepCount = 0;
      targetCommonIndex = startOffsets[activePlayer.playerIndex];
      targetStatus = 'TRACK';
    } else {
      targetStepCount = token.stepCount + dice;
      if (targetStepCount <= 51) {
        targetStatus = 'TRACK';
        targetCommonIndex = (startOffsets[activePlayer.playerIndex] + targetStepCount) % 52;
      } else if (targetStepCount < 56) {
        targetStatus = 'RUNWAY';
        targetCommonIndex = -1;
      } else if (targetStepCount === 56) {
        targetStatus = 'HOME';
        targetCommonIndex = -1;
        reachedHome = true;
      } else {
        return null;
      }
    }

    // Capture detection
    if (targetStatus === 'TRACK' && !safeCells.includes(targetCommonIndex)) {
      for (const otherPlayer of state.players) {
        if (otherPlayer.id === activePlayer.id) continue;
        for (const otherToken of otherPlayer.tokens) {
          if (otherToken.status === 'TRACK' && otherToken.commonIndex === targetCommonIndex) {
            otherToken.status = 'YARD';
            otherToken.stepCount = -1;
            otherToken.commonIndex = -1;
            hasCapture = true;

            const tx: CaptureTransaction = {
              captureId: `${Date.now()}-${Math.random()}`,
              matchId: state.roomId,
              timestamp: Date.now(),
              capturingPlayerId: activePlayer.id,
              capturingPlayerIndex: activePlayer.playerIndex,
              capturedPlayerId: otherPlayer.id,
              capturedPlayerIndex: otherPlayer.playerIndex,
              capturedTokenId: otherToken.id,
              boardCell: targetCommonIndex,
            };
            state.captureLedger.push(tx);
          }
        }
      }
    }

    token.stepCount = targetStepCount;
    token.commonIndex = targetCommonIndex;
    token.status = targetStatus;

    // Check completion
    const allHome = activePlayer.tokens.every((t) => t.status === 'HOME');
    if (allHome && !activePlayer.hasFinished) {
      activePlayer.hasFinished = true;
      const rank = state.players.filter((p) => p.hasFinished).length;
      activePlayer.finishRank = rank;
      if (!state.winnerPlayerId) state.winnerPlayerId = activePlayer.id;

      const unfinished = state.players.filter((p) => !p.hasFinished);
      if (unfinished.length <= 1) {
        state.status = 'COMPLETED';
        state.turnPhase = 'GAME_OVER';
        state.matchEndTime = Date.now();
        this.recordHistory(state);
        this.saveGame(state);
        return { state, finished: true, grantsBonusTurn: false };
      }
    }

    // Bonus turn logic (rolled 6, captured, or home)
    const grantsBonusTurn = !activePlayer.hasFinished && (dice === 6 || hasCapture || reachedHome);

    if (grantsBonusTurn) {
      state.turnPhase = 'WAITING_FOR_ROLL';
      state.currentTurnDice = null;
      state.legalMoveTokenIds = [];
      if (dice !== 6) state.consecutiveSixes = 0;
    } else {
      state.consecutiveSixes = 0;
      state.currentTurnDice = null;
      state.legalMoveTokenIds = [];
      this.advanceTurn(state);
    }

    this.saveGame(state);
    return { state, finished: false, grantsBonusTurn };
  }

  public static advanceTurn(state: GameState): void {
    let next = state.activePlayerIndex;
    for (let i = 1; i <= state.players.length; i++) {
      const cand = (state.activePlayerIndex + i) % state.players.length;
      if (!state.players[cand].hasFinished) {
        next = cand;
        break;
      }
    }
    state.activePlayerIndex = next;
    state.turnPhase = 'WAITING_FOR_ROLL';
    state.currentTurnDice = null;
    state.consecutiveSixes = 0;
    state.legalMoveTokenIds = [];
  }

  public static saveGame(state: GameState): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota or private browsing
    }
  }

  public static loadGame(): GameState | null {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public static clearGame(): void {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  public static recordHistory(state: GameState): void {
    try {
      const winner = state.players.find((p) => p.id === state.winnerPlayerId)?.name || 'Winner';
      const record: LocalMatchRecord = {
        id: `match-${Date.now()}`,
        date: Date.now(),
        players: state.players.map((p) => ({
          name: p.name,
          color: p.color,
          kills: state.captureLedger.filter((c) => c.capturingPlayerId === p.id).length,
          hasFinished: p.hasFinished,
          rank: p.finishRank,
        })),
        winnerName: winner,
        totalTurns: state.version,
      };

      const existing: LocalMatchRecord[] = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');
      existing.unshift(record);
      localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(existing.slice(0, 20)));
    } catch {
      // ignore
    }
  }

  public static getHistory(): LocalMatchRecord[] {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');
    } catch {
      return [];
    }
  }
}
