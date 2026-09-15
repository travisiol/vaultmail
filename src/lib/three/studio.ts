import * as THREE from "three";

/**
 * A studio painted at runtime — no HDR file. A black room, a large white
 * softbox above and slightly in front, a green light panel below, a white
 * card behind the camera so front faces catch a highlight, and two narrow
 * side strips for the specular lines glass shows along its edges.
 *
 * Returned as a PMREM texture for `scene.environment`.
 */
export function makeStudioEnvironment(renderer: THREE.WebGLRenderer, opts: { green?: string; greenStrength?: number; side?: number } = {}): THREE.Texture {
  const green = new THREE.Color(opts.green ?? "#7dffc4");
  const gs = opts.greenStrength ?? 3.2;
  const side = opts.side ?? 1;
  const room = new THREE.Scene();
  room.background = new THREE.Color("#050706");

  const panel = (w: number, h: number, color: THREE.Color | number, intensity: number, position: THREE.Vector3, lookAt: THREE.Vector3) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.copy(position);
    mesh.lookAt(lookAt);
    room.add(mesh);
  };
  const origin = new THREE.Vector3();

  // The walls, so reflections have a faint gradient instead of pure black.
  const walls = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color("#0a0d0b"), side: THREE.BackSide }));
  room.add(walls);

  // Key softbox: above and forward. This is the white line along the top rim.
  panel(9, 4, 0xffffff, 5.5, new THREE.Vector3(0, 6, 3), origin);
  // A second, softer top light further back for the broad sheen on flat faces.
  panel(12, 5, new THREE.Color("#e8fff3"), 1.6, new THREE.Vector3(0, 7, -4), origin);
  // Green panel below: the tint on the lower bevels and the underside glow.
  panel(12, 3, green, gs, new THREE.Vector3(0, -6.5, 2), origin);
  // Card behind the camera: front faces read as lit glass, not as a hole.
  panel(6, 6, new THREE.Color("#f2fff8"), 1.1, new THREE.Vector3(0, 0.5, 9), origin);
  // Side strips: crisp specular lines on the vertical edges.
  panel(1.4, 9, 0xffffff, 3.2 * side, new THREE.Vector3(-8, 1, 3), origin);
  panel(1.4, 9, new THREE.Color("#dffff0"), 2.4 * side, new THREE.Vector3(8, 0, 3), origin);
  // A low front strip so the bottom rim reads as lit glass, in green.
  panel(10, 0.9, green, 2.2 * side, new THREE.Vector3(0, -3.2, 7), origin);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromScene(room, 0.035);
  pmrem.dispose();
  room.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return target.texture;
}

/**
 * A soft radial light for the planes behind the tile. Opaque RGB fading to
 * black (alpha stays 1): the planes are drawn with additive blending in the
 * *opaque* list, because three.js only renders opaque objects into the
 * transmission buffer — a `transparent: true` plane would be invisible
 * through the glass, however bright.
 */
export function makeBacklightTexture(opts: { inner?: [number, number, number]; mid?: [number, number, number]; midStop?: number; peak?: number; spread?: number } = {}): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const peak = opts.peak ?? 1;
  const inner = opts.inner ?? [240, 248, 244];
  const mid = opts.mid ?? [176, 236, 208];
  const rgb = (c: [number, number, number], k: number) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
  const spread = opts.spread ?? 1;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, rgb(inner, peak));
  g.addColorStop((opts.midStop ?? 0.34) * spread, rgb(mid, peak * 0.62));
  g.addColorStop(Math.min(0.97, 0.7 * spread), rgb([60, 160, 110], peak * 0.14));
  g.addColorStop(1, "rgb(0,0,0)");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
