import React, { useMemo } from 'react';
import { PlayerState, TokenState, getRadialBoardMetrics } from '@ludoverse/shared';
import { PLAYER_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface RadialBoardProps {
  players: PlayerState[];
  activePlayerIndex: number;
  legalMoveTokenIds: number[];
  onTokenClick?: (playerId: string, tokenId: number) => void;
  myPlayerId?: string;
  className?: string;
}

const SIZE = 680;
const CX = 340;
const CY = 340;
const R_OUTER = 295;
const R_INNER = 165;
const R_CENTER = 60;
const R_NAME = 325;

function getRadialClusterOffset(count: number, index: number): { offsetX: number; offsetY: number; scale: number } {
  if (count <= 1) return { offsetX: 0, offsetY: 0, scale: 1.0 };
  if (count === 2) {
    const offsets = [
      { offsetX: -7, offsetY: -7 },
      { offsetX: 7, offsetY: 7 },
    ];
    return { ...offsets[index % 2], scale: 0.74 };
  }
  if (count === 3) {
    const offsets = [
      { offsetX: 0, offsetY: -8 },
      { offsetX: -7, offsetY: 6 },
      { offsetX: 7, offsetY: 6 },
    ];
    return { ...offsets[index % 3], scale: 0.62 };
  }
  const offsets = [
    { offsetX: -7, offsetY: -7 },
    { offsetX: 7, offsetY: -7 },
    { offsetX: -7, offsetY: 7 },
    { offsetX: 7, offsetY: 7 },
  ];
  return { ...offsets[index % 4], scale: 0.54 };
}

export function RadialBoard({
  players,
  activePlayerIndex,
  legalMoveTokenIds,
  onTokenClick,
  myPlayerId,
  className,
}: RadialBoardProps) {
  const N = Math.max(5, Math.min(9, players.length || 5));
  const metrics = useMemo(() => getRadialBoardMetrics(N), [N]);
  const isMyTurn = players[activePlayerIndex]?.id === myPlayerId;
  const safeSet = useMemo(() => new Set(metrics.safeCells), [metrics.safeCells]);

  // Sector angle per player
  const angleStep = (2 * Math.PI) / N;
  // Offset so that bottom player sits symmetrically at the bottom
  const baseAngle = Math.PI / 2;

  // Outer polygon vertices
  const outerPolygonPoints = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const angle = baseAngle + i * angleStep;
      pts.push([CX + R_OUTER * Math.cos(angle), CY + R_OUTER * Math.sin(angle)]);
    }
    return pts;
  }, [N, angleStep, baseAngle]);

  const outerPolygonPath = useMemo(() => {
    return outerPolygonPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt[0]} ${pt[1]}`).join(' ') + ' Z';
  }, [outerPolygonPoints]);

  // Center polygon vertices
  const centerPolygonPoints = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const angle = baseAngle + (i - 0.5) * angleStep;
      pts.push([CX + R_CENTER * Math.cos(angle), CY + R_CENTER * Math.sin(angle)]);
    }
    return pts;
  }, [N, angleStep, baseAngle]);

  const centerPolygonPath = useMemo(() => {
    return centerPolygonPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt[0]} ${pt[1]}`).join(' ') + ' Z';
  }, [centerPolygonPoints]);

  // Common track cells (8 per player sector = N * 8 total)
  const trackCoords = useMemo(() => {
    const coords: { x: number; y: number; isSafe: boolean; isApex: boolean }[] = [];
    const total = metrics.totalTrackCells;

    for (let i = 0; i < total; i++) {
      const angle = baseAngle + (2 * Math.PI * i) / total;
      const isApex = i % 8 === 4;
      const r = isApex ? R_OUTER - 18 : R_OUTER - 40;
      const x = CX + r * Math.cos(angle);
      const y = CY + r * Math.sin(angle);
      coords.push({ x, y, isSafe: safeSet.has(i), isApex });
    }
    return coords;
  }, [metrics.totalTrackCells, safeSet, baseAngle]);

  // Runway coordinates (5 cells per player towards the center polygon)
  const runwayCoords = useMemo(() => {
    const map = new Map<number, { x: number; y: number }[]>();

    players.forEach((player) => {
      const angle = baseAngle + player.playerIndex * angleStep;
      const steps: { x: number; y: number }[] = [];

      for (let s = 1; s <= 5; s++) {
        const t = s / 6;
        const r = R_INNER - t * (R_INNER - R_CENTER);
        const x = CX + r * Math.cos(angle);
        const y = CY + r * Math.sin(angle);
        steps.push({ x, y });
      }
      map.set(player.playerIndex, steps);
    });

    return map;
  }, [players, angleStep, baseAngle]);

  // Yard triangular pod coordinates for each player
  const yardCoords = useMemo(() => {
    const map = new Map<number, { x: number; y: number }[]>();

    players.forEach((player) => {
      const yardAngle = baseAngle + (player.playerIndex + 0.5) * angleStep;
      const rYard = (R_INNER + R_OUTER) / 2 + 10;
      const tokensCount = player.tokens.length || 4;
      const pod: { x: number; y: number }[] = [];

      for (let t = 0; t < tokensCount; t++) {
        const row = Math.floor(t / 2);
        const col = t % 2;
        const radialOffset = (row - 0.5) * 28;
        const lateralOffset = (col - 0.5) * 0.16;

        const r = rYard + radialOffset;
        const a = yardAngle + lateralOffset;
        pod.push({
          x: CX + r * Math.cos(a),
          y: CY + r * Math.sin(a),
        });
      }
      map.set(player.playerIndex, pod);
    });

    return map;
  }, [players, angleStep, baseAngle]);

  // Occupancy map for shared cells on the common track
  const trackOccupants = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const player of players) {
      for (const token of player.tokens) {
        if (token.status === 'TRACK' && token.commonIndex >= 0) {
          const list = map.get(token.commonIndex) || [];
          list.push(`${player.id}-${token.id}`);
          map.set(token.commonIndex, list);
        }
      }
    }
    return map;
  }, [players]);

  return (
    <div className={cn('w-full h-full select-none flex items-center justify-center relative p-2', className)}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full h-full drop-shadow-2xl"
        style={{ maxWidth: SIZE, maxHeight: SIZE }}
        role="img"
        aria-label={`${N}-Player Ludo King Radial Board`}
      >
        <defs>
          <filter id="ludoShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000000" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* ── Outer Board Base Polygon Frame ── */}
        <path
          d={outerPolygonPath}
          fill="#FFFFFF"
          stroke="#1E293B"
          strokeWidth={6}
          strokeLinejoin="round"
          filter="url(#ludoShadow)"
        />

        {/* ── Triangular Yard Wings (Exact Ludo King Style) ── */}
        {players.map((player) => {
          const color = PLAYER_COLORS[player.color];
          const i = player.playerIndex;
          const a1 = baseAngle + i * angleStep;
          const a2 = baseAngle + (i + 1) * angleStep;
          const aMid = (a1 + a2) / 2;

          const pCenter: [number, number] = [CX, CY];
          const p1: [number, number] = [CX + R_OUTER * Math.cos(a1), CY + R_OUTER * Math.sin(a1)];
          const p2: [number, number] = [CX + R_OUTER * Math.cos(a2), CY + R_OUTER * Math.sin(a2)];

          // White inner triangle vertices (inset)
          const inCenter: [number, number] = [
            CX + 80 * Math.cos(aMid),
            CY + 80 * Math.sin(aMid),
          ];
          const in1: [number, number] = [
            CX + (R_OUTER - 20) * Math.cos(a1 + 0.08),
            CY + (R_OUTER - 20) * Math.sin(a1 + 0.08),
          ];
          const in2: [number, number] = [
            CX + (R_OUTER - 20) * Math.cos(a2 - 0.08),
            CY + (R_OUTER - 20) * Math.sin(a2 - 0.08),
          ];

          const outerWedgePath = `M ${pCenter[0]} ${pCenter[1]} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} Z`;
          const innerWhitePath = `M ${inCenter[0]} ${inCenter[1]} L ${in1[0]} ${in1[1]} L ${in2[0]} ${in2[1]} Z`;

          // Outer name banner coords
          const bX = CX + (R_OUTER - 8) * Math.cos(aMid);
          const bY = CY + (R_OUTER - 8) * Math.sin(aMid);
          const deg = (aMid * 180) / Math.PI + 90;

          return (
            <g key={`ludo-yard-${player.id}`}>
              {/* Solid Colored Triangular Yard Border */}
              <path
                d={outerWedgePath}
                fill={color.hex}
                stroke="#1E293B"
                strokeWidth={2}
              />

              {/* Crisp White Inner Triangular Yard Insert */}
              <path
                d={innerWhitePath}
                fill="#FFFFFF"
                stroke="#1E293B"
                strokeWidth={2.5}
                strokeLinejoin="round"
              />

              {/* Outer Name Banner on Yard Edge */}
              <g transform={`translate(${bX}, ${bY}) rotate(${deg > 90 && deg < 270 ? deg + 180 : deg})`}>
                <rect
                  x={-42}
                  y={-9}
                  width={84}
                  height={18}
                  rx={4}
                  fill={color.hex}
                  stroke="#1E293B"
                  strokeWidth={1.5}
                />
                <text
                  x={0}
                  y={3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="bold"
                  fill="#FFFFFF"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                >
                  {player.name.slice(0, 10)}
                </text>
              </g>
            </g>
          );
        })}

        {/* ── Yard Token Base Circles (Exact 4 Solid Colored Circles on White) ── */}
        {players.map((player) => {
          const pod = yardCoords.get(player.playerIndex) || [];
          const color = PLAYER_COLORS[player.color];

          return pod.map((pt, tIdx) => (
            <g key={`yard-dock-${player.id}-${tIdx}`}>
              {/* Dark rim */}
              <circle cx={pt.x} cy={pt.y} r={14} fill="#1E293B" />
              {/* Solid colored base */}
              <circle cx={pt.x} cy={pt.y} r={12} fill={color.hex} stroke="#FFFFFF" strokeWidth={2} />
            </g>
          ));
        })}

        {/* ── 3-Lane Track Connecting Mesh ── */}
        {trackCoords.map((coord, idx) => {
          const next = trackCoords[(idx + 1) % trackCoords.length];
          return (
            <line
              key={`track-line-${idx}`}
              x1={coord.x} y1={coord.y}
              x2={next.x} y2={next.y}
              stroke="#CBD5E1"
              strokeWidth={12}
              strokeLinecap="round"
            />
          );
        })}

        {/* ── Common Track Cell Squares / Discs ── */}
        {trackCoords.map((coord, idx) => {
          const isSpawn = metrics.startOffsets.includes(idx);
          const spawnPlayerIndex = metrics.startOffsets.indexOf(idx);
          const spawnColor = isSpawn && spawnPlayerIndex >= 0 ? PLAYER_COLORS[players[spawnPlayerIndex]?.color]?.hex : null;

          return (
            <g key={`track-cell-${idx}`}>
              {/* Outer square cell */}
              <rect
                x={coord.x - 12}
                y={coord.y - 12}
                width={24}
                height={24}
                rx={4}
                fill={spawnColor || '#FFFFFF'}
                stroke="#1E293B"
                strokeWidth={1.8}
              />
              {/* Safe star outline */}
              {coord.isSafe && !isSpawn && (
                <text x={coord.x} y={coord.y + 5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#1E293B">
                  ★
                </text>
              )}
              {/* Clockwise Entry Arrow on start cell */}
              {isSpawn && (
                <text x={coord.x} y={coord.y + 4.5} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#FFFFFF">
                  ➔
                </text>
              )}
            </g>
          );
        })}

        {/* ── Solid Colored Home Runway Columns (5 Cells per player) ── */}
        {players.map((player) => {
          const cells = runwayCoords.get(player.playerIndex) || [];
          const color = PLAYER_COLORS[player.color]?.hex || '#fff';
          return cells.map((pt, sIdx) => (
            <g key={`runway-${player.id}-${sIdx}`}>
              <rect
                x={pt.x - 11}
                y={pt.y - 11}
                width={22}
                height={22}
                rx={4}
                fill={color}
                stroke="#1E293B"
                strokeWidth={1.8}
              />
              <circle
                cx={pt.x} cy={pt.y}
                r={3}
                fill="#FFFFFF"
                fillOpacity={0.8}
              />
            </g>
          ));
        })}

        {/* ── Central Home Polygon Hub ── */}
        <path
          d={centerPolygonPath}
          fill="#111827"
          stroke="#1E293B"
          strokeWidth={4}
        />

        {/* ── Center Home Colored Triangles ── */}
        {players.map((player) => {
          const color = PLAYER_COLORS[player.color];
          const i = player.playerIndex;
          const pCenter: [number, number] = [CX, CY];
          const pt1 = centerPolygonPoints[i];
          const pt2 = centerPolygonPoints[(i + 1) % N];
          if (!pt1 || !pt2) return null;

          const triD = `M ${pCenter[0]} ${pCenter[1]} L ${pt1[0]} ${pt1[1]} L ${pt2[0]} ${pt2[1]} Z`;

          return (
            <path
              key={`home-slice-${player.id}`}
              d={triD}
              fill={color.hex}
              stroke="#111827"
              strokeWidth={1.5}
            />
          );
        })}

        {/* ── Iconic Center Dice Box (Exact Ludo King Center) ── */}
        <g transform={`translate(${CX}, ${CY})`}>
          <rect
            x={-20}
            y={-20}
            width={40}
            height={40}
            rx={8}
            fill="#FFC20E"
            stroke="#1E293B"
            strokeWidth={2.5}
            filter="url(#ludoShadow)"
          />
          {/* Dice pips (6 dots) */}
          <circle cx={-10} cy={-10} r={2.5} fill="#1E293B" />
          <circle cx={-10} cy={0} r={2.5} fill="#1E293B" />
          <circle cx={-10} cy={10} r={2.5} fill="#1E293B" />
          <circle cx={10} cy={-10} r={2.5} fill="#1E293B" />
          <circle cx={10} cy={0} r={2.5} fill="#1E293B" />
          <circle cx={10} cy={10} r={2.5} fill="#1E293B" />
        </g>

        {/* ── Render Tokens: in Yard ── */}
        {players.map((player) => {
          const pod = yardCoords.get(player.playerIndex) || [];
          const color = PLAYER_COLORS[player.color];

          return player.tokens
            .filter(t => t.status === 'YARD')
            .map((token) => {
              const pt = pod[token.id];
              if (!pt) return null;
              const isLegal = isMyTurn && legalMoveTokenIds.includes(token.id) && player.id === myPlayerId;

              return (
                <LudoKingToken
                  key={`tok-yard-${player.id}-${token.id}`}
                  cx={pt.x} cy={pt.y}
                  color={color.hex}
                  isLegal={isLegal}
                  onClick={() => isLegal && onTokenClick?.(player.id, token.id)}
                />
              );
            });
        })}

        {/* ── Render Tokens: on Common Track (with smart multi-token clustering) ── */}
        {players.map((player) => {
          const color = PLAYER_COLORS[player.color];

          return player.tokens
            .filter(t => t.status === 'TRACK' && t.commonIndex >= 0)
            .map((token) => {
              const pt = trackCoords[token.commonIndex];
              if (!pt) return null;
              const isLegal = isMyTurn && legalMoveTokenIds.includes(token.id) && player.id === myPlayerId;
              const key = `${player.id}-${token.id}`;
              const occupants = trackOccupants.get(token.commonIndex) || [];
              const occIndex = occupants.indexOf(key);
              const cluster = getRadialClusterOffset(occupants.length, occIndex);

              return (
                <LudoKingToken
                  key={`tok-track-${key}`}
                  cx={pt.x + cluster.offsetX}
                  cy={pt.y + cluster.offsetY}
                  scale={cluster.scale}
                  color={color.hex}
                  isLegal={isLegal}
                  onClick={() => isLegal && onTokenClick?.(player.id, token.id)}
                />
              );
            });
        })}

        {/* ── Render Tokens: on Runway ── */}
        {players.map((player) => {
          const cells = runwayCoords.get(player.playerIndex) || [];
          const color = PLAYER_COLORS[player.color];

          return player.tokens
            .filter(t => t.status === 'RUNWAY')
            .map((token) => {
              const stepIdx = Math.max(0, Math.min(4, token.stepCount - metrics.totalTrackCells));
              const pt = cells[stepIdx];
              if (!pt) return null;
              const isLegal = isMyTurn && legalMoveTokenIds.includes(token.id) && player.id === myPlayerId;

              return (
                <LudoKingToken
                  key={`tok-runway-${player.id}-${token.id}`}
                  cx={pt.x}
                  cy={pt.y}
                  scale={0.9}
                  color={color.hex}
                  isLegal={isLegal}
                  onClick={() => isLegal && onTokenClick?.(player.id, token.id)}
                />
              );
            });
        })}

        {/* ── Render Tokens: at Home ── */}
        {players.map((player) => {
          const color = PLAYER_COLORS[player.color];
          const angle = baseAngle + player.playerIndex * angleStep;

          return player.tokens
            .filter(t => t.status === 'HOME')
            .map((token, hIdx) => {
              const offsetAngle = angle + (hIdx - 1.5) * 0.18;
              const hx = CX + 34 * Math.cos(offsetAngle);
              const hy = CY + 34 * Math.sin(offsetAngle);

              return (
                <circle
                  key={`tok-home-${player.id}-${token.id}`}
                  cx={hx}
                  cy={hy}
                  r={8}
                  fill={color.hex}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              );
            });
        })}
      </svg>
    </div>
  );
}

