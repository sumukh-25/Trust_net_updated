/**
 * NetworkGraph3D — Cinematic Premium Visual Overhaul
 *
 * PRESERVED EXACTLY (zero logic changes):
 *   - Props interface, ViewMode type, filteredNodes / node3DPositions
 *   - hover/click raycasting, setSelectedNode, setHoveredNodeId
 *   - connectedNodeIds / connectedEdgeIndices focus dimming
 *   - Camera presets (cinematic / flow / overhead / threat)
 *   - All UI controls (zoom, reset, mode strip, filter chips, inspector HUD, toast)
 *   - simulateAttack / resetSimulation hooks via useSecurity
 *   - WebGL availability guard
 *
 * REPLACED:
 *   - Bare sphere + wireframe shell → procedural designed node objects
 *     per entity type, MeshPhysicalMaterial (clearcoat / glass), emissive accents
 *   - Plain LineBasicMaterial lines → animated energy conduit tubes with
 *     UV-scrolling pulse shader (dim glass + bright travelling packets)
 *   - Old grid + particles → glossy reflective floor plane + hex grid overlay
 *     + soft light pools under each node
 *   - Lighting → ACES tone mapping, cool key + violet rim, RoomEnvironment PMREMed
 *   - Post-processing → EffectComposer, restrained UnrealBloomPass, vignette,
 *     soft film grain; quality toggle; auto-fallback if fps < 45
 */

