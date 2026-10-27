import { randomUUID } from 'node:crypto';
import {
  GameState,
  GameMode,
  GameRulePreset,
  PlayerState,
  TokenState,
  MoveValidationResult,
  TRADITIONAL_BOARD,
  TRADITIONAL_COLORS,
  ALL_PLAYER_COLORS,
  getRadialBoardMetrics,
  CaptureTransaction
} from '@ludoverse/shared';

export interface RollDiceResult {
  state: GameState;
  dice: number;
  legalMoveTokenIds: number[];
  wasTurnPassed: boolean;
  reason?: 'THREE_CONSECUTIVE_SIXES' | 'NO_LEGAL_MOVES';
}

export interface MoveTokenResult {
  state: GameState;
  validation: MoveValidationResult;
}

export class LudoEngine {
  /**
   * Resolves track and home metrics for either Traditional 4P or Custom Radial 5-9P.
   */
  public static getBoardMetrics(state: GameState) {
    if (state.mode === 'CUSTOM_RADIAL') {
      return getRadialBoardMetrics(state.players.length);
    }
    return {
      playerCount: state.players.length,
      totalTrackCells: TRADITIONAL_BOARD.TOTAL_TRACK_CELLS,
      homeRunwayLength: TRADITIONAL_BOARD.HOME_RUNWAY_LENGTH,
      stepsToHome: TRADITIONAL_BOARD.STEPS_TO_HOME,
      startOffsets: TRADITIONAL_BOARD.START_OFFSETS as unknown as number[],
      safeCells: TRADITIONAL_BOARD.SAFE_CELLS as unknown as number[],
    };
  }

  /**
   * Initializes a new GameState for Traditional (2-4p) or Custom Radial (5-9p).
   * Rule preset: 'CLASSIC' (4 tokens, normal full Ludo) or 'RAPID' (2 tokens).
   */
  public static createInitialGameState(
    roomId: string,
    mode: GameMode = 'TRADITIONAL_4P',
    initialPlayers: { id: string; name: string; isHost?: boolean }[],
    turnTimeoutSeconds = TRADITIONAL_BOARD.DEFAULT_TURN_TIMEOUT_SECONDS,
    rulePreset: GameRulePreset = 'CLASSIC'
  ): GameState {
    const minPlayers = 2;
    const maxPlayers = mode === 'TRADITIONAL_4P' ? 4 : 9;
    if (initialPlayers.length < minPlayers || initialPlayers.length > maxPlayers) {
      throw new Error(`Mode ${mode} requires between ${minPlayers} and ${maxPlayers} players. Received: ${initialPlayers.length}`);
    }

    const tokensPerPlayer = (mode === 'CUSTOM_RADIAL' && rulePreset === 'RAPID') ? 2 : 4;
    const colorsPool = mode === 'TRADITIONAL_4P' ? TRADITIONAL_COLORS : ALL_PLAYER_COLORS;

    const players: PlayerState[] = initialPlayers.map((p, index) => {
      const color = colorsPool[index] || ALL_PLAYER_COLORS[index % ALL_PLAYER_COLORS.length];
      const tokens: TokenState[] = Array.from({ length: tokensPerPlayer }, (_, tokenId) => ({
        id: tokenId,
        playerId: p.id,
        playerIndex: index,
        stepCount: -1,       // -1 = YARD
        commonIndex: -1,     // Not on common track
        status: 'YARD',
      }));

      return {
        id: p.id,
        name: p.name,
        color,
        playerIndex: index,
        tokens,
        isReady: true,
        isHost: !!p.isHost,
        isConnected: true,
        hasFinished: false,
      };
    });

    const now = Date.now();

    return {
      roomId,
      mode,
      rulePreset,
      tokensPerPlayer,
      status: 'IN_GAME',
      players,
      activePlayerIndex: 0,
      currentTurnDice: null,
      consecutiveSixes: 0,
      turnPhase: 'WAITING_FOR_ROLL',
      legalMoveTokenIds: [],
      captureLedger: [],
      earlyEndVote: null,
      turnDeadline: now + turnTimeoutSeconds * 1000,
      matchStartTime: now,
      matchEndTime: null,
      winnerPlayerId: null,
      version: 1,
    };
  }

  /**
   * Rolls the dice for the active player.
   * Validates active player turn, handles three consecutive 6s rule, computes legal moves,
   * and auto-passes turn if no moves exist.
   */
  public static rollDice(
    state: GameState,
    playerId: string,
    forcedDice?: number
  ): RollDiceResult {
    if (state.status !== 'IN_GAME') {
      throw new Error('Game is not currently active');
    }

    if (state.turnPhase !== 'WAITING_FOR_ROLL') {
      throw new Error(`Invalid turn phase: expected WAITING_FOR_ROLL, received ${state.turnPhase}`);
    }

    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer.id !== playerId) {
      throw new Error(`Not player's turn. Active player is ${activePlayer.name} (${activePlayer.id})`);
    }

    // Roll dice: 1 to 6 (or forced for deterministic tests)
    const dice = forcedDice !== undefined ? forcedDice : Math.floor(Math.random() * 6) + 1;
    if (dice < 1 || dice > 6) {
      throw new Error(`Invalid dice value: ${dice}`);
    }

