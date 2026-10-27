import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PlayerState, TokenState, TRADITIONAL_BOARD } from '@ludoverse/shared';
import { PLAYER_COLORS } from '@/lib/constants';
import { sounds } from '@/lib/sound';
import { cn } from '@/lib/utils';

// ── Board geometry constants ──────────────────────────────────────────────
const GRID = 15;          // 15x15 grid
const CELL = 40;          // pixels per cell
const SIZE = GRID * CELL; // 600px viewBox

// Full 52-cell common track as [col, row] pairs matching authentic Ludo board geometry
const COMMON_TRACK: [number, number][] = [
  // 0-4: Red start goes right
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  // 5-10: goes up
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  // 11-12: turns right across top
  [7, 0], [8, 0],
  // 13-17: Green start goes down
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  // 18-23: goes right
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  // 24-25: turns down across right
  [14, 7], [14, 8],
  // 26-30: Yellow start goes left
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  // 31-36: goes down
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  // 37-38: turns left across bottom
  [7, 14], [6, 14],
  // 39-43: Blue start goes up
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  // 44-49: goes left
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  // 50-51: turns up across left
  [0, 7], [0, 6]
];

const TRACK_52 = COMMON_TRACK.slice(0, 52);

// Player home runway cells (5 cells each, solid color leading to center)
const RUNWAY_CELLS: Record<number, [number, number][]> = {
  0: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],       // Red (Top-Left): row 7 going right
  1: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],       // Green (Top-Right): col 7 going down
  2: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],   // Yellow (Bottom-Right): row 7 going left
  3: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],   // Blue (Bottom-Left): col 7 going up
};

// Player yard token bases (4 circles in 2×2 arrangement)
const YARD_POSITIONS: Record<number, [number, number][]> = {
  0: [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]],      // Red: top-left
  1: [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]], // Green: top-right
  2: [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]], // Yellow: bottom-right
  3: [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],  // Blue: bottom-left
};

// Official Ludo King Colors
const YARD_COLORS: Record<number, string> = {
  0: '#E52521', // Red
  1: '#00A651', // Green
  2: '#FFC20E', // Yellow
  3: '#0072CE', // Blue
};

// Start offsets on the common track
const START_OFFSETS = [0, 13, 26, 39];

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

// Compute base board coordinate & unique cell identifier for any token step
function getTokenPixelCoords(
  playerIndex: number,
  tokenId: number,
  stepCount: number,
  status: TokenState['status']
): { x: number; y: number; cellKey: string } {
  if (status === 'YARD' || stepCount < 0) {
    const dock = YARD_POSITIONS[playerIndex]?.[tokenId] || [1.5, 1.5];
    return {
      x: dock[0] * CELL,
      y: dock[1] * CELL,
      cellKey: `yard-${playerIndex}-${tokenId}`,
    };
  }

  if (status === 'HOME' || stepCount >= 56) {
    const homeOffsets = [
      [-20, -6], // Red (Left triangle)
      [-6, -20], // Green (Top triangle)
      [10, -6],  // Yellow (Right triangle)
      [-6, 10],  // Blue (Bottom triangle)
    ];
    const off = homeOffsets[playerIndex] || [0, 0];
    return {
      x: 7.5 * CELL + off[0] + (tokenId % 2) * 8,
      y: 7.5 * CELL + off[1] + Math.floor(tokenId / 2) * 8,
      cellKey: `home-${playerIndex}-${tokenId}`,
    };
  }

  if (stepCount <= 50) {
    const startOffset = START_OFFSETS[playerIndex] ?? 0;
    const commonIndex = (startOffset + stepCount) % 52;
    const cell = TRACK_52[commonIndex];
    if (cell) {
      return {
        x: cell[0] * CELL + CELL / 2,
        y: cell[1] * CELL + CELL / 2,
        cellKey: `track-${commonIndex}`,
      };
    }
  }

  // Runway: steps 51 to 55
  const runwayIdx = Math.max(0, Math.min(4, stepCount - 51));
  const runwayCell = RUNWAY_CELLS[playerIndex]?.[runwayIdx];
  if (runwayCell) {
    return {
      x: runwayCell[0] * CELL + CELL / 2,
      y: runwayCell[1] * CELL + CELL / 2,
      cellKey: `runway-${playerIndex}-${runwayIdx}`,
    };
  }

  return { x: 0, y: 0, cellKey: 'unknown' };
}

