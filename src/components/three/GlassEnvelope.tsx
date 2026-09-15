"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bodyShape, flapShape, tileShape } from "@/lib/shapes";
import { makeBacklightTexture, makeStudioEnvironment } from "@/lib/three/studio";

/**
 * The hero object: a slab of frosted glass, an envelope embossed on it, lit
 * from above in white and from below in green. Real refraction
 * (MeshPhysicalMaterial transmission) over a backlight plane, so the slab
 * glows milky the way a lit acrylic block does; the envelope is satin
 * porcelain rather than a second transmissive body — a transmissive object
 * never shows through another one in three.js.
 *
 * Nothing is loaded: the studio is painted into a PMREM environment at
 * start-up and the backlight is a canvas gradient.
 */

export type GlassParams = {
  tileRoughness: number;
  tileTransmission: number;
  tileThickness: number;
  tileTint: string;
  tileAttenuation: number;
  envelopeMode: "satin" | "glass";
  envelopeColor: string;
  bloom: number;
  bloomThreshold: number;
  exposure: number;
  greenStrength: number;
  backlight: number;
  /** Peak brightness of the backlight, 0–1 (sRGB). */
  backlightPeak: number;
  /** Pool of light around the tile, 0–1. */
  pool: number;
  /** How far the backlight reaches across the tile (1 = tight, 1.4 = lightbox). */
  spread: number;
  envelopeOpacity: number;
  envelopeEnv: number;
  keyLight: number;
  bevel: number;
  sideLight: number;
  /** World x of the tile as a fraction of the visible half-width; 0 = centred. */
  offsetX: number;
  scale: number;
};

export const DEFAULT_PARAMS: GlassParams = {
  tileRoughness: 0.27,
  tileTransmission: 1,
  tileThickness: 1.1,
  tileTint: "#d6fbe8",
  tileAttenuation: 4,
  envelopeMode: "satin",
  envelopeColor: "#c4d1ca",
  bloom: 0.35,
  bloomThreshold: 0.9,
  exposure: 1.1,
  greenStrength: 3.2,
  backlight: 1,
  backlightPeak: 1,
  pool: 0.7,
  spread: 1.3,
  envelopeOpacity: 1,
  envelopeEnv: 1.25,
  keyLight: 0,
  bevel: 1.2,
  sideLight: 1,
  offsetX: 0.46,
  scale: 0.94,
};

type Props = {
  params?: Partial<GlassParams>;
  className?: string;
  /** Render one frame and stop (lab captures, reduced motion). */
  still?: boolean;
  /** Called once WebGL is confirmed absent, so the parent can show the flat mark. */
  onUnsupported?: () => void;
};

function smoothExtrude(shape: THREE.Shape, depth: number, bevelSize: number, bevelThickness: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize,
    bevelThickness,
    bevelSegments: 10,
    bevelOffset: 0,
    curveSegments: 64,
  });
  const merged = BufferGeometryUtils.mergeVertices(geo, 1e-4);
  merged.computeVertexNormals();
  merged.translate(0, 0, -depth / 2);
  geo.dispose();
  return merged;
}