    state.version += 1;

    // Handle consecutive sixes
    if (dice === 6) {
      state.consecutiveSixes += 1;
      if (state.consecutiveSixes >= TRADITIONAL_BOARD.MAX_CONSECUTIVE_SIXES) {
        // Penalty: turn forfeited immediately!
        state.consecutiveSixes = 0;
        state.currentTurnDice = null;
        state.legalMoveTokenIds = [];
        this.advanceToNextTurn(state);
        return {
          state,
          dice,
          legalMoveTokenIds: [],
          wasTurnPassed: true,
          reason: 'THREE_CONSECUTIVE_SIXES',
        };
      }
    } else {
      state.consecutiveSixes = 0;
    }

    // Compute legal moves
    const metrics = this.getBoardMetrics(state);
    const legalMoveTokenIds = this.getLegalMoves(activePlayer, dice, metrics.stepsToHome);

    if (legalMoveTokenIds.length === 0) {
      // No legal moves: pass turn to next player
      state.currentTurnDice = null;
      state.legalMoveTokenIds = [];
      this.advanceToNextTurn(state);
      return {
        state,
        dice,
        legalMoveTokenIds: [],
        wasTurnPassed: true,
        reason: 'NO_LEGAL_MOVES',
      };
    }

    // Moves available: wait for player to select a token
    state.currentTurnDice = dice;
    state.legalMoveTokenIds = legalMoveTokenIds;
    state.turnPhase = 'WAITING_FOR_MOVE';
    state.turnDeadline = Date.now() + TRADITIONAL_BOARD.DEFAULT_TURN_TIMEOUT_SECONDS * 1000;

