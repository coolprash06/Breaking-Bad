/** Screen-pixel boxes used to keep map labels from overlapping. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** What the source layer occupies at one zoom step (markers + their labels). */
export interface OccupiedLayout {
  /** Representative zoom of this step: screen px = projected px * k. */
  k: number;
  occupied: Box[];
  /** Projected (k = 1) positions of every source marker (or cluster) drawn. */
  points: { x: number; y: number }[];
}
