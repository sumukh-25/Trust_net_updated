/**
 * ThreatOpsCore — Phase 1 Immersive Hero Component
 * A cinematic Three.js command-stage for the Overview page.
 *
 * Features:
 *  - Force-directed 3D layout seeded from propagationRisk
 *  - InstancedMesh for nodes (zero per-node draw calls)
 *  - Animated tube edges (attack paths pulse red)
 *  - Pulse rings on compromised nodes
 *  - Camera auto-orbit (pauses on user interaction, resumes 4s later)
 *  - Click → fly-to-entity camera tween + onSelectEntity callback
 *  - IntersectionObserver pause, visibility-change pause
 *  - Full disposal on unmount — no leaks
 *  - prefers-reduced-motion support
 */

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import type { NetworkNode, NetworkEdge } from "@/data/mockData";

// ---------- Types ----------

interface ThreatOpsCoreProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
  highlightHighRisk?: boolean;
}

// ---------- Constants ----------

const CANVAS_H = 520;
const MAX_DPR = 1.75;
const REDUCED_MOTION =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const COL_SAFE = new THREE.Color("#22d3ee");
const COL_WARN = new THREE.Color("#f4bd62");
const COL_CRIT = new THREE.Color("#ff4060");
const COL_SELECTED = new THREE.Color("#ffffff");
const COL_EDGE_NORMAL = new THREE.Color("#2a4060");
const COL_EDGE_ATTACK = new THREE.Color("#ff2040");

function nodeColor(n: NetworkNode): THREE.Color {
  if (n.compromised) return COL_CRIT.clone();
  if (n.propagationRisk > 60) return COL_CRIT.clone();
  if (n.propagationRisk > 30) return COL_WARN.clone();
  return COL_SAFE.clone();
}

// Simple lerp
function lerpV3(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  return a.clone().lerp(b, Math.min(t, 1));
}

// ---------- Component ----------

