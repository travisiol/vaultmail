import * as THREE from "three";

/**
 * The envelope, as outlines. One source of truth for the 3D hero (extruded
 * with bevels) and the SVG mark (same points, drawn flat) so the icon in the
 * nav is the object in the hero, not a cousin of it.
 *
 * Units are relative to a tile of half-width 1. +y is up.
 */

export type Pt = [number, number];

/** A superellipse |x/a|^n + |y/a|^n = 1 — the continuous-curvature "squircle" of app icons. */
export function superellipse(a: number, n: number, steps = 160): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push([a * Math.sign(c) * Math.abs(c) ** (2 / n), a * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return pts;
}

/** Corner points of a rectangle, counter-clockwise from bottom-left. */
export function rect(w: number, h: number, cx = 0, cy = 0): Pt[] {
  const x = w / 2;
  const y = h / 2;
  return [
    [cx - x, cy - y],
    [cx + x, cy - y],
    [cx + x, cy + y],
    [cx - x, cy + y],
  ];
}

/**
 * The flap: the top of the envelope folded down. A short vertical run on
 * each side, then two edges meeting at a point below. Counter-clockwise.
 */
export function flap(w: number, top: number, shoulder: number, point: number): Pt[] {
  const x = w / 2;
  return [
    [-x, shoulder],
    [0, point],
    [x, shoulder],
    [x, top],
    [-x, top],
  ];
}

/**
 * Round every corner of a polygon with a quadratic curve. `r` is clamped to
 * half the shorter adjacent edge so short edges stay valid.
 */
export function roundedPath(points: Pt[], r: number): THREE.Path {
  const n = points.length;
  const path = new THREE.Path();
  const seg: { a: Pt; b: Pt; corner: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const d1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const d2 = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a: Pt = [cur[0] + ((prev[0] - cur[0]) / d1) * rr, cur[1] + ((prev[1] - cur[1]) / d1) * rr];
    const b: Pt = [cur[0] + ((next[0] - cur[0]) / d2) * rr, cur[1] + ((next[1] - cur[1]) / d2) * rr];
    seg.push({ a, b, corner: cur });
  }
  path.moveTo(seg[0].a[0], seg[0].a[1]);
  for (let i = 0; i < n; i++) {
    const s = seg[i];
    path.quadraticCurveTo(s.corner[0], s.corner[1], s.b[0], s.b[1]);
    const nx = seg[(i + 1) % n];
    path.lineTo(nx.a[0], nx.a[1]);
  }
  path.closePath();
  return path;
}

export function shapeFromPath(path: THREE.Path): THREE.Shape {
  const shape = new THREE.Shape();
  shape.curves = path.curves;
  shape.autoClose = true;
  return shape;
}

export function shapeFromPoints(points: Pt[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

/** The three outlines of the mark, in tile units (half-width 1). */
export const MARK = {
  tile: { half: 1, n: 5.2 },
  body: { w: 1.34, h: 0.64, cy: -0.13, r: 0.11 },
  flap: { w: 1.34, top: 0.33, shoulder: 0.19, point: -0.1, r: 0.09 },
} as const;

export function tileShape(): THREE.Shape {
  return shapeFromPoints(superellipse(MARK.tile.half, MARK.tile.n));
}

export function bodyShape(): THREE.Shape {
  const b = MARK.body;
  return shapeFromPath(roundedPath(rect(b.w, b.h, 0, b.cy), b.r));
}

export function flapShape(): THREE.Shape {
  const f = MARK.flap;
  return shapeFromPath(roundedPath(flap(f.w, f.top, f.shoulder, f.point), f.r));
}

/** SVG path data for the same outlines, y flipped, scaled to a `size` box centred on (size/2, size/2). */
export function svgPathOf(path: THREE.Path, size: number, unitsPerSide = 2.3): string {
  const k = size / unitsPerSide;
  const pts = path.getPoints(12);
  const tx = (p: THREE.Vector2) => `${(size / 2 + p.x * k).toFixed(2)} ${(size / 2 - p.y * k).toFixed(2)}`;
  return `M${tx(pts[0])} ${pts.slice(1).map((p) => `L${tx(p)}`).join(" ")} Z`;
}