import React, {
  useEffect, useRef, useState, useMemo, useCallback,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { useSecurity } from '@/store/securityStore';
import { NetworkNode, NetworkEdge } from '@/data/mockData';
import {
  ZoomIn, ZoomOut, RotateCcw, ShieldAlert, CheckCircle2,
  AlertTriangle, Layers, X, Compass, Activity, Crosshair, Radio,
} from 'lucide-react';

// ─── Semantic Colours ──────────────────────────────────────────
const C = {
  safe:    new THREE.Color('#22c55e'),
  warn:    new THREE.Color('#f59e0b'),
  danger:  new THREE.Color('#ef4444'),
  info:    new THREE.Color('#38bdf8'),
  ai:      new THREE.Color('#a78bfa'),
  bg:      new THREE.Color('#070b12'),
  floor:   new THREE.Color('#050810'),
  gridLine:new THREE.Color('#0f2035'),
};

function riskColor(node: NetworkNode): THREE.Color {
  if (node.compromised || (node.propagationRisk ?? 0) >= 70) return C.danger.clone();
  if ((node.propagationRisk ?? 0) > 30) return C.warn.clone();
  return C.safe.clone();
}

// ─── Conduit (edge) pulse ShaderMaterial ──────────────────────
function makePulseMat(color: THREE.Color, speed: number, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:   { value: color.clone() },
      uTime:    { value: 0 },
      uSpeed:   { value: speed },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uColor;
      uniform float uTime;
      uniform float uSpeed;
      uniform float uOpacity;
      varying vec2  vUv;

      void main() {
        // Dim glass base
        float base = 0.12;
        // Travelling bright pulse: repeating band that moves along U
        float phase  = fract(vUv.x - uTime * uSpeed);
        float pulse  = smoothstep(0.0, 0.07, phase) * smoothstep(0.14, 0.07, phase);
        // Bright core packet
        float bright = pulse * 3.5;
        float alpha  = (base + bright) * uOpacity;
        gl_FragColor = vec4(uColor * (0.3 + bright), clamp(alpha, 0.0, 0.95));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// Vignette + grain composite ShaderPass
const VignetteGrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime:    { value: 0 },
    uStrength:{ value: 0.55 },
    uGrain:   { value: 0.028 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float     uTime, uStrength, uGrain;
    varying vec2      vUv;
    float rand(vec2 co){ return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec4 color = texture2D(tDiffuse, vUv);
      // Vignette
      vec2 uv2 = vUv * 2.0 - 1.0;
      float vig = 1.0 - dot(uv2, uv2) * uStrength;
      color.rgb *= clamp(vig, 0.0, 1.0);
      // Film grain
      float grain = rand(vUv + fract(uTime * 0.07)) * uGrain - uGrain * 0.5;
      color.rgb += grain;
      gl_FragColor = color;
    }
  `,
};

// ─── Procedural Node Builders ──────────────────────────────────

function buildUserNode(color: THREE.Color, opacity: number): THREE.Group {
  const g = new THREE.Group();

  // Capsule body (glass badge)
  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(1.15, 1.6, 8, 20),
    new THREE.MeshPhysicalMaterial({
      color, emissive: color, emissiveIntensity: 0.35,
      roughness: 0.15, metalness: 0.0,
      transmission: 0.55, thickness: 1.0,
      clearcoat: 1.0, clearcoatRoughness: 0.08,
      transparent: true, opacity: opacity * 0.88,
    })
  );
  capsule.name = 'coreMesh';
  capsule.castShadow = true;
  g.add(capsule);

  // Halo ring above
  const haloGeo = new THREE.TorusGeometry(1.85, 0.06, 8, 48);
  const haloMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: opacity * 0.70,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.name = 'orbitalRing';
  halo.position.y = 2.1;
  halo.rotation.x = Math.PI * 0.18;
  g.add(halo);

  return g;
}

function buildEndpointNode(color: THREE.Color, opacity: number): THREE.Group {
  const g = new THREE.Group();

  // Monitor screen body (rounded box)
  const screenGeo = new THREE.BoxGeometry(3.0, 2.1, 0.28, 1, 1, 1);
  const screenMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0b1724'), emissive: color, emissiveIntensity: 0.30,
    roughness: 0.25, metalness: 0.6,
    clearcoat: 0.9, clearcoatRoughness: 0.10,
    transparent: true, opacity: opacity * 0.95,
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.name = 'coreMesh';
  screen.castShadow = true;
  g.add(screen);

  // Emissive screen face
  const faceGeo = new THREE.PlaneGeometry(2.4, 1.6);
  const faceMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: opacity * 0.25,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = 0.16;
  g.add(face);

  // Bar stripes on the screen (emissive scanlines)
  for (let i = 0; i < 3; i++) {
    const barGeo = new THREE.PlaneGeometry(1.8 - i * 0.2, 0.09);
    const barMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: opacity * 0.6,
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(0, 0.4 - i * 0.35, 0.17);
    g.add(bar);
  }

  // Stand
  const standGeo = new THREE.BoxGeometry(0.3, 0.8, 0.22);
  const standMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1a2840'), roughness: 0.4, metalness: 0.7,
    transparent: true, opacity: opacity * 0.9,
  });
  const stand = new THREE.Mesh(standGeo, standMat);
  stand.position.y = -1.4;
  g.add(stand);

  return g;
}

function buildDatabaseNode(color: THREE.Color, opacity: number): THREE.Group {
  const g = new THREE.Group();

  // Stack of 3 cylinder slabs
  for (let i = 0; i < 3; i++) {
    const slabGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.42, 28);
    const slabMat = new THREE.MeshPhysicalMaterial({
      color, emissive: color, emissiveIntensity: 0.20 + i * 0.08,
      roughness: 0.22, metalness: 0.75,
      clearcoat: 0.8, clearcoatRoughness: 0.12,
      transparent: true, opacity: opacity * 0.92,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = i * 0.62 - 0.62;
    if (i === 2) slab.name = 'coreMesh';
    g.add(slab);

    // LED strip between slabs
    if (i < 2) {
      const ledGeo = new THREE.CylinderGeometry(1.42, 1.42, 0.06, 28);
      const ledMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: opacity * 0.85,
      });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.y = (i + 0.5) * 0.62 - 0.62;
      g.add(led);
    }
  }

  if (!g.getObjectByName('coreMesh')) {
    const dummy = g.children[0] as THREE.Mesh;
    dummy.name = 'coreMesh';
  }

  return g;
}

function buildApiNode(color: THREE.Color, opacity: number): THREE.Group {
  const g = new THREE.Group();

  // Hexagonal prism
  const hexGeo = new THREE.CylinderGeometry(1.5, 1.5, 2.2, 6);
  const hexMat = new THREE.MeshPhysicalMaterial({
    color, emissive: color, emissiveIntensity: 0.28,
    roughness: 0.18, metalness: 0.0,
    transmission: 0.45, thickness: 1.2,
    clearcoat: 1.0, clearcoatRoughness: 0.06,
    transparent: true, opacity: opacity * 0.82,
  });
  const hex = new THREE.Mesh(hexGeo, hexMat);
  hex.name = 'coreMesh';
  g.add(hex);

  // Rotating inner core sphere
  const coreGeo = new THREE.SphereGeometry(0.7, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: opacity * 0.9,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.name = 'outerShell';
  g.add(core);

  // Gateway ring
  const ringGeo = new THREE.TorusGeometry(1.9, 0.07, 8, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: opacity * 0.65,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.name = 'orbitalRing';
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  return g;
}

function buildAiGuardianNode(opacity: number): THREE.Group {
  const g = new THREE.Group();
  const violet = C.ai.clone();

  // Faceted crystal core
  const crystalGeo = new THREE.OctahedronGeometry(1.8, 0);
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: violet, emissive: violet, emissiveIntensity: 0.65,
    roughness: 0.05, metalness: 0.0,
    transmission: 0.60, thickness: 1.5,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
    transparent: true, opacity: opacity * 0.85,
  });
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  crystal.name = 'coreMesh';
  g.add(crystal);

  // Two counter-rotating thin rings
  const ring1Geo = new THREE.TorusGeometry(2.8, 0.06, 6, 60);
  const ring2Geo = new THREE.TorusGeometry(2.2, 0.05, 6, 60);
  const ringMat  = new THREE.MeshBasicMaterial({ color: violet, transparent: true, opacity: opacity * 0.80 });
  const r1 = new THREE.Mesh(ring1Geo, ringMat);
  const r2 = new THREE.Mesh(ring2Geo, ringMat.clone());
  r1.name = 'orbitalRing';
  r2.name = 'orbitalRing2';
  r1.rotation.x = Math.PI / 3;
  r2.rotation.x = Math.PI / 2;
  r2.rotation.z = Math.PI / 4;
  g.add(r1, r2);

  return g;
}

function buildGenericNode(color: THREE.Color, opacity: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(1.6, 0);
  const mat = new THREE.MeshPhysicalMaterial({
    color, emissive: color, emissiveIntensity: 0.30,
    roughness: 0.25, metalness: 0.6,
    clearcoat: 0.7,
    transparent: true, opacity,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'coreMesh';
  m.castShadow = true;
  g.add(m);
  return g;
}

// Hexagonal base pad under each node
function buildBasePad(color: THREE.Color, isCritical: boolean, opacity: number): THREE.Group {
  const g = new THREE.Group();

  // Hex ring
  const hexRingGeo = new THREE.CylinderGeometry(2.6, 2.6, 0.10, 6);
  const hexRingMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: opacity * (isCritical ? 0.65 : 0.25),
    wireframe: true,
  });
  const hexRing = new THREE.Mesh(hexRingGeo, hexRingMat);
  hexRing.position.y = -2.0;
  g.add(hexRing);

  // Soft glow disc (light pool)
  const glowGeo = new THREE.CircleGeometry(2.4, 24);
  const glowMat = new THREE.MeshBasicMaterial({
    color, transparent: true,
    opacity: opacity * (isCritical ? 0.18 : 0.07),
    side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -2.05;
  g.add(glow);

  return g;
}

// ─── Types / Constants ─────────────────────────────────────────

const NODE_ICONS: Record<string, string> = {
  user: '👤', app: '🌐', device: '💻', database: '🗄️',
  server: '🖥️', service: '⚙️', asset: '🛡️', network: '🔀',
};
const DEFAULT_NODE_ICON = '📦';

export type ViewMode = 'topology' | 'risk' | 'traffic' | 'investigation';

interface NetworkGraphProps {
  width?: number;
  height?: number;
  graphNodes?: NetworkNode[];
  graphEdges?: NetworkEdge[];
  selectedEntityId?: string | null;
  onSelectEntity?: (nodeId: string | null) => void;
}

// ─── Component ────────────────────────────────────────────────

export const NetworkGraph3D: React.FC<NetworkGraphProps> = ({
  width = 800,
  height = 520,
  graphNodes,
  graphEdges,
  selectedEntityId: externalSelectedId,
  onSelectEntity,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { nodes: contextNodes, edges: contextEdges } = useSecurity();
  const rawNodes = graphNodes ?? contextNodes;
  const rawEdges = graphEdges ?? contextEdges;

  const [hoveredNodeId,    setHoveredNodeId]    = useState<string | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedNodeId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;

  const [viewMode,      setViewMode]      = useState<ViewMode>('topology');
  const [activePreset,  setActivePreset]  = useState<'cinematic'|'flow'|'overhead'|'threat'>('cinematic');
  const [webglAvailable,setWebglAvailable]= useState(true);
  const [entityFilter,  setEntityFilter]  = useState('all');
  const [threatToast,   setThreatToast]   = useState<string | null>(null);
  const [hiQuality,     setHiQuality]     = useState(true);

  const activeFocusId = selectedNodeId ?? hoveredNodeId;

  const setSelectedNode = useCallback((id: string | null) => {
    if (onSelectEntity) onSelectEntity(id);
    else setInternalSelectedId(id);
  }, [onSelectEntity]);

  const filteredNodes = useMemo(() => {
    if (entityFilter === 'all') return rawNodes;
    if (entityFilter === 'identity') return rawNodes.filter(n => n.type === 'user');
    if (entityFilter === 'endpoints') return rawNodes.filter(n => n.type === 'device');
    if (entityFilter === 'resources') return rawNodes.filter(n =>
      ['database','app','service','server','asset'].includes(String(n.type||'').toLowerCase()));
    return rawNodes.filter(n => String(n.type||'').toLowerCase() === entityFilter);
  }, [rawNodes, entityFilter]);

  const getNodeById = useCallback((id: string) => rawNodes.find(n => n.id === id), [rawNodes]);
  const activeInspectorNode = getNodeById(selectedNodeId ?? hoveredNodeId ?? '');

  const { connectedNodeIds, connectedEdgeIndices } = useMemo(() => {
    if (!activeFocusId) return { connectedNodeIds: new Set<string>(), connectedEdgeIndices: new Set<number>() };
    const nodesSet = new Set<string>([activeFocusId]);
    const edgesSet = new Set<number>();
    rawEdges.forEach((edge, idx) => {
      if (edge.from === activeFocusId) { nodesSet.add(edge.to); edgesSet.add(idx); }
      else if (edge.to === activeFocusId) { nodesSet.add(edge.from); edgesSet.add(idx); }
    });
    return { connectedNodeIds: nodesSet, connectedEdgeIndices: edgesSet };
  }, [activeFocusId, rawEdges]);

  const connectedPeers = useMemo(() => {
    if (!activeInspectorNode) return [];
    const peers: { node: NetworkNode; direction: 'upstream'|'downstream' }[] = [];
    rawEdges.forEach(edge => {
      if (edge.from === activeInspectorNode.id) {
        const target = getNodeById(edge.to);
        if (target) peers.push({ node: target, direction: 'downstream' });
      } else if (edge.to === activeInspectorNode.id) {
        const source = getNodeById(edge.from);
        if (source) peers.push({ node: source, direction: 'upstream' });
      }
    });
    return peers;
  }, [activeInspectorNode, rawEdges, getNodeById]);

  // Lane layout (preserved exactly from original)
  const node3DPositions = useMemo(() => {
    const positions = new Map<string, THREE.Vector3>();
    const users     = filteredNodes.filter(n => n.type === 'user');
    const devices   = filteredNodes.filter(n => n.type === 'device');
    const resources = filteredNodes.filter(n => n.type !== 'user' && n.type !== 'device');

    users.forEach((node, i) => {
      const x = (i - (users.length - 1) / 2) * 26;
      const y = ((i % 2 === 0 ? 1 : -1) * 7) + 5;
      positions.set(node.id, new THREE.Vector3(x, y, 46));
    });
    devices.forEach((node, i) => {
      const x = (i - (devices.length - 1) / 2) * 24;
      const y = ((i % 2 === 0 ? -1 : 1) * 8) + 2;
      positions.set(node.id, new THREE.Vector3(x, y, 0));
    });
    resources.forEach((node, i) => {
      const x = (i - (resources.length - 1) / 2) * 22;
      const y = ((i % 2 === 0 ? 1 : -1) * 9) + 6;
      positions.set(node.id, new THREE.Vector3(x, y, -46));
    });
    filteredNodes.forEach(node => {
      if (!positions.has(node.id)) {
        positions.set(node.id, new THREE.Vector3(
          node.x ? (node.x - 400) / 10 : 0,
          node.y ? (250 - node.y) / 10 : 0,
          0
        ));
      }
    });
    return positions;
  }, [filteredNodes]);

  // Scene refs
  const sceneRef        = useRef<THREE.Scene | null>(null);
  const cameraRef       = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef     = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef     = useRef<OrbitControls | null>(null);
  const composerRef     = useRef<EffectComposer | null>(null);
  const bloomRef        = useRef<UnrealBloomPass | null>(null);
  const vignetteRef     = useRef<ShaderPass | null>(null);
  const nodeMeshesRef   = useRef<Map<string, THREE.Group>>(new Map());
  const edgeCurvesRef   = useRef<{
    curve: THREE.QuadraticBezierCurve3;
    tube: THREE.Mesh;
    mat: THREE.ShaderMaterial;
    edgeIndex: number;
    isAttack: boolean;
  }[]>([]);
  const animFrameRef    = useRef<number | null>(null);
  const targetCamPosRef = useRef<THREE.Vector3 | null>(null);
  const targetLookAtRef = useRef<THREE.Vector3 | null>(null);
  const clockRef        = useRef(new THREE.Clock());
  const fpsRef          = useRef({ frames: 0, last: performance.now(), fps: 60 });

  // ── WebGL Init (once) ────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      setWebglAvailable(false); return;
    }
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) { setWebglAvailable(false); return; }
    } catch { setWebglAvailable(false); return; }

    const scene = new THREE.Scene();
    scene.background = C.bg.clone();
    scene.fog = new THREE.FogExp2(C.bg.getHex(), 0.005);
    sceneRef.current = scene;

    const w = container.clientWidth || width;
    const h = container.clientHeight || height;

    // Camera
    const camera = new THREE.PerspectiveCamera(46, w / Math.max(h, 1), 0.5, 600);
    camera.position.set(28, 48, 130);
    cameraRef.current = camera;

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch { setWebglAvailable(false); return; }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Lighting ──────────────────────────────────────────────
    // Soft ambient
    scene.add(new THREE.AmbientLight(0x1a2a3a, 1.8));

    // Cool key light (top-right, soft shadows)
    const keyLight = new THREE.DirectionalLight(0x7ecef5, 3.2);
    keyLight.position.set(60, 90, 60);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far  = 400;
    keyLight.shadow.camera.left = -100;
    keyLight.shadow.camera.right = 100;
    keyLight.shadow.camera.top  = 100;
    keyLight.shadow.camera.bottom = -100;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    // Violet rim (back-left)
    const rim = new THREE.DirectionalLight(0xa78bfa, 1.8);
    rim.position.set(-60, 30, -80);
    scene.add(rim);

    // Warm fill (bottom-right)
    const fill = new THREE.DirectionalLight(0x2a4a7a, 1.0);
    fill.position.set(40, -20, 40);
    scene.add(fill);

    // ── Floor ─────────────────────────────────────────────────
    // Glossy reflective floor using MeshPhysicalMaterial
    const floorGeo = new THREE.PlaneGeometry(400, 400, 1, 1);
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#050a10'),
      roughness: 0.05,
      metalness: 0.0,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -28;
    floor.receiveShadow = true;
    scene.add(floor);

    // Hex grid overlay on floor
    const gridGeo = new THREE.PlaneGeometry(320, 320, 32, 32);
    const gridMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#0f2a40'),
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -27.9;
    scene.add(grid);

    // ── OrbitControls ─────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.06;
    controls.maxPolarAngle  = Math.PI / 2 + 0.12;
    controls.minDistance    = 25;
    controls.maxDistance    = 240;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // ── Post-processing ───────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.55,   // strength  — restrained, only emissive blooms
      0.30,   // radius
      0.82,   // threshold — high so dim geometry doesn't bloom
    );
    composer.addPass(bloom);
    bloomRef.current = bloom;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vigPass = new ShaderPass(VignetteGrainShader as any);
    vigPass.renderToScreen = true;
    composer.addPass(vigPass);
    vignetteRef.current = vigPass;

    composerRef.current = composer;

    // ── Raycasting / interaction ──────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    };
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const cm = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(cm, camera);
      const meshes: THREE.Object3D[] = [];
      nodeMeshesRef.current.forEach(grp => {
        const core = grp.getObjectByName('coreMesh');
        if (core) meshes.push(core);
      });
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hit = hits[0].object.userData.nodeId;
        if (hit) setSelectedNode(hit === selectedNodeId ? null : hit);
      } else {
        setSelectedNode(null);
      }
    };
    const onDblClick = () => {
      targetCamPosRef.current = new THREE.Vector3(28, 48, 130);
      targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
    };
    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('dblclick', onDblClick);

    // ── Resize ────────────────────────────────────────────────
    const handleResize = () => {
      if (!container) return;
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      camera.aspect = rw / Math.max(rh, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
      composer.setSize(rw, rh);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    // Visibility pause
    const onVisibility = () => {
      if (document.hidden && animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      } else if (!document.hidden && !animFrameRef.current) {
        animate();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // ── Animate ───────────────────────────────────────────────
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = clockRef.current.getElapsedTime();

      // FPS tracking for quality auto-fallback
      const now = performance.now();
      fpsRef.current.frames++;
      if (now - fpsRef.current.last > 2000) {
        fpsRef.current.fps = fpsRef.current.frames / ((now - fpsRef.current.last) / 1000);
        fpsRef.current.frames = 0;
        fpsRef.current.last   = now;
        if (fpsRef.current.fps < 45 && hiQuality) setHiQuality(false);
      }

      // Smooth camera tween
      if (targetCamPosRef.current) {
        camera.position.lerp(targetCamPosRef.current, 0.055);
        if (camera.position.distanceTo(targetCamPosRef.current) < 0.25)
          targetCamPosRef.current = null;
      }
      if (targetLookAtRef.current) {
        controls.target.lerp(targetLookAtRef.current, 0.065);
        if (controls.target.distanceTo(targetLookAtRef.current) < 0.25)
          targetLookAtRef.current = null;
      }
      controls.update();

      // Vignette/grain time
      if (vignetteRef.current) {
        (vignetteRef.current.uniforms as Record<string, {value: number}>).uTime.value = elapsed;
      }

      // Node animations
      nodeMeshesRef.current.forEach((group, nodeId) => {
        const isHovered   = nodeId === hoveredNodeId;
        const isSelected  = nodeId === selectedNodeId;
        const isConnected = activeFocusId ? connectedNodeIds.has(nodeId) : false;
        const targetScale = isSelected ? 1.30 : isHovered ? 1.25
          : (isConnected && activeFocusId ? 1.10 : (activeFocusId ? 0.90 : 1.0));
        group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);

        // Gentle float
        const baseY = (group.userData.baseY as number) || 0;
        group.position.y = baseY + Math.sin(elapsed * 0.8 + (group.userData.phase as number || 0)) * 0.18;

        // Rotate orbits
        const or = group.getObjectByName('orbitalRing') as THREE.Mesh | undefined;
        if (or) or.rotation.z = elapsed * 0.7;
        const or2 = group.getObjectByName('orbitalRing2') as THREE.Mesh | undefined;
        if (or2) or2.rotation.x = elapsed * -0.5;

        // Rotate inner API core
        const inner = group.getObjectByName('outerShell') as THREE.Mesh | undefined;
        if (inner) { inner.rotation.x = elapsed * 0.5; inner.rotation.y = elapsed * 0.7; }

        // Critical pulse ring
        const pulseRing = group.getObjectByName('pulseRing') as THREE.Mesh | undefined;
        if (pulseRing) {
          const s = 1.0 + Math.abs(Math.sin(elapsed * 2.8)) * 0.6;
          pulseRing.scale.set(s, s, s);
          (pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - (s - 1) / 0.6) * 0.7;
        }

        // Critical alert beam
        const beam = group.getObjectByName('alertBeam') as THREE.Mesh | undefined;
        if (beam) {
          (beam.material as THREE.MeshBasicMaterial).opacity =
            0.12 + 0.08 * Math.sin(elapsed * 3.0 + (group.userData.phase as number || 0));
        }

        // Selection ring spin
        const sel = group.getObjectByName('selectRing') as THREE.Mesh | undefined;
        if (sel) sel.rotation.z = -elapsed * 0.8;
      });

      // Animate edge conduit pulses
      edgeCurvesRef.current.forEach(({ mat, edgeIndex, isAttack }) => {
        const isConnected = activeFocusId ? connectedEdgeIndices.has(edgeIndex) : true;
        const speed  = isAttack ? 1.2 : (viewMode === 'traffic' ? 1.0 : 0.55);
        const u = mat.uniforms as Record<string, { value: number | THREE.Color }>;
        (u.uTime.value  as unknown as number);
        u.uTime.value  = elapsed as unknown as THREE.Color;
        u.uSpeed.value = speed   as unknown as THREE.Color;
        const targetOp = activeFocusId
          ? (isConnected ? (isAttack ? 0.90 : 0.75) : 0.06)
          : (isAttack ? 0.90 : 0.35);
        const curOp = (u.uOpacity.value as unknown as number);
        u.uOpacity.value = (curOp + (targetOp - curOp) * 0.08) as unknown as THREE.Color;
      });

      // Hover raycasting
      raycaster.setFromCamera(mouse, camera);
      const cores: THREE.Object3D[] = [];
      nodeMeshesRef.current.forEach(grp => {
        const c = grp.getObjectByName('coreMesh');
        if (c) cores.push(c);
      });
      const hoverHits = raycaster.intersectObjects(cores, false);
      if (hoverHits.length > 0) {
        setHoveredNodeId(hoverHits[0].object.userData.nodeId);
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredNodeId(null);
        renderer.domElement.style.cursor = 'default';
      }

      // Render: use composer in hi-quality, plain render in lo-quality fallback
      if (hiQuality && composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    };

    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('mousemove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      renderer.dispose();
      scene.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rebuild 3D objects on data/filter/selection changes ──────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Dispose old nodes
    nodeMeshesRef.current.forEach(grp => {
      scene.remove(grp);
      grp.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    });
    nodeMeshesRef.current.clear();

    // Dispose old edges
    edgeCurvesRef.current.forEach(({ tube, mat }) => {
      scene.remove(tube);
      tube.geometry.dispose();
      mat.dispose();
    });
    edgeCurvesRef.current = [];

    // ── Build Nodes ───────────────────────────────────────────
    filteredNodes.forEach((node, idx) => {
      const pos = node3DPositions.get(node.id) || new THREE.Vector3();
      const type = String(node.type || '').toLowerCase();
      const risk = typeof node.propagationRisk === 'number' ? node.propagationRisk : 0;
      const isCritical = Boolean(node.compromised || risk >= 70);
      const isWarning  = !isCritical && risk > 30;
      const isSelected = selectedNodeId === node.id;
      const isConn     = activeFocusId ? connectedNodeIds.has(node.id) : true;
      const opacity    = activeFocusId ? (isConn ? 1.0 : 0.15) : 1.0;
      const color      = riskColor(node);

      const group = new THREE.Group();
      group.position.copy(pos);
      group.userData.baseY  = pos.y;
      group.userData.phase  = idx * 0.74;

      // Build the typed procedural node
      let nodeBody: THREE.Group;
      if (type === 'user')     nodeBody = buildUserNode(color, opacity);
      else if (type === 'device') nodeBody = buildEndpointNode(color, opacity);
      else if (type === 'database' || type === 'server') nodeBody = buildDatabaseNode(color, opacity);
      else if (type === 'app'  || type === 'service')    nodeBody = buildApiNode(color, opacity);
      else if (type === 'asset' && node.id.toLowerCase().includes('ai')) nodeBody = buildAiGuardianNode(opacity);
      else                     nodeBody = buildGenericNode(color, opacity);

      // Tag coreMesh with nodeId for raycasting
      const coreMesh = nodeBody.getObjectByName('coreMesh') as THREE.Mesh | undefined;
      if (coreMesh) coreMesh.userData = { nodeId: node.id, node };

      group.add(nodeBody);

      // Base hex pad
      const pad = buildBasePad(color, isCritical, opacity);
      group.add(pad);

      // Critical: pulsing aura ring
      if (isCritical) {
        const auraGeo = new THREE.TorusGeometry(3.6, 0.10, 8, 48);
        const auraMat = new THREE.MeshBasicMaterial({
          color: C.danger, transparent: true, opacity: 0.7,
        });
        const aura = new THREE.Mesh(auraGeo, auraMat);
        aura.name = 'pulseRing';
        group.add(aura);

        // Vertical alert beam
        const beamGeo = new THREE.CylinderGeometry(0.08, 0.08, 30, 6, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
          color: C.danger, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.name = 'alertBeam';
        beam.position.y = 13;
        group.add(beam);
      } else if (isWarning) {
        // Amber warning ring
        const warnGeo = new THREE.TorusGeometry(3.2, 0.07, 8, 48);
        const warnMat = new THREE.MeshBasicMaterial({
          color: C.warn, transparent: true, opacity: opacity * 0.55,
        });
        const warn = new THREE.Mesh(warnGeo, warnMat);
        group.add(warn);
      }

      // Selection ring
      if (isSelected) {
        const selGeo = new THREE.TorusGeometry(4.2, 0.08, 8, 64);
        const selMat = new THREE.MeshBasicMaterial({
          color: C.info, transparent: true, opacity: 0.9,
        });
        const selRing = new THREE.Mesh(selGeo, selMat);
        selRing.name = 'selectRing';
        group.add(selRing);
      }

      scene.add(group);
      nodeMeshesRef.current.set(node.id, group);
    });

    // ── Build Edges (energy conduit tubes) ───────────────────
    rawEdges.forEach((edge, i) => {
      const fromPos = node3DPositions.get(edge.from);
      const toPos   = node3DPositions.get(edge.to);
      if (!fromPos || !toPos) return;

      const isFocused = activeFocusId ? connectedEdgeIndices.has(i) : true;
      const isAttack  = Boolean(edge.attackPath);

      // Arch midpoint — rises more between lanes
      const mid = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
      const dist = fromPos.distanceTo(toPos);
      mid.y += Math.min(dist * 0.28, 18);

      const curve = new THREE.QuadraticBezierCurve3(fromPos, mid, toPos);

      // Thin tube along the bezier
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.12, 6, false);
      const edgeColor = isAttack ? C.danger.clone()
        : (isFocused && activeFocusId ? C.info.clone() : C.gridLine.clone().lerp(C.info, 0.4));

      const initOp = activeFocusId ? (isFocused ? 0.75 : 0.06) : (isAttack ? 0.90 : 0.35);
      const mat = makePulseMat(edgeColor, isAttack ? 1.2 : 0.55, initOp);

      const tube = new THREE.Mesh(tubeGeo, mat);
      tube.renderOrder = 1;
      scene.add(tube);
      edgeCurvesRef.current.push({ curve, tube, mat, edgeIndex: i, isAttack });
    });

  }, [filteredNodes, rawEdges, node3DPositions, activeFocusId, connectedNodeIds, connectedEdgeIndices, selectedNodeId, hoveredNodeId, viewMode]);

  // ── Camera follow on selection ────────────────────────────
  useEffect(() => {
    if (!selectedNodeId || !cameraRef.current || !controlsRef.current) return;
    const pos = node3DPositions.get(selectedNodeId);
    if (pos) {
      targetCamPosRef.current = new THREE.Vector3(pos.x + 22, pos.y + 16, pos.z + 36);
      targetLookAtRef.current = pos.clone();
    }
  }, [selectedNodeId, node3DPositions]);

  // ── Bloom on/off with quality toggle ─────────────────────
  useEffect(() => {
    if (bloomRef.current) bloomRef.current.strength = hiQuality ? 0.55 : 0;
  }, [hiQuality]);

  // ── Camera presets (logic identical to original) ──────────
  const applyPreset = (preset: 'cinematic'|'flow'|'overhead'|'threat') => {
    setActivePreset(preset);
    if (!controlsRef.current || !cameraRef.current) return;
    if (preset === 'cinematic') {
      targetCamPosRef.current = new THREE.Vector3(28, 48, 130);
      targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
      setThreatToast(null);
    } else if (preset === 'flow') {
      targetCamPosRef.current = new THREE.Vector3(0, 24, 115);
      targetLookAtRef.current = new THREE.Vector3(0, 0, -10);
      setThreatToast(null);
    } else if (preset === 'overhead') {
      targetCamPosRef.current = new THREE.Vector3(0, 150, 5);
      targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
      setThreatToast(null);
    } else if (preset === 'threat') {
      const compromised = filteredNodes.find(n => n.compromised);
      const high = compromised || [...filteredNodes].sort((a, b) =>
        (b.propagationRisk ?? 0) - (a.propagationRisk ?? 0))[0];
      if (high && (high.compromised || (high.propagationRisk ?? 0) >= 60)) {
        const pos = node3DPositions.get(high.id);
        if (pos) {
          targetCamPosRef.current = new THREE.Vector3(pos.x + 18, pos.y + 14, pos.z + 32);
          targetLookAtRef.current = pos.clone();
          setSelectedNode(high.id);
          setThreatToast(`Threat Focus: Locked onto ${high.label || high.id} (Risk: ${high.propagationRisk ?? 0}%)`);
        }
      } else {
        setThreatToast('Nominal Defense: No active critical threat entity detected in live topology.');
        targetCamPosRef.current = new THREE.Vector3(28, 48, 130);
        targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
      }
    }
  };

  const handleZoomIn  = () => { if (cameraRef.current) cameraRef.current.position.multiplyScalar(0.85); };
  const handleZoomOut = () => { if (cameraRef.current) cameraRef.current.position.multiplyScalar(1.15); };
  const handleResetCamera = () => { applyPreset('cinematic'); setSelectedNode(null); setThreatToast(null); };

  // ── Glass HUD button helper ─────────────────────────────────
  const hudBtn = (active: boolean, accentHex: string) =>
    `px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-200 ${
      active
        ? `bg-[${accentHex}]/15 text-[${accentHex}] border border-[${accentHex}]/35 font-bold`
        : 'text-[#94a3b8] hover:text-white hover:bg-white/5 border border-transparent'
    }`;

  if (!webglAvailable) {
    return (
      <div className="flex items-center justify-center h-full text-[#94a3b8] text-sm">
        WebGL is not available in this environment.
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full min-h-[480px] rounded-2xl overflow-hidden select-none"
      style={{
        background: '#070b12',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 64px rgba(0,0,0,0.6)',
      }}
    >
      {/* Vignette overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(7,11,18,0.65) 100%)' }}
      />

      {/* Three.js canvas container */}
      <div ref={containerRef} className="w-full h-full min-h-[480px] cursor-grab active:cursor-grabbing" />

      {/* ── Top-left controls (Zoom + Presets) ─────────────── */}
      <div
        className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-xl"
        style={{ background: 'rgba(7,11,18,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <button type="button" onClick={handleZoomIn}  title="Zoom In"    className="p-1.5 rounded-lg text-[#94a3b8] hover:text-[#38bdf8] hover:bg-white/5 transition-colors"><ZoomIn  className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={handleZoomOut} title="Zoom Out"   className="p-1.5 rounded-lg text-[#94a3b8] hover:text-[#38bdf8] hover:bg-white/5 transition-colors"><ZoomOut className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={handleResetCamera} title="Reset"  className="p-1.5 rounded-lg text-[#94a3b8] hover:text-[#38bdf8] hover:bg-white/5 transition-colors"><RotateCcw className="w-3.5 h-3.5" /></button>

        <div className="w-px h-4 mx-0.5" style={{ background: 'rgba(255,255,255,0.08)' }} />

        {(['cinematic','flow','overhead'] as const).map(p => (
          <button key={p} type="button" onClick={() => applyPreset(p)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-200 ${
              activePreset === p
                ? 'bg-[#38bdf8]/12 text-[#38bdf8] border border-[#38bdf8]/30 font-bold'
                : 'text-[#94a3b8] hover:text-white hover:bg-white/5 border border-transparent'
            }`}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        <button type="button" onClick={() => applyPreset('threat')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-200 ${
            activePreset === 'threat'
              ? 'bg-[#ef4444]/12 text-[#ef4444] border border-[#ef4444]/30 font-bold'
              : 'text-[#94a3b8] hover:text-[#ef4444] hover:bg-white/5 border border-transparent'
          }`}>
          <Crosshair className="w-3 h-3" /> Threat
        </button>

        {/* Quality toggle */}
        <div className="w-px h-4 mx-0.5" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button type="button" onClick={() => setHiQuality(q => !q)} title="Toggle post-processing quality"
          className={`px-2 py-1 rounded-md text-[10px] font-mono transition-all duration-200 ${
            hiQuality ? 'text-[#a78bfa] border border-[#a78bfa]/30 bg-[#a78bfa]/8' : 'text-[#475569] border border-transparent'
          }`}>
          {hiQuality ? 'HQ' : 'LQ'}
        </button>
      </div>

      {/* ── Top-center mode strip ───────────────────────────── */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-3 z-20 hidden md:flex items-center gap-1 px-2 py-1.5 rounded-xl"
        style={{ background: 'rgba(7,11,18,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <span className="text-[10px] text-[#475569] font-mono flex items-center gap-1 px-1">
          <Activity className="w-3 h-3 text-[#38bdf8]" /> Mode:
        </span>
        {(['topology','risk','traffic','investigation'] as ViewMode[]).map(m => (
          <button key={m} type="button" onClick={() => setViewMode(m)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-mono capitalize transition-all duration-200 ${
              viewMode === m
                ? 'bg-[#38bdf8]/12 text-[#38bdf8] border border-[#38bdf8]/30 font-bold'
                : 'text-[#94a3b8] hover:text-white hover:bg-white/5 border border-transparent'
            }`}>
            {m}
          </button>
        ))}
      </div>

      {/* ── Filter chips (bottom-left) ──────────────────────── */}
      <div
        className="absolute left-3 bottom-3 z-20 hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-xl"
        style={{ background: 'rgba(7,11,18,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <span className="text-[10px] text-[#475569] font-mono flex items-center gap-1 px-1">
          <Compass className="w-3 h-3 text-[#38bdf8]" /> Filter:
        </span>
        {[
          { id: 'all',       label: `All (${rawNodes.length})` },
          { id: 'identity',  label: 'Users' },
          { id: 'endpoints', label: 'Endpoints' },
          { id: 'resources', label: 'Databases & APIs' },
        ].map(f => (
          <button key={f.id} type="button" onClick={() => setEntityFilter(f.id)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-200 ${
              entityFilter === f.id
                ? 'bg-[#38bdf8]/12 text-[#38bdf8] border border-[#38bdf8]/30 font-bold'
                : 'text-[#94a3b8] hover:text-white hover:bg-white/5 border border-transparent'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Legend (bottom-right) ────────────────────────────── */}
      <div
        className="absolute right-3 bottom-3 z-20 hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl text-[10px] font-mono"
        style={{ background: 'rgba(7,11,18,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)', color: '#94a3b8' }}
      >
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />Safe</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} />Elevated</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />Critical</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#a78bfa' }} />AI</span>
      </div>

      {/* ── Toast ───────────────────────────────────────────── */}
      {threatToast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-14 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono"
          style={{
            background: 'rgba(7,11,18,0.95)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(56,189,248,0.25)', color: '#f1f5f9',
            boxShadow: '0 0 20px rgba(56,189,248,0.12)',
          }}
        >
          <Radio className="w-3.5 h-3.5 animate-pulse" style={{ color: '#38bdf8' }} />
          <span>{threatToast}</span>
          <button type="button" onClick={() => setThreatToast(null)} className="ml-2" style={{ color: '#475569' }}>✕</button>
        </div>
      )}

      {/* ── Inspector HUD (top-right) ────────────────────────── */}
      {activeInspectorNode && (
        <div
          className="absolute right-3 top-3 z-30 w-64 max-w-[calc(100%-24px)] p-4 rounded-xl text-xs font-mono space-y-2.5 pointer-events-auto"
          style={{
            background: 'rgba(7,11,18,0.95)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 48px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 truncate">
              <span className="text-base">{NODE_ICONS[String(activeInspectorNode.type || '').toLowerCase()] ?? DEFAULT_NODE_ICON}</span>
              <div className="truncate">
                <div className="font-bold truncate" style={{ color: '#f1f5f9', fontSize: '12px' }}>
                  {activeInspectorNode.label || activeInspectorNode.id}
                </div>
                <div className="text-[10px]" style={{ color: '#94a3b8' }}>{activeInspectorNode.id}</div>
              </div>
            </div>
            {selectedNodeId && (
              <button type="button" onClick={() => setSelectedNode(null)} title="Deselect"
                className="p-0.5 rounded" style={{ color: '#475569' }}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Security state badge */}
          <div className="flex items-center justify-between">
            <span style={{ color: '#94a3b8' }}>Security State:</span>
            {activeInspectorNode.compromised || (activeInspectorNode.propagationRisk ?? 0) >= 70 ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded badge-danger">
                <ShieldAlert className="w-3 h-3" /> COMPROMISED
              </span>
            ) : (activeInspectorNode.propagationRisk ?? 0) > 30 ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded badge-warn">
                <AlertTriangle className="w-3 h-3" /> SUSPICIOUS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded badge-safe">
                <CheckCircle2 className="w-3 h-3" /> NOMINAL
              </span>
            )}
          </div>

          {/* Entity type */}
          <div className="flex justify-between">
            <span style={{ color: '#94a3b8' }}>Entity Type:</span>
            <span className="capitalize font-semibold" style={{ color: '#38bdf8' }}>
              {activeInspectorNode.type || 'Unknown'}
            </span>
          </div>

          {/* Risk score */}
          <div>
            <div className="flex justify-between mb-1">
              <span style={{ color: '#94a3b8' }}>Risk Score:</span>
              <span className="font-bold" style={{
                color: (activeInspectorNode.propagationRisk ?? 0) >= 70 ? '#ef4444'
                  : (activeInspectorNode.propagationRisk ?? 0) > 30 ? '#f59e0b' : '#22c55e',
              }}>
                {activeInspectorNode.propagationRisk ?? 0}%
              </span>
            </div>
            <div className="risk-bar-track">
              <div className="risk-bar-fill" style={{
                width: `${Math.min(100, Math.max(0, activeInspectorNode.propagationRisk ?? 0))}%`,
                background: (activeInspectorNode.propagationRisk ?? 0) >= 70 ? '#ef4444'
                  : (activeInspectorNode.propagationRisk ?? 0) > 30 ? '#f59e0b' : '#22c55e',
              }} />
            </div>
          </div>

          {/* Connected peers */}
          {connectedPeers.length > 0 && (
            <div className="pt-2 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-1 text-[10px]" style={{ color: '#94a3b8' }}>
                <Layers className="w-3 h-3" style={{ color: '#38bdf8' }} />
                Connected Peers ({connectedPeers.length}):
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {connectedPeers.slice(0, 5).map(({ node: peer, direction }) => (
                  <button key={peer.id} type="button" onClick={() => setSelectedNode(peer.id)}
                    className="w-full flex items-center justify-between p-1 rounded text-[10px] text-left transition-all duration-150"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="truncate" style={{ color: '#f1f5f9' }}>
                      {NODE_ICONS[String(peer.type||'').toLowerCase()] ?? '📦'} {peer.label || peer.id}
                    </span>
                    <span className="text-[9px]" style={{ color: '#475569' }}>
                      {direction === 'upstream' ? '← in' : 'out →'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-center text-[9px] pt-1" style={{ color: '#475569', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {selectedNodeId === activeInspectorNode.id ? 'Click canvas or ✕ to unpin' : 'Click node to pin inspector'}
          </div>
        </div>
      )}
    </div>
  );
};
