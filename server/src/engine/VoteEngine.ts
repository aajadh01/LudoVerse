import { GameState, EarlyEndVoteState } from '@ludoverse/shared';

export interface VoteResolution {
  isResolved: boolean;
  accepted: boolean;
  reason: string;
}

export class VoteEngine {
  /**
   * Proposes early end to the match.
   * Returns true if successfully started, or false if not eligible.
   */
  public static proposeEarlyEnd(
    state: GameState,
    proposerId: string,
    timeoutSeconds = 25
  ): { success: boolean; error?: string } {
    if (state.status !== 'IN_GAME') {
      return { success: false, error: 'Match is not in progress' };
    }

    if (state.earlyEndVote && state.earlyEndVote.active) {
      return { success: false, error: 'A vote is already in progress' };
    }

    const proposer = state.players.find(p => p.id === proposerId);
    if (!proposer || !proposer.isConnected) {
      return { success: false, error: 'Proposer is not an active player in this room' };
    }

    const eligiblePlayers = state.players.filter(p => p.isConnected && !p.isBot);
    if (eligiblePlayers.length < 2) {
      return { success: false, error: 'At least two players are required to vote' };
    }

    const voteState: EarlyEndVoteState = {
      active: true,
      proposedBy: proposerId,
      proposedByName: proposer.name,
      expiresAt: Date.now() + timeoutSeconds * 1000,
      votes: {
        [proposerId]: 'ACCEPT', // Proposer automatically votes accept
      },
    };

    state.earlyEndVote = voteState;
    state.version += 1;
    return { success: true };
  }

  /**
   * Casts a player's vote.
   */
  public static castVote(
    state: GameState,
    voterId: string,
    vote: 'ACCEPT' | 'REJECT'
  ): { success: boolean; resolution: VoteResolution; error?: string } {
    if (!state.earlyEndVote || !state.earlyEndVote.active) {
      return {
        success: false,
        resolution: { isResolved: false, accepted: false, reason: 'NO_ACTIVE_VOTE' },
        error: 'No active vote to respond to',
      };
    }

    // Check expiration
    if (Date.now() > state.earlyEndVote.expiresAt) {
      state.earlyEndVote.active = false;
      return {
        success: false,
        resolution: { isResolved: true, accepted: false, reason: 'VOTE_EXPIRED' },
        error: 'Vote has expired',
      };
    }

    const voter = state.players.find(p => p.id === voterId);
    if (!voter || !voter.isConnected) {
      return {
        success: false,
        resolution: { isResolved: false, accepted: false, reason: 'INVALID_VOTER' },
        error: 'Player is not eligible to vote',
      };
    }

    state.earlyEndVote.votes[voterId] = vote;
    state.version += 1;

    // Evaluate current state
    const resolution = this.checkResolution(state);
    if (resolution.isResolved) {
      state.earlyEndVote.active = false;
      if (resolution.accepted) {
        state.status = 'EARLY_ENDED';
        state.matchEndTime = Date.now();
      }
    }

    return { success: true, resolution };
  }

  /**
   * Checks whether the vote has resolved (unanimously accepted, rejected by anyone, or expired).
   */
  public static checkResolution(state: GameState): VoteResolution {
    if (!state.earlyEndVote || !state.earlyEndVote.active) {
      return { isResolved: false, accepted: false, reason: 'NO_ACTIVE_VOTE' };
    }

    // 1. Expiration check
    if (Date.now() > state.earlyEndVote.expiresAt) {
      return { isResolved: true, accepted: false, reason: 'VOTE_TIMED_OUT' };
    }

    const eligiblePlayers = state.players.filter(p => p.isConnected && !p.isBot);
    const votes = state.earlyEndVote.votes;

    // 2. Immediate rejection: If even one eligible player rejects, early end fails
    for (const player of eligiblePlayers) {
      if (votes[player.id] === 'REJECT') {
        return { isResolved: true, accepted: false, reason: 'REJECTED_BY_PLAYER' };
      }
    }

    // 3. Unanimous acceptance: All eligible players must have voted ACCEPT
    const allAccepted = eligiblePlayers.every(p => votes[p.id] === 'ACCEPT');
    if (allAccepted) {
      return { isResolved: true, accepted: true, reason: 'UNANIMOUS_ACCEPTANCE' };
    }

    // Still pending votes
    return { isResolved: false, accepted: false, reason: 'PENDING_VOTES' };
  }
}