// Minimizing & offset calculation when 2 or more tokens occupy the same cell
function getClusterOffsets(count: number, index: number): { offsetX: number; offsetY: number; scale: number } {
  if (count <= 1) {
    return { offsetX: 0, offsetY: 0, scale: 1.0 };
  }
  if (count === 2) {
    // 2 tokens: side-by-side diagonal placement inside cell
    const offsets = [
      { offsetX: -CELL * 0.2, offsetY: -CELL * 0.2 },
      { offsetX: CELL * 0.2, offsetY: CELL * 0.2 },
    ];
    return { ...offsets[index % 2], scale: 0.72 };
  }
  if (count === 3) {
    // 3 tokens: triangle arrangement inside cell
    const offsets = [
      { offsetX: 0, offsetY: -CELL * 0.22 },
      { offsetX: -CELL * 0.22, offsetY: CELL * 0.18 },
      { offsetX: CELL * 0.22, offsetY: CELL * 0.18 },
    ];
    return { ...offsets[index % 3], scale: 0.62 };
  }
  // 4+ tokens: compact 2x2 grid inside cell
  const offsets = [
    { offsetX: -CELL * 0.22, offsetY: -CELL * 0.22 },
    { offsetX: CELL * 0.22, offsetY: -CELL * 0.22 },
    { offsetX: -CELL * 0.22, offsetY: CELL * 0.22 },
    { offsetX: CELL * 0.22, offsetY: CELL * 0.22 },
  ];
  return { ...offsets[index % 4], scale: 0.54 };
}

interface KilledAnim {
  tokenKey: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  duration: number;
}

interface LudoBoardProps {
  players: PlayerState[];
  activePlayerIndex: number;
  legalMoveTokenIds: number[];
  onTokenClick?: (playerId: string, tokenId: number) => void;
  onRollDice?: () => void;
  turnPhase?: string;
  myPlayerId?: string;
  className?: string;
}

