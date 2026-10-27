import { PlayerColor } from '@ludoverse/shared';

export const PLAYER_COLORS: Record<PlayerColor, { hex: string; tailwind: string; glyph: string; name: string }> = {
  red:    { hex: '#E52521', tailwind: 'text-red-500',    glyph: '⬥', name: 'Red' },
  green:  { hex: '#00A651', tailwind: 'text-emerald-500',glyph: '●', name: 'Green' },
  yellow: { hex: '#FFC20E', tailwind: 'text-amber-400',  glyph: '★', name: 'Yellow' },
  blue:   { hex: '#0072CE', tailwind: 'text-blue-500',   glyph: '▲', name: 'Blue' },
  purple: { hex: '#8E24AA', tailwind: 'text-purple-500', glyph: '⬢', name: 'Purple' },
  orange: { hex: '#FF6F00', tailwind: 'text-orange-500', glyph: '◼', name: 'Orange' },
  teal:   { hex: '#00897B', tailwind: 'text-teal-500',   glyph: '✚', name: 'Teal' },
  pink:   { hex: '#D81B60', tailwind: 'text-pink-500',   glyph: '◯', name: 'Pink' },
  lime:   { hex: '#7CB342', tailwind: 'text-lime-500',   glyph: '♥', name: 'Lime' },
};

export const REACTIONS = ['🎉', '😂', '😱', '🔥', '👏', '💀', '🎯', '😤', '🏆', '🤣'];

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (typeof window !== 'undefined' && window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:3001');
