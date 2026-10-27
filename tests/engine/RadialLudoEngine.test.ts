import { describe, it, expect } from 'vitest';
import { LudoEngine } from '../../server/src/engine/LudoEngine.js';
import { GameState, getRadialBoardMetrics } from '@ludoverse/shared';

describe('LudoEngine — Custom Radial 5–9 Player Mode', () => {
  const sixPlayers = [
    { id: 'p1', name: 'Aajadh' },
    { id: 'p2', name: 'Rahul' },
    { id: 'p3', name: 'Priya' },
    { id: 'p4', name: 'Arjun' },
    { id: 'p5', name: 'Sneha' },
    { id: 'p6', name: 'Karan' },
  ];

  const eightPlayers = [
    ...sixPlayers,
    { id: 'p7', name: 'Ananya' },
    { id: 'p8', name: 'Rohan' },
  ];

  describe('Radial Geometry Math', () => {
    it('computes symmetrical metrics for 6-player board', () => {
      const m = getRadialBoardMetrics(6);
      expect(m.totalTrackCells).toBe(48); // 6 * 8
      expect(m.startOffsets).toEqual([0, 8, 16, 24, 32, 40]);
      expect(m.stepsToHome).toBe(53); // 48 + 5
      expect(m.safeCells).toContain(0);  // P1 spawn
      expect(m.safeCells).toContain(4);  // Apex safe
      expect(m.safeCells).toContain(8);  // P2 spawn
    });

    it('computes symmetrical metrics for 8-player board', () => {
      const m = getRadialBoardMetrics(8);
      expect(m.totalTrackCells).toBe(64); // 8 * 8
      expect(m.stepsToHome).toBe(69); // 64 + 5
      expect(m.startOffsets).toHaveLength(8);
    });
  });

  describe('Classic Mode (Normal Ludo Rules — 4 Tokens)', () => {
    it('initializes 6 players with 4 tokens each under Classic rules', () => {
      const state: GameState = LudoEngine.createInitialGameState(
        'radial-6p',
        'CUSTOM_RADIAL',
        sixPlayers,
        15,
        'CLASSIC' // Normal rules as requested by user!
      );

      expect(state.players).toHaveLength(6);
      expect(state.tokensPerPlayer).toBe(4);
      expect(state.rulePreset).toBe('CLASSIC');

      for (const p of state.players) {
        expect(p.tokens).toHaveLength(4);
        for (const t of p.tokens) {
          expect(t.status).toBe('YARD');
        }
      }
    });

    it('allows yard exit on 6 and moves token to player start spoke', () => {
      const state: GameState = LudoEngine.createInitialGameState(
        'radial-6p',
        'CUSTOM_RADIAL',
        sixPlayers,
        15,
        'CLASSIC'
      );

      // Player 1 rolls 6
      LudoEngine.rollDice(state, 'p1', 6);
      const res = LudoEngine.moveToken(state, 'p1', 0);

      expect(state.players[0].tokens[0].status).toBe('TRACK');
      expect(state.players[0].tokens[0].stepCount).toBe(0);
      expect(state.players[0].tokens[0].commonIndex).toBe(0); // P1 spawn = 0
      expect(res.validation.grantsBonusTurn).toBe(true);
    });

    it('captures opponent token on unsafe radial track cells', () => {
      const state: GameState = LudoEngine.createInitialGameState(
        'radial-6p',
        'CUSTOM_RADIAL',
        sixPlayers,
        15,
        'CLASSIC'
      );

      // Position Player 2 token on commonIndex 6 (unsafe cell between 0 and 8)
      state.players[1].tokens[0].status = 'TRACK';
      state.players[1].tokens[0].stepCount = 46; // wrapped around
      state.players[1].tokens[0].commonIndex = 6;

      // Position Player 1 token on commonIndex 2
      state.players[0].tokens[0].status = 'TRACK';
      state.players[0].tokens[0].stepCount = 2;
      state.players[0].tokens[0].commonIndex = 2;

      // Player 1 rolls 4 -> (2 + 4 = 6) -> Capture!
      state.activePlayerIndex = 0;
      LudoEngine.rollDice(state, 'p1', 4);
      const res = LudoEngine.moveToken(state, 'p1', 0);

      expect(state.players[0].tokens[0].commonIndex).toBe(6);
      expect(state.players[1].tokens[0].status).toBe('YARD'); // Sent to yard
      expect(state.captureLedger).toHaveLength(1);
      expect(res.validation.grantsBonusTurn).toBe(true);
    });
  });

  describe('Rapid Mode (Rapid Rules — 2 Tokens)', () => {
    it('initializes 8 players with 2 tokens each under Rapid rules', () => {
      const state: GameState = LudoEngine.createInitialGameState(
        'radial-8p-rapid',
        'CUSTOM_RADIAL',
        eightPlayers,
        15,
        'RAPID' // Fast paced mode
      );

      expect(state.players).toHaveLength(8);
      expect(state.tokensPerPlayer).toBe(2);
      expect(state.rulePreset).toBe('RAPID');

      for (const p of state.players) {
        expect(p.tokens).toHaveLength(2);
      }
    });

    it('wins match when both 2 tokens reach home in Rapid mode', () => {
      const state: GameState = LudoEngine.createInitialGameState(
        'radial-8p-rapid',
        'CUSTOM_RADIAL',
        eightPlayers,
        15,
        'RAPID'
      );

      const metrics = getRadialBoardMetrics(8); // stepsToHome = 69

      // Token 0 already home
      state.players[0].tokens[0].status = 'HOME';
      state.players[0].tokens[0].stepCount = metrics.stepsToHome;

      // Token 1 in runway, 1 step away
      state.players[0].tokens[1].status = 'RUNWAY';
      state.players[0].tokens[1].stepCount = metrics.stepsToHome - 1;

      // Player 1 rolls 1
      state.activePlayerIndex = 0;
      LudoEngine.rollDice(state, 'p1', 1);
      LudoEngine.moveToken(state, 'p1', 1);

      expect(state.players[0].hasFinished).toBe(true);
      expect(state.players[0].finishRank).toBe(1);
      expect(state.winnerPlayerId).toBe('p1');
    });
  });
});