export function LudoBoard({
  players,
  activePlayerIndex,
  legalMoveTokenIds = [],
  onTokenClick,
  onRollDice,
  turnPhase,
  myPlayerId,
  className,
}: LudoBoardProps) {
  const isMyTurn = players[activePlayerIndex]?.id === myPlayerId;

  // Track animated display step for each token: key -> current animated step count
  const [displayedSteps, setDisplayedSteps] = useState<Record<string, number>>({});
  const [hoppingKeys, setHoppingKeys] = useState<Set<string>>(new Set());
  const [killedAnims, setKilledAnims] = useState<Map<string, KilledAnim>>(new Map());

  // Store active timer references to prevent overlap
  const hopTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const prevTokensRef = useRef<Map<string, { stepCount: number; status: TokenState['status']; coords: { x: number; y: number } }>>(new Map());

  // Handle token movement step-by-step & capture flights
  useEffect(() => {
    const prev = prevTokensRef.current;
    const now = performance.now();

    for (const player of players) {
      for (const token of player.tokens) {
        const key = `${player.id}-${token.id}`;
        const previous = prev.get(key);
        const curCoords = getTokenPixelCoords(player.playerIndex, token.id, token.stepCount, token.status);

        if (!previous) {
          // Initial mount
          prev.set(key, { stepCount: token.stepCount, status: token.status, coords: curCoords });
          continue;
        }

        // 1. Detection: Token was captured (killed) -> animate drag-back flight to yard!
        if (token.status === 'YARD' && previous.status !== 'YARD') {
          // Clear any active hop timers
          const existingTimer = hopTimersRef.current.get(key);
          if (existingTimer) {
            clearInterval(existingTimer);
            hopTimersRef.current.delete(key);
          }

          const yardCoords = getTokenPixelCoords(player.playerIndex, token.id, -1, 'YARD');
          sounds.playCapture();

          setKilledAnims((map) => {
            const next = new Map(map);
            next.set(key, {
              tokenKey: key,
              fromX: previous.coords.x,
              fromY: previous.coords.y,
              toX: yardCoords.x,
              toY: yardCoords.y,
              startTime: now,
              duration: 500,
            });
            return next;
          });

          // End flight after 500ms
          setTimeout(() => {
            setKilledAnims((map) => {
              const next = new Map(map);
              next.delete(key);
              return next;
            });
            setDisplayedSteps((s) => ({ ...s, [key]: -1 }));
          }, 500);
        }
        // 2. Detection: Token moved forward -> step-by-step hopping!
        else if (token.stepCount > previous.stepCount || (previous.status === 'YARD' && token.status !== 'YARD')) {
          // Clear any existing hop timer
          const existingTimer = hopTimersRef.current.get(key);
          if (existingTimer) {
            clearInterval(existingTimer);
            hopTimersRef.current.delete(key);
          }

          const fromStep = previous.status === 'YARD' ? -1 : previous.stepCount;
          const toStep = token.stepCount;

          let stepSequence: number[] = [];
          if (fromStep === -1) {
            stepSequence = [0]; // Exit yard directly onto spawn square
          } else {
            for (let s = fromStep + 1; s <= toStep; s++) {
              stepSequence.push(s);
            }
          }

          if (stepSequence.length > 0) {
            // First step hops immediately!
            setDisplayedSteps((s) => ({ ...s, [key]: stepSequence[0] }));
            setHoppingKeys((h) => new Set(h).add(key));
            sounds.playTokenMove();

            setTimeout(() => {
              setHoppingKeys((h) => {
                const next = new Set(h);
                next.delete(key);
                return next;
              });
            }, 190);

            // Subsequent steps hop every 230ms
            if (stepSequence.length > 1) {
              let idx = 1;
              const timer = setInterval(() => {
                if (idx < stepSequence.length) {
                  const targetS = stepSequence[idx];
                  setDisplayedSteps((s) => ({ ...s, [key]: targetS }));
                  setHoppingKeys((h) => new Set(h).add(key));
                  sounds.playTokenMove();

                  setTimeout(() => {
                    setHoppingKeys((h) => {
                      const next = new Set(h);
                      next.delete(key);
                      return next;
                    });
                  }, 190);

                  idx++;
                } else {
                  clearInterval(timer);
                  hopTimersRef.current.delete(key);
                }
              }, 230);

              hopTimersRef.current.set(key, timer);
            }
          }
        }

        prev.set(key, { stepCount: token.stepCount, status: token.status, coords: curCoords });
      }
    }
  }, [players]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      hopTimersRef.current.forEach((t) => clearInterval(t));
      hopTimersRef.current.clear();
    };
  }, []);

  // Killed token animation frame ticker (runs only while killed flights are active)
  const [, setKilledTick] = useState(0);
  useEffect(() => {
    if (killedAnims.size === 0) return;
    let animId: number;
    const tick = () => {
      setKilledTick((t) => t + 1);
      if (killedAnims.size > 0) {
        animId = requestAnimationFrame(tick);
      }
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [killedAnims.size]);

  // Compute multi-token occupancy map for track & runway cells to minimize and cluster tokens on the same block
  const cellOccupants = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const player of players) {
      for (const token of player.tokens) {
        const key = `${player.id}-${token.id}`;
        if (killedAnims.has(key)) continue;

        const effectiveStep = displayedSteps[key] !== undefined ? displayedSteps[key] : token.stepCount;
        const effectiveStatus = effectiveStep < 0 ? 'YARD' : effectiveStep >= 56 ? 'HOME' : effectiveStep >= 51 ? 'RUNWAY' : 'TRACK';

        if (effectiveStatus === 'TRACK' || effectiveStatus === 'RUNWAY') {
          const { cellKey } = getTokenPixelCoords(player.playerIndex, token.id, effectiveStep, effectiveStatus);
          const list = map.get(cellKey) || [];
          list.push(key);
          map.set(cellKey, list);
        }
      }
    }
    return map;
  }, [players, displayedSteps, killedAnims]);

  // Token click handler:
  // 1. If it's my turn and WAITING_FOR_ROLL: auto-roll the dice!
  // 2. If it's my turn and WAITING_FOR_MOVE: move the legal token!
  const handleTokenInteract = (player: PlayerState, token: TokenState) => {
    if (!isMyTurn || player.id !== myPlayerId) return;

    if (turnPhase === 'WAITING_FOR_ROLL') {
      onRollDice?.();
      return;
    }

    if (legalMoveTokenIds.includes(token.id)) {
      onTokenClick?.(player.id, token.id);
    }
  };

  return (
    <div className={cn('w-full select-none flex items-center justify-center p-2', className)}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full h-full drop-shadow-2xl"
        style={{ maxWidth: SIZE, maxHeight: SIZE }}
        aria-label="Ludo King Board"
        role="img"
      >
        <defs>
          <filter id="boardDrop" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* ── Outer Board Container (Pure White Ludo King Frame) ── */}
        <rect
          width={SIZE}
          height={SIZE}
          fill="#FFFFFF"
          stroke="#1E293B"
          strokeWidth={6}
          rx={12}
          filter="url(#boardDrop)"
        />

        {/* ── 4 Corner Yards (Solid Vibrant Ludo King Colors) ── */}
        {[0, 1, 2, 3].map((pi) => {
          const positions: Record<number, { x: number; y: number; w: number; h: number }> = {
            0: { x: 0, y: 0, w: 6 * CELL, h: 6 * CELL },                  // Red (top-left)
            1: { x: 9 * CELL, y: 0, w: 6 * CELL, h: 6 * CELL },          // Green (top-right)
            2: { x: 9 * CELL, y: 9 * CELL, w: 6 * CELL, h: 6 * CELL },    // Yellow (bottom-right)
            3: { x: 0, y: 9 * CELL, w: 6 * CELL, h: 6 * CELL },           // Blue (bottom-left)
          };
          const pos = positions[pi];
          const color = YARD_COLORS[pi];

          return (
            <g key={`yard-box-${pi}`}>
              {/* Solid Colored Yard Outer Area */}
              <rect
                x={pos.x}
                y={pos.y}
                width={pos.w}
                height={pos.h}
                fill={color}
                stroke="#1E293B"
                strokeWidth={2}
              />

              {/* Crisp White Inner Yard Box */}
              <rect
                x={pos.x + 0.9 * CELL}
                y={pos.y + 0.9 * CELL}
                width={4.2 * CELL}
                height={4.2 * CELL}
                rx={10}
                fill="#FFFFFF"
                stroke="#1E293B"
                strokeWidth={2.5}
              />

              {/* 4 Solid Colored Token Circles Inside Yard */}
              {YARD_POSITIONS[pi]?.map(([cx, cy], dIdx) => (
                <g key={`dock-${pi}-${dIdx}`}>
                  {/* Outer circle border */}
                  <circle
                    cx={cx * CELL}
                    cy={cy * CELL}
                    r={18}
                    fill="#1E293B"
                  />
                  {/* Colored token base */}
                  <circle
                    cx={cx * CELL}
                    cy={cy * CELL}
                    r={16}
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                  />
                </g>
              ))}
            </g>
          );
        })}

        {/* ── Common Track Cells (Crisp White Squares with Black Borders) ── */}
        {TRACK_52.map(([col, row], idx) => {
          const x = col * CELL;
          const y = row * CELL;
          const isStarSafe = [8, 21, 34, 47].includes(idx);
          const isStart = [0, 13, 26, 39].includes(idx);
          const startPlayerIndex = [0, 13, 26, 39].indexOf(idx);
          const startColor = isStart ? YARD_COLORS[startPlayerIndex] : null;

          // Directional arrows for start positions
          const startArrows: Record<number, string> = {
            0: '➔',  // Red goes right
            13: '↓', // Green goes down
            26: '←', // Yellow goes left
            39: '↑', // Blue goes up
          };

          return (
            <g key={`cell-${idx}`}>
              <rect
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                fill={startColor || '#FFFFFF'}
                stroke="#1E293B"
                strokeWidth={1.5}
              />
              {/* Star Safe Outline */}
              {isStarSafe && (
                <text
                  x={x + CELL / 2}
                  y={y + CELL / 2 + 6}
                  textAnchor="middle"
                  fontSize={20}
                  fontWeight="bold"
                  fill="#1E293B"
                >
                  ★
                </text>
              )}
              {/* Start cell clockwise arrow */}
              {isStart && (
                <text
                  x={x + CELL / 2}
                  y={y + CELL / 2 + 5}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight="bold"
                  fill="#FFFFFF"
                >
                  {startArrows[idx]}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Solid Colored Home Runways (5 cells each) ── */}
        {[0, 1, 2, 3].map((pi) => {
          const cells = RUNWAY_CELLS[pi] ?? [];
          const color = YARD_COLORS[pi];

          return cells.map(([col, row], idx) => (
            <rect
              key={`runway-${pi}-${idx}`}
              x={col * CELL}
              y={row * CELL}
              width={CELL}
              height={CELL}
              fill={color}
              stroke="#1E293B"
              strokeWidth={1.5}
            />
          ));
        })}

        {/* ── Central Home Triangles Meeting in Center ── */}
        <g>
          {/* Red Triangle (left, meeting row 7 Red runway) */}
          <polygon
            points={`${6 * CELL},${6 * CELL} ${6 * CELL},${9 * CELL} ${7.5 * CELL},${7.5 * CELL}`}
            fill={YARD_COLORS[0]}
            stroke="#1E293B"
            strokeWidth={1.5}
          />
          {/* Green Triangle (top, meeting col 7 Green runway) */}
          <polygon
            points={`${6 * CELL},${6 * CELL} ${9 * CELL},${6 * CELL} ${7.5 * CELL},${7.5 * CELL}`}
            fill={YARD_COLORS[1]}
            stroke="#1E293B"
            strokeWidth={1.5}
          />
          {/* Yellow Triangle (right, meeting row 7 Yellow runway) */}
          <polygon
            points={`${9 * CELL},${6 * CELL} ${9 * CELL},${9 * CELL} ${7.5 * CELL},${7.5 * CELL}`}
            fill={YARD_COLORS[2]}
            stroke="#1E293B"
            strokeWidth={1.5}
          />
          {/* Blue Triangle (bottom, meeting col 7 Blue runway) */}
          <polygon
            points={`${6 * CELL},${9 * CELL} ${9 * CELL},${9 * CELL} ${7.5 * CELL},${7.5 * CELL}`}
            fill={YARD_COLORS[3]}
            stroke="#1E293B"
            strokeWidth={1.5}
          />
        </g>

        {/* ── Central Home Yellow Dice / Star Hub ── */}
        <circle cx={7.5 * CELL} cy={7.5 * CELL} r={16} fill="#FFC20E" stroke="#1E293B" strokeWidth={2} />
        <text x={7.5 * CELL} y={7.5 * CELL + 5} textAnchor="middle" fontSize={14} fill="#1E293B" fontWeight="bold">
          ★
        </text>

        {/* ── RENDER ALL TOKENS (Step-by-Step Hopping + Killed Drag Back + Same Block Minimizing) ── */}
        {players.map((player) => {
          const color = YARD_COLORS[player.playerIndex] || '#E52521';

          return player.tokens.map((token) => {
            const key = `${player.id}-${token.id}`;
            const isLegal = isMyTurn && (turnPhase === 'WAITING_FOR_ROLL' || legalMoveTokenIds.includes(token.id)) && player.id === myPlayerId;

            // 1. Killed token drag animation (flying back into its home yard base)
            const killed = killedAnims.get(key);
            if (killed) {
              const elapsed = performance.now() - killed.startTime;
              const progress = Math.min(1, elapsed / killed.duration);
              const t = easeOutCubic(progress);
              const curX = killed.fromX + (killed.toX - killed.fromX) * t;
              const curY = killed.fromY + (killed.toY - killed.fromY) * t;
              const arcRise = Math.sin(t * Math.PI) * 20;
              const rotation = t * 540;

              return (
                <LudoKingToken
                  key={`tok-killed-${key}`}
                  cx={curX}
                  cy={curY - arcRise}
                  color={color}
                  scale={1.15 - t * 0.15}
                  rotation={rotation}
                  isKilled
                  isLegal={false}
                />
              );
            }

            // Effective step count (animated step if hopping, otherwise token's real stepCount)
            const effectiveStep = displayedSteps[key] !== undefined ? displayedSteps[key] : token.stepCount;
            const effectiveStatus = effectiveStep < 0 ? 'YARD' : effectiveStep >= 56 ? 'HOME' : effectiveStep >= 51 ? 'RUNWAY' : 'TRACK';
            const isHopping = hoppingKeys.has(key);

            const baseCoords = getTokenPixelCoords(player.playerIndex, token.id, effectiveStep, effectiveStatus);

            // Check if multiple tokens share the same block / cell (minimizing & separating)
            let renderX = baseCoords.x;
            let renderY = baseCoords.y;
            let renderScale = 1.0;

            if (effectiveStatus === 'TRACK' || effectiveStatus === 'RUNWAY') {
              const occupants = cellOccupants.get(baseCoords.cellKey) || [];
              const occIndex = occupants.indexOf(key);
              if (occupants.length >= 2 && occIndex >= 0) {
                const cluster = getClusterOffsets(occupants.length, occIndex);
                renderX = baseCoords.x + cluster.offsetX;
                renderY = baseCoords.y + cluster.offsetY;
                renderScale = cluster.scale;
              }
            } else if (effectiveStatus === 'HOME') {
              renderScale = 0.85;
            }

            return (
              <LudoKingToken
                key={`tok-${key}`}
                cx={renderX}
                cy={renderY}
                color={color}
                scale={renderScale}
                isHopping={isHopping}
                isLegal={isLegal}
                onClick={() => handleTokenInteract(player, token)}
              />
            );
          });
        })}
      </svg>
    </div>
  );
}

// ── Ludo King 3D Pawn Pin Subcomponent ──
interface LudoKingTokenProps {
  cx: number;
  cy: number;
  color: string;
  isLegal: boolean;
  scale?: number;
  isHopping?: boolean;
  isKilled?: boolean;
  rotation?: number;
  onClick?: () => void;
}

function LudoKingToken({
  cx,
  cy,
  color,
  isLegal,
  scale = 1.0,
  isHopping = false,
  isKilled = false,
  rotation = 0,
  onClick,
}: LudoKingTokenProps) {
  return (
    <g
      style={{
        transform: `translate3d(${cx}px, ${cy}px, 0px) scale(${scale}) rotate(${rotation}deg)`,
        transition: isKilled ? 'none' : 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        willChange: 'transform',
      }}
      onClick={onClick}
      className={cn(
        'select-none',
        isLegal ? 'cursor-pointer' : 'cursor-default',
        isKilled && 'opacity-90'
      )}
    >
      {/* Huge invisible tap target ensuring effortless touch/click */}
      <circle cx={0} cy={0} r={24} fill="transparent" style={{ pointerEvents: 'all' }} />

      {/* Ground Base Shadow (stays on board plane, shrinks when jumping into the air) */}
      <ellipse
        cx={0}
        cy={5}
        rx={isHopping ? 7 : 12}
        ry={isHopping ? 2 : 4}
        fill="#000000"
        fillOpacity={isHopping ? 0.18 : 0.45}
        style={{ transition: 'all 200ms ease' }}
      />

      {/* Active turn bouncing selection ring */}
      {isLegal && (
        <circle
          cx={0}
          cy={0}
          r={18}
          fill="none"
          stroke="#FFC20E"
          strokeWidth={3}
          strokeDasharray="4 2"
          className="animate-spin-slow"
        />
      )}

      {/* Jumping Pawn Body (performs vertical jump arc when isHopping is true!) */}
      <g className={isHopping ? 'animate-token-hop' : ''}>
        {/* Outer Rim */}
        <circle cx={0} cy={0} r={12} fill="#1E293B" />
        {/* Solid Vibrant Pawn Cap */}
        <circle cx={0} cy={0} r={10.5} fill={color} stroke="#FFFFFF" strokeWidth={2} />

        {/* Inner White Ring and Pip */}
        <circle cx={0} cy={-2} r={6} fill="#FFFFFF" fillOpacity={0.9} />
        <circle cx={0} cy={-2} r={3.5} fill={color} />
      </g>
    </g>
  );
}
