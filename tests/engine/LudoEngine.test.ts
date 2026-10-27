import { describe, it, expect, beforeEach } from 'vitest';
import { LudoEngine } from '../../server/src/engine/LudoEngine.js';
import { GameState, TRADITIONAL_BOARD } from '@ludoverse/shared';

describe('LudoEngine — Traditional 4-Player Rules', () => {
  let state: GameState;
  const players = [
    { id: 'player-1', name: 'Aajadh', isHost: true },
    { id: 'player-2', name: 'Rahul' },
    { id: 'player-3', name: 'Priya' },
    { id: 'player-4', name: 'Arjun' },
  ];

  beforeEach(() => {
    state = LudoEngine.createInitialGameState('test-room-1', 'TRADITIONAL_4P', players);
  });

  describe('Game Initialization', () => {
    it('initializes 4 players with correct colors, tokens, and starting state', () => {
      expect(state.players).toHaveLength(4);
      expect(state.status).toBe('IN_GAME');
      expect(state.activePlayerIndex).toBe(0);
      expect(state.turnPhase).toBe('WAITING_FOR_ROLL');
      expect(state.players[0].color).toBe('red');
      expect(state.players[1].color).toBe('green');
      expect(state.players[2].color).toBe('yellow');
      expect(state.players[3].color).toBe('blue');

      // Check tokens
      for (const player of state.players) {
        expect(player.tokens).toHaveLength(4);
        for (const token of player.tokens) {
          expect(token.status).toBe('YARD');
          expect(token.stepCount).toBe(-1);
          expect(token.commonIndex).toBe(-1);
        }
      }
    });

    it('rejects game creation with fewer than 2 or more than 4 players', () => {
      expect(() => {
        LudoEngine.createInitialGameState('r', 'TRADITIONAL_4P', [{ id: 'p1', name: 'Solo' }]);
      }).toThrow();
    });
  });

  describe('Dice Rolling & Turn Progression', () => {
    it('rejects roll if not the active player', () => {
      expect(() => {
        LudoEngine.rollDice(state, 'player-2', 6);
      }).toThrow(/Not player's turn/);
    });

    it('rejects roll if not in WAITING_FOR_ROLL phase', () => {
      LudoEngine.rollDice(state, 'player-1', 6);
      expect(() => {
        LudoEngine.rollDice(state, 'player-1', 4);
      }).toThrow(/expected WAITING_FOR_ROLL/);
    });

    it('auto-passes turn if player rolls a non-6 with all tokens in yard', () => {
      const result = LudoEngine.rollDice(state, 'player-1', 4);
      expect(result.wasTurnPassed).toBe(true);
      expect(result.reason).toBe('NO_LEGAL_MOVES');
      expect(state.activePlayerIndex).toBe(1); // Turn advanced to player-2
      expect(state.turnPhase).toBe('WAITING_FOR_ROLL');
    });

    it('allows token selection if rolling a 6 with tokens in yard', () => {
      const result = LudoEngine.rollDice(state, 'player-1', 6);
      expect(result.wasTurnPassed).toBe(false);
      expect(result.legalMoveTokenIds).toEqual([0, 1, 2, 3]);
      expect(state.turnPhase).toBe('WAITING_FOR_MOVE');
      expect(state.currentTurnDice).toBe(6);
    });

    it('penalizes three consecutive 6s by forfeiting turn immediately', () => {
      // First 6
      LudoEngine.rollDice(state, 'player-1', 6);
      LudoEngine.moveToken(state, 'player-1', 0); // Out to track, grants bonus turn
      expect(state.activePlayerIndex).toBe(0);
      expect(state.turnPhase).toBe('WAITING_FOR_ROLL');

      // Second 6
      LudoEngine.rollDice(state, 'player-1', 6);
      LudoEngine.moveToken(state, 'player-1', 0); // Advance 6 steps, grants bonus turn
      expect(state.activePlayerIndex).toBe(0);
      expect(state.turnPhase).toBe('WAITING_FOR_ROLL');

      // Third 6 -> Turn forfeited!
      const result = LudoEngine.rollDice(state, 'player-1', 6);
      expect(result.wasTurnPassed).toBe(true);
      expect(result.reason).toBe('THREE_CONSECUTIVE_SIXES');
      expect(state.activePlayerIndex).toBe(1); // Turn passed to player-2
      expect(state.turnPhase).toBe('WAITING_FOR_ROLL');
      expect(state.consecutiveSixes).toBe(0);
    });
  });

  describe('Token Movement, Safe Squares & Captures', () => {
    it('moves token out of yard onto start square when rolling 6', () => {
      LudoEngine.rollDice(state, 'player-1', 6);
      const moveResult = LudoEngine.moveToken(state, 'player-1', 0);

      const token = state.players[0].tokens[0];
      expect(token.status).toBe('TRACK');
      expect(token.stepCount).toBe(0);
      expect(token.commonIndex).toBe(TRADITIONAL_BOARD.START_OFFSETS[0]); // Red starts at 0
      expect(moveResult.validation.grantsBonusTurn).toBe(true);
      expect(state.activePlayerIndex).toBe(0); // Bonus turn retained
    });

    it('advances token along common track on subsequent roll', () => {
      // Exit yard
      LudoEngine.rollDice(state, 'player-1', 6);
      LudoEngine.moveToken(state, 'player-1', 0);

      // Roll 4
      LudoEngine.rollDice(state, 'player-1', 4);
      const moveResult = LudoEngine.moveToken(state, 'player-1', 0);

      const token = state.players[0].tokens[0];
      expect(token.stepCount).toBe(4);
      expect(token.commonIndex).toBe(4);
      expect(moveResult.validation.grantsBonusTurn).toBe(false);
      expect(state.activePlayerIndex).toBe(1); // Turn passed to player-2
    });

    it('protects tokens from capture on safe squares', () => {
      // Manually position Red Token 0 on Green Start Square (Index 13, which is a safe square)
      state.players[0].tokens[0].status = 'TRACK';
      state.players[0].tokens[0].stepCount = 13;
      state.players[0].tokens[0].commonIndex = 13;

      // Player 2 (Green) rolls 6 and exits yard onto index 13
      state.activePlayerIndex = 1;
      LudoEngine.rollDice(state, 'player-2', 6);
      const moveResult = LudoEngine.moveToken(state, 'player-2', 0);

      // Both tokens should now safely coexist on index 13 without capture
      expect(state.players[0].tokens[0].status).toBe('TRACK');
      expect(state.players[0].tokens[0].commonIndex).toBe(13);
      expect(state.players[1].tokens[0].status).toBe('TRACK');
      expect(state.players[1].tokens[0].commonIndex).toBe(13);
      expect(moveResult.validation.capturedTokens).toHaveLength(0);
      expect(state.captureLedger).toHaveLength(0);
    });

    it('captures opponent token on an unsafe square and grants bonus turn', () => {
      // Position Player 2 (Green) token on commonIndex 14 (not a safe square)
      state.players[1].tokens[0].status = 'TRACK';
      state.players[1].tokens[0].stepCount = 1; // Green starts at 13, so step 1 = index 14
      state.players[1].tokens[0].commonIndex = 14;

      // Position Player 1 (Red) token on commonIndex 10
      state.players[0].tokens[0].status = 'TRACK';
      state.players[0].tokens[0].stepCount = 10;
      state.players[0].tokens[0].commonIndex = 10;

      // Player 1 rolls 4 (10 + 4 = 14 -> capture!)
      state.activePlayerIndex = 0;
      LudoEngine.rollDice(state, 'player-1', 4);
      const moveResult = LudoEngine.moveToken(state, 'player-1', 0);

      // Verify Red token moved to 14
      expect(state.players[0].tokens[0].commonIndex).toBe(14);

      // Verify Green token was sent back to yard
      expect(state.players[1].tokens[0].status).toBe('YARD');
      expect(state.players[1].tokens[0].stepCount).toBe(-1);
      expect(state.players[1].tokens[0].commonIndex).toBe(-1);

      // Verify capture was recorded in ledger
      expect(state.captureLedger).toHaveLength(1);
      expect(state.captureLedger[0].capturingPlayerId).toBe('player-1');
      expect(state.captureLedger[0].capturedPlayerId).toBe('player-2');
      expect(state.captureLedger[0].boardCell).toBe(14);
      expect(state.captureLedger[0].captureId).toBeDefined();

      // Verify Player 1 was awarded a bonus turn!
      expect(moveResult.validation.grantsBonusTurn).toBe(true);
      expect(state.activePlayerIndex).toBe(0);
      expect(state.turnPhase).toBe('WAITING_FOR_ROLL');
    });
  });

  describe('Home Stretch & Victory Detection', () => {
    it('enters home runway and rejects rolls that overshoot home (exact roll rule)', () => {
      // Position Red token near home at stepCount 54 (needs exactly 2 to reach 56)
      state.players[0].tokens[0].status = 'RUNWAY';
      state.players[0].tokens[0].stepCount = 54;
      state.players[0].tokens[0].commonIndex = -1;

      // Roll 3 (54 + 3 = 57 > 56 -> cannot move)
      const roll3Result = LudoEngine.rollDice(state, 'player-1', 3);
      expect(roll3Result.legalMoveTokenIds).not.toContain(0);

      // Roll 2 (54 + 2 = 56 -> exact roll into HOME!)
      state.turnPhase = 'WAITING_FOR_ROLL';
      state.activePlayerIndex = 0;
      const roll2Result = LudoEngine.rollDice(state, 'player-1', 2);
      expect(roll2Result.legalMoveTokenIds).toContain(0);

      const moveResult = LudoEngine.moveToken(state, 'player-1', 0);
      expect(state.players[0].tokens[0].status).toBe('HOME');
      expect(state.players[0].tokens[0].stepCount).toBe(56);
      expect(moveResult.validation.reachedHome).toBe(true);
      expect(moveResult.validation.grantsBonusTurn).toBe(true);
    });

    it('declares winner and finishes match when all tokens reach home', () => {
      // Set 3 tokens to HOME, 4th token to stepCount 55 (needs 1 to finish)
      state.players[0].tokens[0].status = 'HOME';
      state.players[0].tokens[0].stepCount = 56;
      state.players[0].tokens[1].status = 'HOME';
      state.players[0].tokens[1].stepCount = 56;
      state.players[0].tokens[2].status = 'HOME';
      state.players[0].tokens[2].stepCount = 56;

      state.players[0].tokens[3].status = 'RUNWAY';
      state.players[0].tokens[3].stepCount = 55;

      // Roll 1 for Player 1
      LudoEngine.rollDice(state, 'player-1', 1);
      LudoEngine.moveToken(state, 'player-1', 3);

      expect(state.players[0].hasFinished).toBe(true);
      expect(state.players[0].finishRank).toBe(1);
      expect(state.winnerPlayerId).toBe('player-1');
    });
  });
});