export function GlassEnvelope({ params, className, still, onUnsupported }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const p: GlassParams = { ...DEFAULT_PARAMS, ...params };
  const key = JSON.stringify(p);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      // No WebGL: the parent swaps in the flat mark; this host stays empty.
      onUnsupported?.();
      return;
    }
    const reduced = still || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dprCap = window.innerWidth < 720 ? 1.25 : 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = p.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#040605");
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
    camera.position.set(0, 0, 7.2);

    const env = makeStudioEnvironment(renderer, { greenStrength: p.greenStrength, side: p.sideLight });
    scene.environment = env;

    // ---- the object ------------------------------------------------------
    const group = new THREE.Group();
    scene.add(group);

    const tileGeo = smoothExtrude(tileShape(), 0.22, 0.1 * p.bevel, 0.085 * p.bevel);
    const tileMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: p.tileRoughness,
      transmission: p.tileTransmission,
      thickness: p.tileThickness,
      ior: 1.48,
      attenuationColor: new THREE.Color(p.tileTint),
      attenuationDistance: p.tileAttenuation,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.5,
      specularIntensity: 1,
      side: THREE.FrontSide,
    });
    const tile = new THREE.Mesh(tileGeo, tileMat);
    tile.renderOrder = 2;
    group.add(tile);

    const envelopeMat =
      p.envelopeMode === "glass"
        ? new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.42,
            transmission: 1,
            thickness: 0.5,
            ior: 1.45,
            attenuationColor: new THREE.Color("#e6fff2"),
            attenuationDistance: 1.2,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            envMapIntensity: 1.4,
            side: THREE.FrontSide,
          })
        : new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(p.envelopeColor),
            metalness: 0,
            roughness: 0.28,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            sheen: 0.3,
            sheenColor: new THREE.Color("#b9f4d8"),
            sheenRoughness: 0.6,
            envMapIntensity: p.envelopeEnv,
            transparent: p.envelopeOpacity < 1,
            opacity: p.envelopeOpacity,
            side: THREE.FrontSide,
          });

    const bodyGeo = smoothExtrude(bodyShape(), 0.09, 0.035, 0.03);
    const body = new THREE.Mesh(bodyGeo, envelopeMat);
    body.position.z = 0.11 + 0.045 + 0.03;
    body.renderOrder = 3;
    group.add(body);

    const flapGeo = smoothExtrude(flapShape(), 0.09, 0.035, 0.03);
    const flapMesh = new THREE.Mesh(flapGeo, envelopeMat);
    flapMesh.position.z = body.position.z + 0.075;
    flapMesh.renderOrder = 4;
    group.add(flapMesh);

    // ---- the backlight ---------------------------------------------------
    // Additive, opaque-listed, no depth: visible through the glass (see studio.ts) and never a rectangle.
    const backTex = makeBacklightTexture({ peak: p.backlightPeak * p.backlight, spread: p.spread });
    const backMat = new THREE.MeshBasicMaterial({ map: backTex, transparent: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), backMat);
    back.position.z = -0.55;
    back.renderOrder = 1;
    group.add(back);

    // A wider, much fainter pool so the glow reaches the page, still inside the frustum.
    const poolTex = makeBacklightTexture({ inner: [120, 235, 180], mid: [70, 190, 130], midStop: 0.26, peak: 0.5 * p.pool * p.backlight, spread: 0.9 });
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), poolMat);
    pool.position.z = -1.2;
    pool.renderOrder = 0;
    group.add(pool);

    // ---- lights (the env map does most of it; these add the crisp highlights) ----
    const key = new THREE.DirectionalLight(0xffffff, p.keyLight);
    key.position.set(1.5, 4, 3.5);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.1));

    // ---- post ----------------------------------------------------------------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), p.bloom, 0.62, p.bloomThreshold);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // ---- sizing --------------------------------------------------------------
    let width = 1;
    let height = 1;
    const place = () => {
      const aspect = width / height;
      const visibleH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visibleW = visibleH * aspect;
      const wide = aspect > 1.05;
      // Keep the tile a fixed share of the height on wide screens, of the width on tall ones.
      const target = wide ? visibleH * 0.62 : Math.min(visibleW * 0.62, visibleH * 0.34);
      const s = (target / 2.2) * p.scale;
      group.scale.setScalar(s);
      group.position.x = wide ? (visibleW / 2) * p.offsetX : 0;
      group.position.y = wide ? -0.08 : visibleH * 0.22;
    };
    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      bloom.resolution.set(Math.floor(width / 2), Math.floor(height / 2));
      place();
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) render(0);
    });
    ro.observe(host);
    window.addEventListener("resize", resize);

    // ---- motion --------------------------------------------------------------
    const pointer = new THREE.Vector2(0, 0);
    const pointerTarget = new THREE.Vector2(0, 0);
    const onMove = (e: PointerEvent) => {
      pointerTarget.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    const onLeave = () => pointerTarget.set(0, 0);
    if (!reduced) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerleave", onLeave);
    }

    const clock = new THREE.Clock();
    let raf = 0;
    let visible = true;
    let mounted = true;

    const render = (t: number) => {
      pointer.lerp(pointerTarget, 0.06);
      group.rotation.y = pointer.x * 0.26 + Math.sin(t * 0.45) * 0.045;
      group.rotation.x = -pointer.y * 0.18 + Math.cos(t * 0.6) * 0.03;
      group.position.y += 0; // placement owns y; bob happens on the tile
      tile.position.y = Math.sin(t * 0.8) * 0.02;
      body.position.y = tile.position.y;
      flapMesh.position.y = tile.position.y;
      composer.render();
    };

    const loop = () => {
      if (!mounted) return;
      if (visible && !document.hidden) render(clock.getElapsedTime());
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);

    if (reduced) {
      // Two frames: the first compiles shaders, the second is the picture.
      render(0.6);
      render(0.6);
    } else {
      loop();
    }

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      composer.dispose();
      tileGeo.dispose();
      bodyGeo.dispose();
      flapGeo.dispose();
      tileMat.dispose();
      envelopeMat.dispose();
      backTex.dispose();
      backMat.dispose();
      poolTex.dispose();
      poolMat.dispose();
      env.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
    // The params object is serialised into `key`; rebuilding on any change is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, still]);

  return <div ref={hostRef} className={className} aria-hidden data-glass-hero />;
}
