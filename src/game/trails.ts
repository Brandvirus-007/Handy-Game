/** Cosmetic trail designs. They only change how the trail looks, never how the game plays. */

export type TrailId = 'default' | 'ember' | 'ice' | 'gold' | 'rainbow' | 'neon' | 'void';

export interface TrailDef {
  id: TrailId;
  /** Diamond price in the sparks screen (0 = cannot be bought, comes from the light pass). */
  price: number;
  /** Outer glow colour (null = the spark's own trail colour). */
  glow: string | null;
  /** Bright inner line (null = the spark's own colour). */
  core: string | null;
  /** Second glow colour for alternating designs. */
  alt?: string;
  style: 'solid' | 'flicker' | 'rainbow' | 'alternate';
}

export const TRAILS: TrailDef[] = [
  { id: 'default', price: 0, glow: null, core: null, style: 'solid' },
  { id: 'ember', price: 60, glow: '#ff5a1f', core: '#ffd29a', style: 'flicker' },
  { id: 'ice', price: 60, glow: '#4fb3ff', core: '#effbff', style: 'solid' },
  { id: 'rainbow', price: 150, glow: null, core: null, style: 'rainbow' },
  { id: 'gold', price: 0, glow: '#ffb703', core: '#fff1b8', style: 'solid' },
  { id: 'neon', price: 0, glow: '#ff3df0', alt: '#2ef2ff', core: '#ffffff', style: 'alternate' },
  { id: 'void', price: 0, glow: '#6b2cff', alt: '#ff3d8b', core: '#e6d6ff', style: 'alternate' },
];

export const getTrail = (id: TrailId): TrailDef => TRAILS.find((t) => t.id === id) ?? TRAILS[0];