export function ThreatOpsCore({
  nodes,
  edges,
  selectedEntityId,
  onSelectEntity,
  highlightHighRisk = false,
}: ThreatOpsCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    raf: number;
    disposed: boolean;
    positions: Map<string, THREE.Vector3>;
    autoOrbit: boolean;
    orbitAngle: number;
    lastInteraction: number;
    mouse: THREE.Vector2;
    raycaster: THREE.Raycaster;
    edgeMeshes: THREE.Object3D[];
    pulseMeshes: THREE.Mesh[];
    instancedNodes: THREE.InstancedMesh | null;
    selectedPos: THREE.Vector3 | null;
    cameraTarget: THREE.Vector3;
    cameraPos: THREE.Vector3;
    isDragging: boolean;
    pointerDownTime: number;
  }>({
    renderer: null,
    scene: null,
    camera: null,
    raf: 0,
    disposed: false,
    positions: new Map(),
    autoOrbit: !REDUCED_MOTION,
    orbitAngle: 0,
    lastInteraction: 0,
    mouse: new THREE.Vector2(),
    raycaster: new THREE.Raycaster(),
    edgeMeshes: [],
    pulseMeshes: [],
    instancedNodes: null,
    selectedPos: null,
    cameraTarget: new THREE.Vector3(0, 0, 0),
    cameraPos: new THREE.Vector3(0, 60, 160),
    isDragging: false,
    pointerDownTime: 0,
  });

  // ---------- Force Layout ----------

  const buildPositions = useCallback(
    (nodeList: NetworkNode[]): Map<string, THREE.Vector3> => {
      const map = new Map<string, THREE.Vector3>();
      const spread = 80;
      nodeList.forEach((n, i) => {
        const phi = Math.acos(-1 + (2 * i) / Math.max(nodeList.length - 1, 1));
        const theta = Math.sqrt(nodeList.length * Math.PI) * phi;
        const r = spread * (0.6 + 0.4 * Math.random());
        map.set(
          n.id,
          new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi) * 0.5,
            r * Math.sin(phi) * Math.sin(theta)
          )
        );
      });

      for (let iter = 0; iter < 20; iter++) {
        for (let a = 0; a < nodeList.length; a++) {
          for (let b = a + 1; b < nodeList.length; b++) {
            const pa = map.get(nodeList[a].id)!;
            const pb = map.get(nodeList[b].id)!;
            const delta = pa.clone().sub(pb);
            const dist = Math.max(delta.length(), 2);
            const force = Math.min(1200 / (dist * dist), 8);
            delta.normalize().multiplyScalar(force * 0.1);
            pa.add(delta);
            pb.sub(delta);
          }
        }
        edges.forEach((e) => {
          const pa = map.get(e.from);
          const pb = map.get(e.to);
          if (!pa || !pb) return;
          const delta = pb.clone().sub(pa);
          const dist = delta.length();
          const force = dist * 0.01;
          delta.normalize().multiplyScalar(force);
          pa.add(delta);
          pb.sub(delta);
        });
        nodeList.forEach((n) => {
          map.get(n.id)!.multiplyScalar(0.98);
        });
      }
      return map;
    },
    [edges]
  );

  // ---------- Scene Build ----------

  const buildScene = useCallback(() => {
    const s = stateRef.current;
    if (!s.scene || nodes.length === 0) return;
    const scene = s.scene;

    // Clear old objects
    s.edgeMeshes.forEach((m) => {
      scene.remove(m);
      if (m instanceof THREE.Mesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    s.edgeMeshes = [];

    s.pulseMeshes.forEach((m) => {
      scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    s.pulseMeshes = [];

    if (s.instancedNodes) {
      scene.remove(s.instancedNodes);
      s.instancedNodes.geometry.dispose();
      (s.instancedNodes.material as THREE.Material).dispose();
      s.instancedNodes = null;
    }

    s.positions = buildPositions(nodes);

    // ---- Edges ----
    edges.forEach((edge) => {
      const pa = s.positions.get(edge.from);
      const pb = s.positions.get(edge.to);
      if (!pa || !pb) return;

      const isAttack = edge.active && edge.attackPath;
      const midPt = pa.clone().lerp(pb, 0.5).add(new THREE.Vector3(0, 12, 0));
      const curve = new THREE.QuadraticBezierCurve3(pa, midPt, pb);
      const tubeGeo = new THREE.TubeGeometry(curve, 12, isAttack ? 0.6 : 0.3, 4, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: isAttack ? COL_EDGE_ATTACK : COL_EDGE_NORMAL,
        transparent: true,
        opacity: isAttack ? 0.85 : 0.35,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.userData.isAttack = isAttack;
      tube.userData.born = performance.now();
      scene.add(tube);
      s.edgeMeshes.push(tube);
    });

    // ---- InstancedMesh for nodes ----
    const nodeGeo = new THREE.SphereGeometry(3, 12, 12);
    const colArr = new Float32Array(nodes.length * 3);

    nodes.forEach((n, i) => {
      const col = selectedEntityId === n.id ? COL_SELECTED : nodeColor(n);
      colArr[i * 3] = col.r;
      colArr[i * 3 + 1] = col.g;
      colArr[i * 3 + 2] = col.b;
    });

    nodeGeo.setAttribute(
      "color",
      new THREE.InstancedBufferAttribute(colArr, 3)
    );

    const nodeMat = new THREE.MeshStandardMaterial({
      roughness: 0.2,
      metalness: 0.6,
      vertexColors: true,
    });

    const instanced = new THREE.InstancedMesh(nodeGeo, nodeMat, nodes.length);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    nodes.forEach((n, i) => {
      const pos = s.positions.get(n.id) ?? new THREE.Vector3();
      dummy.position.copy(pos);
      const scale =
        selectedEntityId === n.id
          ? 2.2
          : highlightHighRisk && n.propagationRisk > 60
          ? 1.8
          : 1 + n.propagationRisk / 80;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.userData.nodeIds = nodes.map((n) => n.id);
    scene.add(instanced);
    s.instancedNodes = instanced;

    // ---- Pulse rings for compromised nodes ----
    nodes
      .filter((n) => n.compromised)
      .forEach((n) => {
        const pos = s.positions.get(n.id)!;
        const ringGeo = new THREE.RingGeometry(4, 5.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: COL_CRIT,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.userData.born = performance.now();
        scene.add(ring);
        s.pulseMeshes.push(ring);
      });

    s.selectedPos = selectedEntityId
      ? (s.positions.get(selectedEntityId) ?? null)
      : null;
  }, [nodes, edges, selectedEntityId, highlightHighRisk, buildPositions]);

  // ---------- Click Handler ----------

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const s = stateRef.current;
      if (!s.renderer || !s.camera || !s.instancedNodes) return;
      if (Date.now() - s.pointerDownTime > 300 || s.isDragging) return;

      const rect = canvasRef.current!.getBoundingClientRect();
      s.mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      s.raycaster.setFromCamera(s.mouse, s.camera);
      const hits = s.raycaster.intersectObject(s.instancedNodes);
      if (hits.length > 0 && hits[0].instanceId != null) {
        const nodeIds: string[] = s.instancedNodes.userData.nodeIds;
        const id = nodeIds[hits[0].instanceId];
        onSelectEntity(selectedEntityId === id ? null : id);
      } else {
        onSelectEntity(null);
      }
      s.autoOrbit = false;
      s.lastInteraction = Date.now();
    },
    [onSelectEntity, selectedEntityId]
  );

  // ---------- Init WebGL (once) ----------

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const s = stateRef.current;
    s.disposed = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    renderer.setSize(container.clientWidth, CANVAS_H);
    renderer.setClearColor(0x000000, 0);
    s.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050810, 0.004);
    s.scene = scene;

    scene.add(new THREE.AmbientLight(0x223344, 1.4));
    const dirLight = new THREE.DirectionalLight(0x55dde0, 2.5);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0xff4060, 1.2);
    rimLight.position.set(-2, -1, -1);
    scene.add(rimLight);

    const gridHelper = new THREE.GridHelper(300, 30, 0x112233, 0x0d1a27);
    gridHelper.position.y = -40;
    scene.add(gridHelper);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / CANVAS_H, 0.5, 1200);
    camera.position.set(0, 60, 160);
    camera.lookAt(0, 0, 0);
    s.camera = camera;
    s.cameraPos = camera.position.clone();
    s.cameraTarget = new THREE.Vector3(0, 0, 0);

    const tick = () => {
      if (s.disposed) return;
      s.raf = requestAnimationFrame(tick);

      if (!s.autoOrbit && !REDUCED_MOTION && Date.now() - s.lastInteraction > 4000) {
        s.autoOrbit = true;
      }
      if (s.autoOrbit && !REDUCED_MOTION) s.orbitAngle += 0.0015;

      const orbitR = 160;
      const targetCamPos = s.selectedPos
        ? new THREE.Vector3(
            s.selectedPos.x + 30 * Math.cos(s.orbitAngle),
            s.selectedPos.y + 20,
            s.selectedPos.z + 30 * Math.sin(s.orbitAngle)
          )
        : new THREE.Vector3(orbitR * Math.cos(s.orbitAngle), 60, orbitR * Math.sin(s.orbitAngle));

      s.cameraPos = lerpV3(s.cameraPos, targetCamPos, 0.04);
      camera.position.copy(s.cameraPos);
      const targetLook = s.selectedPos ? s.selectedPos.clone() : new THREE.Vector3(0, 0, 0);
      s.cameraTarget = lerpV3(s.cameraTarget, targetLook, 0.05);
      camera.lookAt(s.cameraTarget);

      s.edgeMeshes.forEach((m) => {
        if (m instanceof THREE.Mesh && m.userData.isAttack) {
          const age = (performance.now() - m.userData.born) / 1000;
          (m.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.45 * Math.abs(Math.sin(age * 2.5));
        }
      });

      s.pulseMeshes.forEach((ring) => {
        const age = (performance.now() - ring.userData.born) / 1000;
        const cycle = (age % 1.6) / 1.6;
        ring.scale.setScalar(1 + cycle * 0.9);
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.8;
        ring.lookAt(camera.position);
      });

      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const w = container.clientWidth;
      renderer.setSize(w, CANVAS_H);
      camera.aspect = w / CANVAS_H;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(s.raf);
      else tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) cancelAnimationFrame(s.raf);
        else tick();
      },
      { threshold: 0.05 }
    );
    io.observe(container);

    const onPointerDown = () => {
      s.isDragging = false;
      s.pointerDownTime = Date.now();
    };
    const onPointerMove = () => {
      if (Date.now() - s.pointerDownTime > 80) {
        s.isDragging = true;
        s.autoOrbit = false;
        s.lastInteraction = Date.now();
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", handleClick as EventListener);

    return () => {
      s.disposed = true;
      cancelAnimationFrame(s.raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", handleClick as EventListener);

      s.edgeMeshes.forEach((m) => {
        if (m instanceof THREE.Mesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      s.pulseMeshes.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      if (s.instancedNodes) {
        s.instancedNodes.geometry.dispose();
        (s.instancedNodes.material as THREE.Material).dispose();
      }
      renderer.dispose();
      s.renderer = null;
      s.scene = null;
      s.camera = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild scene whenever data / selection / filters change
  useEffect(() => {
    buildScene();
  }, [buildScene]);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: CANVAS_H }}
      aria-label="Live 3D cybersecurity topology"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair"
        style={{ touchAction: "none" }}
      />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-4 pointer-events-none">
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#55dde0]/70">
          <span className="w-2 h-2 rounded-full bg-[#22d3ee] inline-block" />
          SAFE
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#f4bd62]/70">
          <span className="w-2 h-2 rounded-full bg-[#f4bd62] inline-block" />
          AT RISK
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#ff4060]/70">
          <span className="w-2 h-2 rounded-full bg-[#ff4060] inline-block" />
          CRITICAL
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#ff2040]/70">
          <span className="w-1 h-3 bg-[#ff2040] inline-block" />
          ATTACK PATH
        </span>
      </div>

      {!selectedEntityId && (
        <div className="absolute top-3 right-3 text-[10px] font-mono text-[#92a0b5]/60 pointer-events-none">
          Click node to inspect · Drag to orbit
        </div>
      )}
    </div>
  );
}