    return {
      state,
      dice,
      legalMoveTokenIds,
      wasTurnPassed: false,
    };
  }

  /**
   * Executes a move for the chosen token.
   */
  public static moveToken(
    state: GameState,
    playerId: string,
    tokenId: number
  ): MoveTokenResult {
    if (state.status !== 'IN_GAME') {
      throw new Error('Game is not currently active');
    }

    if (state.turnPhase !== 'WAITING_FOR_MOVE') {
      throw new Error(`Invalid turn phase: expected WAITING_FOR_MOVE, received ${state.turnPhase}`);
    }

    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer.id !== playerId) {
      throw new Error(`Not player's turn. Active player is ${activePlayer.name}`);
    }

    if (!state.legalMoveTokenIds.includes(tokenId)) {
      throw new Error(`Token ${tokenId} is not in legal moves: [${state.legalMoveTokenIds.join(', ')}]`);
    }

    const dice = state.currentTurnDice;
    if (dice === null) {
      throw new Error('Cannot move token: dice has not been rolled');
    }

    const token = activePlayer.tokens.find(t => t.id === tokenId);
    if (!token) {
      throw new Error(`Token ${tokenId} not found for player ${activePlayer.name}`);
    }

    state.version += 1;
    const metrics = this.getBoardMetrics(state);

    let targetStepCount: number;
    let targetCommonIndex: number;
    let targetStatus: TokenState['status'];
    const capturedTokens: TokenState[] = [];
    let reachedHome = false;

    if (token.status === 'YARD') {
      // Yard exit (dice === 6)
      targetStepCount = 0;
      targetCommonIndex = metrics.startOffsets[activePlayer.playerIndex];
      targetStatus = 'TRACK';
    } else {
      targetStepCount = token.stepCount + dice;
      const maxTrackStep = metrics.totalTrackCells - 1;

      if (targetStepCount <= maxTrackStep) {
        targetStatus = 'TRACK';
        targetCommonIndex = (metrics.startOffsets[activePlayer.playerIndex] + targetStepCount) % metrics.totalTrackCells;
      } else if (targetStepCount < metrics.stepsToHome) {
        targetStatus = 'RUNWAY';
        targetCommonIndex = -1;
      } else if (targetStepCount === metrics.stepsToHome) {
        targetStatus = 'HOME';
        targetCommonIndex = -1;
        reachedHome = true;
      } else {
        throw new Error(`Illegal move: step count ${targetStepCount} exceeds home`);
      }
    }

    // Collision & Capture detection (only on common track outside safe cells)
    let hasCapture = false;
    if (targetStatus === 'TRACK') {
      const isSafeCell = metrics.safeCells.includes(targetCommonIndex);
      if (!isSafeCell) {
        // Check for opponent tokens
        for (const otherPlayer of state.players) {
          if (otherPlayer.id === activePlayer.id) continue;

          for (const otherToken of otherPlayer.tokens) {
            if (otherToken.status === 'TRACK' && otherToken.commonIndex === targetCommonIndex) {
              // Capture opponent token! Send to yard
              otherToken.status = 'YARD';
              otherToken.stepCount = -1;
              otherToken.commonIndex = -1;
              capturedTokens.push({ ...otherToken });
              hasCapture = true;

              // Record capture in ledger
              const captureTx: CaptureTransaction = {
                captureId: randomUUID(),
                matchId: state.roomId,
                timestamp: Date.now(),
                capturingPlayerId: activePlayer.id,
                capturingPlayerIndex: activePlayer.playerIndex,
                capturedPlayerId: otherPlayer.id,
                capturedPlayerIndex: otherPlayer.playerIndex,
                capturedTokenId: otherToken.id,
                boardCell: targetCommonIndex,
              };
              state.captureLedger.push(captureTx);
            }
          }
        }
      }
    }

    // Apply movement to token
    token.stepCount = targetStepCount;
    token.commonIndex = targetCommonIndex;
    token.status = targetStatus;

    // Check if player has finished all tokens
    const allTokensHome = activePlayer.tokens.every(t => t.status === 'HOME');
    if (allTokensHome && !activePlayer.hasFinished) {
      activePlayer.hasFinished = true;
      const finishedCount = state.players.filter(p => p.hasFinished).length;
      activePlayer.finishRank = finishedCount;

      if (state.winnerPlayerId === null) {
        state.winnerPlayerId = activePlayer.id;
      }

      // Check match completion: if 2-player or all but 1 player finished
      const unfinishedPlayers = state.players.filter(p => !p.hasFinished);
      if (unfinishedPlayers.length <= 1) {
        state.status = 'COMPLETED';
        state.turnPhase = 'GAME_OVER';
        state.matchEndTime = Date.now();
        return {
          state,
          validation: {
            isValid: true,
            token,
            targetStepCount,
            targetCommonIndex,
            capturedTokens,
            grantsBonusTurn: false,
            reachedHome,
          },
        };
      }
    }

    // Bonus turn evaluation:
    // Awarded if:
    // 1. Rolled a 6 (and not finished), OR
    // 2. Captured at least one opponent token, OR
    // 3. Moved a token into HOME
    const grantsBonusTurn = (!activePlayer.hasFinished) && (dice === 6 || hasCapture || reachedHome);

    if (grantsBonusTurn) {
      // Player retains turn for another roll
      state.turnPhase = 'WAITING_FOR_ROLL';
      state.currentTurnDice = null;
      state.legalMoveTokenIds = [];
      state.turnDeadline = Date.now() + TRADITIONAL_BOARD.DEFAULT_TURN_TIMEOUT_SECONDS * 1000;
      // If bonus was earned from capture or home, reset consecutiveSixes so bonus 6s don't prematurely trigger 3-sixes penalty
      if (dice !== 6) {
        state.consecutiveSixes = 0;
      }
    } else {
      // Pass turn to next active player
      state.consecutiveSixes = 0;
      state.currentTurnDice = null;
      state.legalMoveTokenIds = [];
      this.advanceToNextTurn(state);
    }

    return {
      state,
      validation: {
        isValid: true,
        token,
        targetStepCount,
        targetCommonIndex,
        capturedTokens,
        grantsBonusTurn,
        reachedHome,
      },
    };
  }

  /**
   * Advances the turn to the next player who has not yet finished.
   */
  public static advanceToNextTurn(state: GameState): void {
    if (state.status !== 'IN_GAME') return;

    const unfinishedPlayers = state.players.filter(p => !p.hasFinished && p.isConnected);
    if (unfinishedPlayers.length <= 1 && state.players.some(p => p.hasFinished)) {
      state.status = 'COMPLETED';
      state.turnPhase = 'GAME_OVER';
      state.matchEndTime = Date.now();
      return;
    }

    let nextIndex = state.activePlayerIndex;
    let found = false;

    for (let i = 1; i <= state.players.length; i++) {
      const candidateIndex = (state.activePlayerIndex + i) % state.players.length;
      const candidatePlayer = state.players[candidateIndex];

      if (!candidatePlayer.hasFinished && candidatePlayer.isConnected) {
        nextIndex = candidateIndex;
        found = true;
        break;
      }
    }

    if (!found) {
      // No active unfinished players remain
      state.status = 'COMPLETED';
      state.turnPhase = 'GAME_OVER';
      state.matchEndTime = Date.now();
      return;
    }

    state.activePlayerIndex = nextIndex;
    state.turnPhase = 'WAITING_FOR_ROLL';
    state.currentTurnDice = null;
    state.consecutiveSixes = 0;
    state.legalMoveTokenIds = [];
    state.turnDeadline = Date.now() + TRADITIONAL_BOARD.DEFAULT_TURN_TIMEOUT_SECONDS * 1000;
  }

  /**
   * Identifies all tokens of the player that can legally move with the rolled dice value.
   */
  public static getLegalMoves(
    player: PlayerState,
    dice: number,
    stepsToHome: number = TRADITIONAL_BOARD.STEPS_TO_HOME
  ): number[] {
    const legalTokenIds: number[] = [];

    for (const token of player.tokens) {
      if (token.status === 'HOME') {
        continue;
      }

      if (token.status === 'YARD') {
        if (dice === 6) {
          legalTokenIds.push(token.id);
        }
        continue;
      }

      // Track or Runway
      const targetStepCount = token.stepCount + dice;
      if (targetStepCount <= stepsToHome) {
        legalTokenIds.push(token.id);
      }
    }

    return legalTokenIds;
  }
}
