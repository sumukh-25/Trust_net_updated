/**
 * useThreeScene - Phase 0 foundation
 * Builds a WebGLRenderer / Scene / Camera / OrbitControls combo.
 * - ResizeObserver tracks container dimensions
 * - IntersectionObserver pauses RAF when canvas leaves viewport
 * - visibilitychange pauses RAF on hidden tab
 * - Caps devicePixelRatio at 1.75
 * - Full dispose on unmount
 */
import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type DisposeFn = () => void;

export interface ThreeRefs {
  mountRef: React.RefObject<HTMLDivElement | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  clockRef: React.MutableRefObject<THREE.Clock>;
  addDisposable: (fn: DisposeFn) => void;
}

interface OrbitOpts {
  enableDamping?: boolean;
  dampingFactor?: number;
  enableZoom?: boolean;
  enablePan?: boolean;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  minDistance?: number;
  maxDistance?: number;
  maxPolarAngle?: number;
}

export interface UseThreeSceneOptions {
  fov?: number;
  near?: number;
  far?: number;
  antialias?: boolean;
  alpha?: boolean;
  enableOrbitControls?: boolean;
  orbitOptions?: OrbitOpts;
  onFrame?: (deltaTime: number, elapsedTime: number) => void;
  onInit?: (refs: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls | null;
  }) => DisposeFn | void;
}

export function useThreeScene(options: UseThreeSceneOptions = {}): ThreeRefs {
  const {
    fov = 60,
    near = 0.1,
    far = 2000,
    antialias = true,
    alpha = true,
    enableOrbitControls = true,
    orbitOptions = {},
    onFrame,
    onInit,
  } = options;

  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const disposablesRef = useRef<DisposeFn[]>([]);
  const addDisposable = useCallback((fn: DisposeFn) => { disposablesRef.current.push(fn); }, []);
  const rafIdRef = useRef<number>(0);
  const isPausedRef = useRef(false);
  const animateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias, alpha, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(mount.clientWidth || 800, mount.clientHeight || 600);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050810, 0.003);
    sceneRef.current = scene;

    const w = mount.clientWidth || 800;
    const h = mount.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(fov, w / h, near, far);
    camera.position.set(0, 4, 18);
    cameraRef.current = camera;

    let controls: OrbitControls | null = null;
    if (enableOrbitControls) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = orbitOptions.enableDamping ?? true;
      controls.dampingFactor = orbitOptions.dampingFactor ?? 0.07;
      controls.enableZoom = orbitOptions.enableZoom ?? true;
      controls.enablePan = orbitOptions.enablePan ?? false;
      controls.autoRotate = orbitOptions.autoRotate ?? false;
      controls.autoRotateSpeed = orbitOptions.autoRotateSpeed ?? 0.4;
      controls.minDistance = orbitOptions.minDistance ?? 5;
      controls.maxDistance = orbitOptions.maxDistance ?? 80;
      controls.maxPolarAngle = orbitOptions.maxPolarAngle ?? Math.PI * 0.82;
      controlsRef.current = controls;
    }

    let userDispose: DisposeFn | void;
    if (onInit) userDispose = onInit({ renderer, scene, camera, controls });

    const clock = clockRef.current;
    clock.start();

    const animate = () => {
      if (isPausedRef.current) return;
      rafIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      if (onFrame) onFrame(delta, elapsed);
      if (controls) controls.update();
      renderer.render(scene, camera);
    };
    animateRef.current = animate;

    if (!prefersReducedMotion) animate();
    else {
      if (onFrame) onFrame(0, 0);
      renderer.render(scene, camera);
    }

    const resizeObserver = new ResizeObserver(() => {
      const rw = mount.clientWidth;
      const rh = mount.clientHeight;
      if (rw === 0 || rh === 0) return;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    });
    resizeObserver.observe(mount);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isPausedRef.current = !entry.isIntersecting;
      if (entry.isIntersecting && !prefersReducedMotion) animate();
    }, { threshold: 0 });
    intersectionObserver.observe(mount);

    const handleVisibility = () => {
      if (document.hidden) {
        isPausedRef.current = true;
      } else {
        isPausedRef.current = false;
        if (!prefersReducedMotion) animate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      if (typeof userDispose === "function") userDispose();
      for (const fn of disposablesRef.current) fn();
      disposablesRef.current = [];
      controls?.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            if (mat && (mat as THREE.Material).dispose) (mat as THREE.Material).dispose();
          }
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mountRef, rendererRef, sceneRef, cameraRef, controlsRef, clockRef, addDisposable };
}
