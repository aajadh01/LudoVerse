import { 
  GameState, 
  HunterRankingEntry, 
  MatchAwards, 
  PlayerState 
} from '@ludoverse/shared';

export class HunterTracker {
  /**
   * Computes the live Hunter leaderboard from the append-only capture ledger.
   * Deterministic and idempotent.
   */
  public static computeLeaderboard(state: GameState): HunterRankingEntry[] {
    const playerMap = new Map<string, PlayerState>();
    state.players.forEach(p => playerMap.set(p.id, p));

    const entriesMap = new Map<string, HunterRankingEntry>();

    // Initialize an entry for every player in the match
    for (const player of state.players) {
      entriesMap.set(player.id, {
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        totalCaptures: 0,
        timesCaptured: 0,
        breakdown: {},
      });
    }

    // Process all capture transactions from the ledger
    for (const tx of state.captureLedger) {
      const capturer = entriesMap.get(tx.capturingPlayerId);
      const victim = entriesMap.get(tx.capturedPlayerId);

      if (capturer) {
        capturer.totalCaptures += 1;
        capturer.breakdown[tx.capturedPlayerId] = (capturer.breakdown[tx.capturedPlayerId] || 0) + 1;
      }

      if (victim) {
        victim.timesCaptured += 1;
      }
    }

    // Sort descending by totalCaptures, tiebreaker fewest times captured
    return Array.from(entriesMap.values()).sort((a, b) => {
      if (b.totalCaptures !== a.totalCaptures) {
        return b.totalCaptures - a.totalCaptures;
      }
      return a.timesCaptured - b.timesCaptured;
    });
  }

  /**
   * Computes the final post-match awards based on game outcome and capture ledger.
   */
  public static computeAwards(state: GameState): MatchAwards {
    const leaderboard = this.computeLeaderboard(state);
    const awards: MatchAwards = {};

    // 1. Champion: Player who finished all tokens first (if match wasn't early-ended)
    if (state.status === 'COMPLETED' && state.winnerPlayerId) {
      const winner = state.players.find(p => p.id === state.winnerPlayerId);
      if (winner) {
        awards.champion = {
          playerId: winner.id,
          playerName: winner.name,
          playerColor: winner.color,
        };
      }
    }

    if (leaderboard.length === 0) {
      return awards;
    }

    // 2. Hunter: Most captures made
    const topHunter = leaderboard[0];
    if (topHunter && topHunter.totalCaptures > 0) {
      awards.hunter = {
        playerId: topHunter.playerId,
        playerName: topHunter.playerName,
        playerColor: topHunter.playerColor,
        totalCaptures: topHunter.totalCaptures,
      };
    }

    // 3. Most Targeted: Player captured the most times
    const sortedByVictim = [...leaderboard].sort((a, b) => b.timesCaptured - a.timesCaptured);
    const mostTargeted = sortedByVictim[0];
    if (mostTargeted && mostTargeted.timesCaptured > 0) {
      awards.mostTargeted = {
        playerId: mostTargeted.playerId,
        playerName: mostTargeted.playerName,
        playerColor: mostTargeted.playerColor,
        timesCaptured: mostTargeted.timesCaptured,
      };
    }

    // 4. Survivor: Player captured the fewest times
    const sortedByFewestCaptured = [...leaderboard].sort((a, b) => a.timesCaptured - b.timesCaptured);
    const survivor = sortedByFewestCaptured[0];
    if (survivor) {
      awards.survivor = {
        playerId: survivor.playerId,
        playerName: survivor.playerName,
        playerColor: survivor.playerColor,
        timesCaptured: survivor.timesCaptured,
      };
    }

    return awards;
  }
}
