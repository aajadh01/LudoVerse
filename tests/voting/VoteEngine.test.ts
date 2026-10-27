import { describe, it, expect, beforeEach } from 'vitest';
import { VoteEngine } from '../../server/src/engine/VoteEngine.js';
import { LudoEngine } from '../../server/src/engine/LudoEngine.js';
import { HunterTracker } from '../../server/src/engine/HunterTracker.js';
import { GameState } from '@ludoverse/shared';

describe('VoteEngine — Unanimous Early-End Voting', () => {
  let state: GameState;
  const players = [
    { id: 'p1', name: 'Aajadh' },
    { id: 'p2', name: 'Rahul' },
    { id: 'p3', name: 'Priya' },
  ];

  beforeEach(() => {
    state = LudoEngine.createInitialGameState('room-vote', 'TRADITIONAL_4P', players);
  });

  it('allows an active player to propose early end', () => {
    const proposal = VoteEngine.proposeEarlyEnd(state, 'p1', 25);
    expect(proposal.success).toBe(true);
    expect(state.earlyEndVote?.active).toBe(true);
    expect(state.earlyEndVote?.proposedBy).toBe('p1');
    expect(state.earlyEndVote?.votes['p1']).toBe('ACCEPT');
  });

  it('prevents starting a second vote while one is active', () => {
    VoteEngine.proposeEarlyEnd(state, 'p1', 25);
    const secondProposal = VoteEngine.proposeEarlyEnd(state, 'p2', 25);
    expect(secondProposal.success).toBe(false);
    expect(secondProposal.error).toContain('already in progress');
  });

  it('fails immediately if a single player votes REJECT', () => {
    VoteEngine.proposeEarlyEnd(state, 'p1', 25);

    // Player 2 rejects
    const voteResult = VoteEngine.castVote(state, 'p2', 'REJECT');
    expect(voteResult.success).toBe(true);
    expect(voteResult.resolution.isResolved).toBe(true);
    expect(voteResult.resolution.accepted).toBe(false);
    expect(voteResult.resolution.reason).toBe('REJECTED_BY_PLAYER');

    // Match remains IN_GAME
    expect(state.status).toBe('IN_GAME');
    expect(state.earlyEndVote?.active).toBe(false);
  });

  it('ends match early when all eligible players vote ACCEPT unanimously', () => {
    VoteEngine.proposeEarlyEnd(state, 'p1', 25);

    // Player 2 accepts
    const p2Vote = VoteEngine.castVote(state, 'p2', 'ACCEPT');
    expect(p2Vote.resolution.isResolved).toBe(false); // Still waiting for p3

    // Player 3 accepts
    const p3Vote = VoteEngine.castVote(state, 'p3', 'ACCEPT');
    expect(p3Vote.resolution.isResolved).toBe(true);
    expect(p3Vote.resolution.accepted).toBe(true);
    expect(p3Vote.resolution.reason).toBe('UNANIMOUS_ACCEPTANCE');

    // Match status transitioned to EARLY_ENDED
    expect(state.status).toBe('EARLY_ENDED');
    expect(state.matchEndTime).toBeDefined();

    // Champion award must NOT be awarded to an early-ended match
    const awards = HunterTracker.computeAwards(state);
    expect(awards.champion).toBeUndefined();
  });

  it('fails resolution if vote expires', () => {
    VoteEngine.proposeEarlyEnd(state, 'p1', 0); // Expires immediately

    // Simulate clock advancement
    state.earlyEndVote!.expiresAt = Date.now() - 1000;

    const resolution = VoteEngine.checkResolution(state);
    expect(resolution.isResolved).toBe(true);
    expect(resolution.accepted).toBe(false);
    expect(resolution.reason).toBe('VOTE_TIMED_OUT');
  });
});
