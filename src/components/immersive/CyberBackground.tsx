/**
 * CyberBackground — Phase 0
 *
 * Fixed full-viewport Three.js scene rendered BEHIND all UI:
 *  • Drifting "data-dust" particles (InstancedMesh, ~1200 pts)
 *  • Perspective grid floor with subtle glow
 *  • Exponential fog from scene background
 *  • Camera gently parallaxes toward the cursor (damped spring)
 *  • Route-aware accent colour (cyan / violet / amber / red)
 *  • pointer-events:none  →  UI stays fully clickable
 *  • Pauses on hidden tab & when off-screen
 *  • Respects prefers-reduced-motion (static frame only)
 *  • Full dispose on unmount
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import * as THREE from "three";

/* ── Palette ── */
const ACCENT_MAP: Record<string, THREE.Color> = {
  incidents:   new THREE.Color(0xff647c),
  behavior:    new THREE.Color(0xa99bff),
  analytics:   new THREE.Color(0xa99bff),
  propagation: new THREE.Color(0xf4bd62),
  network:     new THREE.Color(0x5b8cff),
  admin:       new THREE.Color(0x5b8cff),
  default:     new THREE.Color(0x55dde0),
};

function getAccent(pathname: string): THREE.Color {
  for (const [key, col] of Object.entries(ACCENT_MAP)) {
    if (pathname.includes(key)) return col;
  }
  return ACCENT_MAP.default;
}

const PARTICLE_COUNT = 1_200;
const SPREAD = 120;
const GRID_SIZE = 80;
const GRID_DIVS = 30;

export function CyberBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const accentRef = useRef<THREE.Color>(new THREE.Color(0x55dde0));
  const targetAccentRef = useRef<THREE.Color>(new THREE.Color(0x55dde0));

  // Smooth mouse parallax target
  const mouseRef = useRef({ x: 0, y: 0 });
  const camBaseRef = useRef({ x: 0, y: 5, z: 28 });

  useEffect(() => {
    targetAccentRef.current = getAccent(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ── Renderer ── */
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // background — keep cheap
      alpha: true,
      powerPreference: "default",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x050810, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    /* ── Scene ── */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);
    scene.fog = new THREE.FogExp2(0x050810, 0.006);

    /* ── Camera ── */
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 500);
    camera.position.set(0, 5, 28);
    camera.lookAt(0, 0, 0);

    /* ── Ambient light ── */
    scene.add(new THREE.AmbientLight(0x4da3ff, 0.15));

    /* ── Particle instanced mesh ── */
    const particleGeo = new THREE.SphereGeometry(0.06, 4, 4);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0x55dde0, transparent: true, opacity: 0.55 });
    const particles = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_COUNT);
    particles.frustumCulled = false;

    const dummy = new THREE.Object3D();
    const velocities: Float32Array = new Float32Array(PARTICLE_COUNT * 3);
    const offsets: Float32Array = new Float32Array(PARTICLE_COUNT); // phase offset for pulsing

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const x = (Math.random() - 0.5) * SPREAD;
      const y = (Math.random() - 0.5) * SPREAD * 0.4 + 4;
      const z = (Math.random() - 0.5) * SPREAD;
      dummy.position.set(x, y, z);
      const s = Math.random() * 0.8 + 0.3;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
      velocities[i * 3]     = (Math.random() - 0.5) * 0.015;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.008;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.015;
      offsets[i] = Math.random() * Math.PI * 2;
    }
    particles.instanceMatrix.needsUpdate = true;
    scene.add(particles);

    /* ── Grid floor ── */
    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVS, 0x27364b, 0x1a2537);
    gridHelper.position.y = -8;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.35;
    scene.add(gridHelper);

    /* ── Perspective horizon lines ── */
    const lineMat = new THREE.LineBasicMaterial({ color: 0x27364b, transparent: true, opacity: 0.18 });
    const horizonGroup = new THREE.Group();
    const vp = -8; // y plane
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = (t - 0.5) * GRID_SIZE;
      const horizGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, vp, -GRID_SIZE * 0.5),
        new THREE.Vector3(0, vp + 6, 0), // vanishing point
      ]);
      horizonGroup.add(new THREE.Line(horizGeo, lineMat));
    }
    scene.add(horizonGroup);

    /* ── Clock ── */
    const clock = new THREE.Clock();
    clock.start();

    /* ── Mouse listener ── */
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    /* ── RAF ── */
    let rafId = 0;
    let paused = false;
    const pos = new THREE.Vector3();
    const mat = new THREE.Matrix4();

    const animate = () => {
      if (paused) return;
      rafId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      /* Lerp accent colour */
      accentRef.current.lerp(targetAccentRef.current, 0.012);
      particleMat.color.copy(accentRef.current);

      /* Update particle positions */
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.getMatrixAt(i, mat);
        pos.setFromMatrixPosition(mat);
        pos.x += velocities[i * 3];
        pos.y += velocities[i * 3 + 1] + Math.sin(elapsed * 0.4 + offsets[i]) * 0.001;
        pos.z += velocities[i * 3 + 2];
        // Wrap
        if (pos.x > SPREAD / 2) pos.x = -SPREAD / 2;
        if (pos.x < -SPREAD / 2) pos.x = SPREAD / 2;
        if (pos.y > 20) pos.y = -8;
        if (pos.y < -10) pos.y = 20;
        if (pos.z > SPREAD / 2) pos.z = -SPREAD / 2;
        if (pos.z < -SPREAD / 2) pos.z = SPREAD / 2;
        dummy.position.copy(pos);
        dummy.updateMatrix();
        particles.setMatrixAt(i, dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;

      /* Camera parallax (damped) */
      const targetX = camBaseRef.current.x + mouseRef.current.x * 1.8;
      const targetY = camBaseRef.current.y - mouseRef.current.y * 0.9;
      camera.position.x += (targetX - camera.position.x) * 0.028;
      camera.position.y += (targetY - camera.position.y) * 0.028;
      camera.position.z = camBaseRef.current.z;
      camera.lookAt(0, 0, 0);

      /* Grid colour tint */
      (gridHelper.material as THREE.Material & { color?: THREE.Color }).color?.copy(accentRef.current).multiplyScalar(0.06);

      renderer.render(scene, camera);
    };

    if (!prefersReducedMotion) animate();
    else renderer.render(scene, camera);

    /* ── Resize ── */
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    /* ── Visibility pause ── */
    const onVisibility = () => {
      paused = document.hidden;
      if (!paused && !prefersReducedMotion) animate();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      particleGeo.dispose();
      particleMat.dispose();
      lineMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{ mixBlendMode: "normal" }}
    />
  );
}
