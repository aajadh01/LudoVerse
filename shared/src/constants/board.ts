import { PlayerColor, PlayerVisualConfig } from '../types/game.js';

export const TRADITIONAL_BOARD = {
  TOTAL_TRACK_CELLS: 52,
  HOME_RUNWAY_LENGTH: 5,
  STEPS_TO_HOME: 56, // 0 = start square, 50 = last common track step, 51..55 = runway, 56 = center home
  MAX_CONSECUTIVE_SIXES: 3,
  TOKENS_PER_PLAYER: 4,

  // Start cell on common track (index 0..51) for each player index 0..3
  START_OFFSETS: [0, 13, 26, 39] as const,

  // Star safe squares on common track (offset +8 from each start)
  STAR_SAFE_CELLS: [8, 21, 34, 47] as const,

  // Combined safe cells on common track (4 spawn squares + 4 star squares)
  SAFE_CELLS: [0, 8, 13, 21, 26, 34, 39, 47] as const,

  DEFAULT_TURN_TIMEOUT_SECONDS: 15,
  EARLY_END_VOTE_TIMEOUT_SECONDS: 25,
};

export const PLAYER_CONFIGS: Record<PlayerColor, PlayerVisualConfig> = {
  red: {
    color: 'red',
    hex: '#E52521', // Ludo King Classic Red
    name: 'Red',
    glyph: '⬥',
  },
  green: {
    color: 'green',
    hex: '#00A651', // Ludo King Classic Green
    name: 'Green',
    glyph: '●',
  },
  yellow: {
    color: 'yellow',
    hex: '#FFC20E', // Ludo King Classic Yellow
    name: 'Yellow',
    glyph: '★',
  },
  blue: {
    color: 'blue',
    hex: '#0072CE', // Ludo King Classic Blue
    name: 'Blue',
    glyph: '▲',
  },
  purple: {
    color: 'purple',
    hex: '#8E24AA', // Ludo King Classic Purple
    name: 'Purple',
    glyph: '⬢',
  },
  orange: {
    color: 'orange',
    hex: '#FF6F00', // Ludo King Classic Orange
    name: 'Orange',
    glyph: '◼',
  },
  teal: {
    color: 'teal',
    hex: '#00897B', // Ludo King Classic Teal
    name: 'Teal',
    glyph: '✚',
  },
  pink: {
    color: 'pink',
    hex: '#D81B60', // Ludo King Classic Pink
    name: 'Pink',
    glyph: '◯',
  },
  lime: {
    color: 'lime',
    hex: '#7CB342', // Ludo King Classic Lime
    name: 'Lime',
    glyph: '♥',
  },
};

export const TRADITIONAL_COLORS: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];

export const ALL_PLAYER_COLORS: PlayerColor[] = [
  'red', 'green', 'yellow', 'blue', 'purple', 'orange', 'teal', 'pink', 'lime'
];

export const RADIAL_CONFIG = {
  CELLS_PER_SECTOR: 8,
  HOME_RUNWAY_LENGTH: 5,
  CLASSIC_TOKENS: 4,
  RAPID_TOKENS: 2,
};

export function getRadialBoardMetrics(playerCount: number) {
  const totalCells = playerCount * RADIAL_CONFIG.CELLS_PER_SECTOR;
  const startOffsets = Array.from({ length: playerCount }, (_, i) => i * RADIAL_CONFIG.CELLS_PER_SECTOR);
  const apexSafeCells = Array.from({ length: playerCount }, (_, i) => i * RADIAL_CONFIG.CELLS_PER_SECTOR + 4);
  const safeCells = [...startOffsets, ...apexSafeCells];
  const stepsToHome = totalCells + RADIAL_CONFIG.HOME_RUNWAY_LENGTH;

  return {
    playerCount,
    totalTrackCells: totalCells,
    homeRunwayLength: RADIAL_CONFIG.HOME_RUNWAY_LENGTH,
    stepsToHome,
    startOffsets,
    safeCells,
  };
}