// ── Authentic Ludo King 3D Pawn Pin Subcomponent ──
interface LudoKingTokenProps {
  cx: number;
  cy: number;
  color: string;
  isLegal: boolean;
  scale?: number;
  isHopping?: boolean;
  onClick?: () => void;
}

function LudoKingToken({
  cx,
  cy,
  color,
  isLegal,
  scale = 1.0,
  isHopping = false,
  onClick,
}: LudoKingTokenProps) {
  return (
    <g
      style={{
        transform: `translate3d(${cx}px, ${cy}px, 0px) scale(${scale})`,
        transition: 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        willChange: 'transform',
      }}
      onClick={onClick}
      className={cn(
        'select-none',
        isLegal ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      {/* Huge invisible tap target ensuring effortless touch on mobile */}
      <circle cx={0} cy={0} r={24} fill="transparent" style={{ pointerEvents: 'all' }} />

      {/* Ground Base Shadow */}
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

      {/* Jumping Pawn Body */}
      <g className={isHopping ? 'animate-token-hop' : ''}>
        <circle cx={0} cy={0} r={12} fill="#1E293B" />
        <circle cx={0} cy={0} r={10.5} fill={color} stroke="#FFFFFF" strokeWidth={2} />
        <circle cx={0} cy={-2} r={6} fill="#FFFFFF" fillOpacity={0.9} />
        <circle cx={0} cy={-2} r={3.5} fill={color} />
      </g>
    </g>
  );
}