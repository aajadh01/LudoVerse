import { describe, it, expect } from 'vitest';
import { HunterTracker } from '../../server/src/engine/HunterTracker.js';
import { LudoEngine } from '../../server/src/engine/LudoEngine.js';
import { GameState, CaptureTransaction } from '@ludoverse/shared';

describe('HunterTracker — Live Leaderboard & Capture Matrix', () => {
  const players = [
    { id: 'p1', name: 'Aajadh' },
    { id: 'p2', name: 'Rahul' },
    { id: 'p3', name: 'Priya' },
    { id: 'p4', name: 'Arjun' },
  ];

  function createMockCapture(
    capturerId: string,
    victimId: string,
    cell = 12
  ): CaptureTransaction {
    return {
      captureId: `cap-${Math.random().toString(36).substring(2, 9)}`,
      matchId: 'room-1',
      timestamp: Date.now(),
      capturingPlayerId: capturerId,
      capturingPlayerIndex: players.findIndex(p => p.id === capturerId),
      capturedPlayerId: victimId,
      capturedPlayerIndex: players.findIndex(p => p.id === victimId),
      capturedTokenId: 0,
      boardCell: cell,
    };
  }

  it('calculates the exact capture breakdown from the user specification', () => {
    const state: GameState = LudoEngine.createInitialGameState('room-1', 'TRADITIONAL_4P', players);

    // Aajadh captures: 4 from Rahul, 2 from Priya, 2 from Arjun (Total: 8)
    for (let i = 0; i < 4; i++) state.captureLedger.push(createMockCapture('p1', 'p2'));
    for (let i = 0; i < 2; i++) state.captureLedger.push(createMockCapture('p1', 'p3'));
    for (let i = 0; i < 2; i++) state.captureLedger.push(createMockCapture('p1', 'p4'));

    // Rahul captures: 1 from Aajadh, 1 from Priya
    state.captureLedger.push(createMockCapture('p2', 'p1'));
    state.captureLedger.push(createMockCapture('p2', 'p3'));

    const leaderboard = HunterTracker.computeLeaderboard(state);

    // Rank 1: Aajadh with 8 captures
    expect(leaderboard[0].playerName).toBe('Aajadh');
    expect(leaderboard[0].totalCaptures).toBe(8);
    expect(leaderboard[0].breakdown['p2']).toBe(4); // 4 from Rahul
    expect(leaderboard[0].breakdown['p3']).toBe(2); // 2 from Priya
    expect(leaderboard[0].breakdown['p4']).toBe(2); // 2 from Arjun
    expect(leaderboard[0].timesCaptured).toBe(1);

    // Rank 2: Rahul with 2 captures
    expect(leaderboard[1].playerName).toBe('Rahul');
    expect(leaderboard[1].totalCaptures).toBe(2);
    expect(leaderboard[1].timesCaptured).toBe(4);

    // Verify times captured for Priya (2 from Aajadh + 1 from Rahul = 3)
    const priya = leaderboard.find(p => p.playerName === 'Priya');
    expect(priya?.timesCaptured).toBe(3);

    // Verify times captured for Arjun (2 from Aajadh = 2)
    const arjun = leaderboard.find(p => p.playerName === 'Arjun');
    expect(arjun?.timesCaptured).toBe(2);
  });

  it('awards Champion, Hunter, Most Targeted, and Survivor accurately', () => {
    const state: GameState = LudoEngine.createInitialGameState('room-1', 'TRADITIONAL_4P', players);

    // Set Aajadh as winner
    state.status = 'COMPLETED';
    state.winnerPlayerId = 'p1';

    // Mock captures:
    // Aajadh captures Rahul 5 times
    for (let i = 0; i < 5; i++) state.captureLedger.push(createMockCapture('p1', 'p2'));
    // Priya captures Rahul 2 times
    for (let i = 0; i < 2; i++) state.captureLedger.push(createMockCapture('p3', 'p2'));

    const awards = HunterTracker.computeAwards(state);

    // Champion
    expect(awards.champion?.playerName).toBe('Aajadh');

    // Hunter: Aajadh with 5 captures
    expect(awards.hunter?.playerName).toBe('Aajadh');
    expect(awards.hunter?.totalCaptures).toBe(5);

    // Most Targeted: Rahul (captured 7 times total)
    expect(awards.mostTargeted?.playerName).toBe('Rahul');
    expect(awards.mostTargeted?.timesCaptured).toBe(7);

    // Survivor: Arjun or Priya (Arjun was captured 0 times)
    expect(awards.survivor?.timesCaptured).toBe(0);
  });
});
