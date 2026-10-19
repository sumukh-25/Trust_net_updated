import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useSecurity } from '@/store/securityStore';
import { NetworkNode, NetworkEdge } from '@/data/mockData';
import {
  ZoomIn, ZoomOut, RotateCcw, ShieldAlert, CheckCircle2,
  AlertTriangle, Layers, X, Compass, Activity, Crosshair, ArrowRight,
  Sparkles, Radio, Eye
} from 'lucide-react';

const NODE_ICONS: Record<string, string> = {
  user: '👤',
  app: '🌐',
  device: '💻',
  database: '🗄️',
  server: '🖥️',
  service: '⚙️',
  asset: '🛡️',
  network: '🔀',
};

const DEFAULT_NODE_ICON = '📦';

// Operation Blacksite — Semantic Cybersecurity Palette
const BLACKSITE = {
  // Foundations & Surfaces
  sceneFoundation: 0x050810, // Absolute scene foundation
  deepBackground: 0x080D18,  // Deep background
  atmosRegion: 0x0B1220,     // Secondary atmospheric region
  primarySurface: 0x0E1726,  // Primary surface
  elevatedSurface: 0x131F31, // Elevated surface
  selectedSurface: 0x19283B, // Selected surface
  structuralBorder: 0x27364B,// Structural borders
  quietDivider: 0x1B293A,    // Quiet dividers

  // Core Identity Colours
  iceBlue: 0x4DA3FF,         // Primary electric ice blue (infrastructure & network)
  highEnergyCyan: 0x31E6F7,  // High-energy cyan (active selection & interactive focus)
  precisionAqua: 0x59D9D0,   // Precision aqua
  aiViolet: 0x9A8CFF,        // AI intelligence violet
  healthyGreen: 0x46E6A5,    // Healthy system green
  investigationAmber: 0xFFBD59, // Investigation amber
  highSeverityRed: 0xFF4D6D, // High-severity red
  criticalRed: 0xFF304F,     // Critical emergency red

  // Entity Type Defaults
  user: 0x4DA3FF,            // Electric Ice Blue for Users
  device: 0x59D9D0,          // Precision Aqua for Endpoints
  database: 0x46E6A5,        // Healthy Green for Data Assets
  app: 0x9A8CFF,             // AI / Application Violet
  service: 0x31E6F7,         // High-Energy Cyan
  server: 0x4DA3FF,
  asset: 0x59D9D0,
  default: 0xA3B3C9,         // Cool Slate
};

export type ViewMode = 'topology' | 'risk' | 'traffic' | 'investigation';

interface NetworkGraphProps {
  width?: number;
  height?: number;
  graphNodes?: NetworkNode[];
  graphEdges?: NetworkEdge[];
  selectedEntityId?: string | null;
  onSelectEntity?: (nodeId: string | null) => void;
}

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

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedNodeId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;

  const [viewMode, setViewMode] = useState<ViewMode>('topology');
  const [activePreset, setActivePreset] = useState<'cinematic' | 'flow' | 'overhead' | 'threat'>('cinematic');
  const [webglAvailable, setWebglAvailable] = useState<boolean>(true);
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [threatToast, setThreatToast] = useState<string | null>(null);

  const activeFocusId = selectedNodeId ?? hoveredNodeId;

  const setSelectedNode = useCallback((id: string | null) => {
    if (onSelectEntity) {
      onSelectEntity(id);
    } else {
      setInternalSelectedId(id);
    }
  }, [onSelectEntity]);

  // Filter nodes based on selected chip
  const filteredNodes = useMemo(() => {
    if (entityFilter === 'all') return rawNodes;
    if (entityFilter === 'identity') return rawNodes.filter(n => n.type === 'user');
    if (entityFilter === 'endpoints') return rawNodes.filter(n => n.type === 'device');
    if (entityFilter === 'resources') return rawNodes.filter(n => ['database', 'app', 'service', 'server', 'asset'].includes(String(n.type || '').toLowerCase()));
    return rawNodes.filter(n => String(n.type || '').toLowerCase() === entityFilter);
  }, [rawNodes, entityFilter]);

  const getNodeById = useCallback((id: string) => rawNodes.find(n => n.id === id), [rawNodes]);
  const activeInspectorNode = getNodeById(selectedNodeId ?? hoveredNodeId ?? '');

  // Connected nodes & edges calculation
  const { connectedNodeIds, connectedEdgeIndices } = useMemo(() => {
    if (!activeFocusId) {
      return { connectedNodeIds: new Set<string>(), connectedEdgeIndices: new Set<number>() };
    }
    const nodesSet = new Set<string>([activeFocusId]);
    const edgesSet = new Set<number>();

    rawEdges.forEach((edge, idx) => {
      if (edge.from === activeFocusId) {
        nodesSet.add(edge.to);
        edgesSet.add(idx);
      } else if (edge.to === activeFocusId) {
        nodesSet.add(edge.from);
        edgesSet.add(idx);
      }
    });

    return { connectedNodeIds: nodesSet, connectedEdgeIndices: edgesSet };
  }, [activeFocusId, rawEdges]);

  // Connected peers list for inspector HUD
  const connectedPeers = useMemo(() => {
    if (!activeInspectorNode) return [];
    const peers: { node: NetworkNode; direction: 'upstream' | 'downstream' }[] = [];
    rawEdges.forEach((edge) => {
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

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const nodeMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const edgeCurvesRef = useRef<{ curve: THREE.QuadraticBezierCurve3; packet: THREE.Mesh; edgeIndex: number; isAttack: boolean }[]>([]);
  const edgeLinesRef = useRef<THREE.Line[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const targetCamPosRef = useRef<THREE.Vector3 | null>(null);
  const targetLookAtRef = useRef<THREE.Vector3 | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const radarRingsRef = useRef<THREE.Group | null>(null);

  // Compute 3D Positions for Nodes: Spatial Layered Arrangement
  const node3DPositions = useMemo(() => {
    const positions = new Map<string, THREE.Vector3>();
    const users = filteredNodes.filter(n => n.type === 'user');
    const devices = filteredNodes.filter(n => n.type === 'device');
    const resources = filteredNodes.filter(n => n.type !== 'user' && n.type !== 'device');

    // Layer 1: Identity / Users (Foreground Z = +46)
    users.forEach((node, i) => {
      const x = (i - (users.length - 1) / 2) * 26;
      const y = ((i % 2 === 0 ? 1 : -1) * 7) + 5;
      const z = 46;
      positions.set(node.id, new THREE.Vector3(x, y, z));
    });

    // Layer 2: Endpoint Gateways / Devices (Midground Z = 0)
    devices.forEach((node, i) => {
      const x = (i - (devices.length - 1) / 2) * 24;
      const y = ((i % 2 === 0 ? -1 : 1) * 8) + 2;
      const z = 0;
      positions.set(node.id, new THREE.Vector3(x, y, z));
    });

    // Layer 3: Protected Core Services & Databases (Background Z = -46)
    resources.forEach((node, i) => {
      const x = (i - (resources.length - 1) / 2) * 22;
      const y = ((i % 2 === 0 ? 1 : -1) * 9) + 6;
      const z = -46;
      positions.set(node.id, new THREE.Vector3(x, y, z));
    });

    // Fallback for any other entities
    filteredNodes.forEach((node) => {
      if (!positions.has(node.id)) {
        const x = (node.x ? (node.x - 400) / 10 : 0);
        const y = (node.y ? (250 - node.y) / 10 : 0);
        positions.set(node.id, new THREE.Vector3(x, y, 0));
      }
    });

    return positions;
  }, [filteredNodes]);

  // Main Three.js Initialization
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Gracefully handle headless test environments
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      setWebglAvailable(false);
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      if (typeof canvas.getContext !== 'function') {
        setWebglAvailable(false);
        return;
      }
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebglAvailable(false);
        return;
      }
    } catch {
      setWebglAvailable(false);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BLACKSITE.sceneFoundation);
    scene.fog = new THREE.FogExp2(BLACKSITE.sceneFoundation, 0.0055);
    sceneRef.current = scene;

    const initialWidth = container.clientWidth || width;
    const initialHeight = container.clientHeight || height;

    const camera = new THREE.PerspectiveCamera(46, initialWidth / Math.max(initialHeight, 1), 0.5, 600);
    camera.position.set(28, 48, 130);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglAvailable(false);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initialWidth, initialHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.12;
    controls.minDistance = 25;
    controls.maxDistance = 240;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lighting Design
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    // Key Light: High-Energy Cyan from Top-Right
    const keyLight = new THREE.DirectionalLight(BLACKSITE.highEnergyCyan, 2.2);
    keyLight.position.set(50, 75, 45);
    scene.add(keyLight);

    // Fill Light: Electric Ice Blue from Opposite Depth
    const fillLight = new THREE.DirectionalLight(BLACKSITE.iceBlue, 1.6);
    fillLight.position.set(-50, -25, -45);
    scene.add(fillLight);

    // Soft Rim Light from Back
    const rimLight = new THREE.DirectionalLight(BLACKSITE.aiViolet, 0.9);
    rimLight.position.set(0, 40, -80);
    scene.add(rimLight);

    // Dual-Layer Spatial Grid Planes
    // 1. Primary Structural Grid at Y = -26
    const primaryGrid = new THREE.GridHelper(260, 36, BLACKSITE.structuralBorder, BLACKSITE.quietDivider);
    primaryGrid.position.y = -26;
    (primaryGrid.material as THREE.Material).transparent = true;
    (primaryGrid.material as THREE.Material).opacity = 0.45;
    scene.add(primaryGrid);

    // 2. Concentric Tactical Radar Scanning Rings
    const radarGroup = new THREE.Group();
    radarGroup.position.set(0, -25.8, 0);
    [32, 64, 96, 128].forEach((radius, i) => {
      const ringGeo = new THREE.RingGeometry(radius - 0.35, radius + 0.35, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? BLACKSITE.iceBlue : BLACKSITE.structuralBorder,
        transparent: true,
        opacity: 0.18 - i * 0.03,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      radarGroup.add(ringMesh);
    });
    scene.add(radarGroup);
    radarRingsRef.current = radarGroup;

    // 3. Sparse 3D Telemetry Ambient Particles (Natural Deep Space Drift)
    const particleCount = 140;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 240;
      particlePositions[i + 1] = (Math.random() - 0.5) * 80 + 10;
      particlePositions[i + 2] = (Math.random() - 0.5) * 220;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: BLACKSITE.iceBlue,
      size: 1.2,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
    particlesRef.current = particleSystem;

    // Raycasting for Mouse Hover & Selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const clickMouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(clickMouse, camera);
      const meshes: THREE.Object3D[] = [];
      nodeMeshesRef.current.forEach(grp => {
        const core = grp.getObjectByName('coreMesh');
        if (core) meshes.push(core);
      });
      const intersects = raycaster.intersectObjects(meshes, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object.userData.nodeId;
        if (hit) setSelectedNode(hit === selectedNodeId ? null : hit);
      } else {
        setSelectedNode(null);
      }
    };

    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    // Responsive Resize Handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation & Render Loop
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth camera interpolation towards target position & lookAt
      if (targetCamPosRef.current && camera) {
        camera.position.lerp(targetCamPosRef.current, 0.055);
        if (camera.position.distanceTo(targetCamPosRef.current) < 0.25) {
          targetCamPosRef.current = null;
        }
      }
      if (targetLookAtRef.current && controls) {
        controls.target.lerp(targetLookAtRef.current, 0.065);
        if (controls.target.distanceTo(targetLookAtRef.current) < 0.25) {
          targetLookAtRef.current = null;
        }
      }

      controls.update();

      // Slowly rotate tactical radar ground rings
      if (radarRingsRef.current) {
        radarRingsRef.current.rotation.y = elapsedTime * 0.04;
      }

      // Slowly drift ambient space particles
      if (particlesRef.current) {
        particlesRef.current.rotation.y = elapsedTime * 0.015;
      }

      // Dynamic Node Scaling & Emissive Interpolation
      nodeMeshesRef.current.forEach((group, nodeId) => {
        const isHovered = nodeId === hoveredNodeId;
        const isSelected = nodeId === selectedNodeId;
        const isConnected = activeFocusId ? connectedNodeIds.has(nodeId) : false;

        // Smoothly interpolate scale: 1.25x on hover, 1.30x on select
        const targetScale = isSelected ? 1.30 : isHovered ? 1.25 : (isConnected && activeFocusId ? 1.10 : (activeFocusId ? 0.90 : 1.0));
        group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);

        // Rotate Outer Geometric Shells
        const outerShell = group.getObjectByName('outerShell');
        if (outerShell) {
          outerShell.rotation.x = elapsedTime * 0.35;
          outerShell.rotation.y = elapsedTime * 0.5;
        }

        // Rotate Orbital Ring for User Identity nodes
        const orbitalRing = group.getObjectByName('orbitalRing');
        if (orbitalRing) {
          orbitalRing.rotation.z = elapsedTime * 0.7;
        }

        // Threat Pulse Beacon
        const threatBeacon = group.getObjectByName('threatBeacon');
        if (threatBeacon) {
          const s = 1.0 + Math.sin(elapsedTime * 4.0) * 0.3;
          threatBeacon.scale.set(s, s, s);
        }

        // Selection Reticle Pulse
        const selectRing = group.getObjectByName('selectRing');
        if (selectRing) {
          selectRing.rotation.z = -elapsedTime * 0.8;
        }
      });

      // Animate Moving Directional Packets along 3D Bezier Curves
      edgeCurvesRef.current.forEach(({ curve, packet, edgeIndex, isAttack }) => {
        const isConnected = activeFocusId ? connectedEdgeIndices.has(edgeIndex) : true;
        const speed = isAttack ? 0.8 : (viewMode === 'traffic' ? 0.9 : 0.5);
        const offset = (edgeIndex * 0.23);
        const t = (elapsedTime * speed + offset) % 1.0;

        packet.position.copy(curve.getPoint(t));

        // Scale packet on active connection
        if (isConnected || isAttack || viewMode === 'traffic') {
          packet.visible = true;
          const pulse = 1.0 + Math.sin(elapsedTime * 6.0) * 0.2;
          packet.scale.set(pulse, pulse, pulse);
        } else {
          packet.visible = activeFocusId ? false : true;
        }
      });

      // Raycast Hover Hit-Testing
      raycaster.setFromCamera(mouse, camera);
      const interactiveCores: THREE.Object3D[] = [];
      nodeMeshesRef.current.forEach(grp => {
        const core = grp.getObjectByName('coreMesh');
        if (core) interactiveCores.push(core);
      });
      const hits = raycaster.intersectObjects(interactiveCores, false);
      if (hits.length > 0) {
        const hoveredId = hits[0].object.userData.nodeId;
        setHoveredNodeId(hoveredId);
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredNodeId(null);
        renderer.domElement.style.cursor = 'default';
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('mousemove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.dispose();
      scene.clear();
    };
  }, []);

  // Update 3D Node & Edge Meshes when data, mode, or focus changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous node groups & edges
    nodeMeshesRef.current.forEach(grp => scene.remove(grp));
    nodeMeshesRef.current.clear();

    edgeLinesRef.current.forEach(line => scene.remove(line));
    edgeLinesRef.current = [];

    edgeCurvesRef.current.forEach(({ packet }) => scene.remove(packet));
    edgeCurvesRef.current = [];

    // Construct Polished Geometric 3D Nodes
    filteredNodes.forEach((node) => {
      const pos = node3DPositions.get(node.id) || new THREE.Vector3(0, 0, 0);
      const group = new THREE.Group();
      group.position.copy(pos);

      const normalizedType = String(node.type || '').toLowerCase();
      const propagationRisk = typeof node.propagationRisk === 'number' && !Number.isNaN(node.propagationRisk)
        ? Math.max(0, Math.min(100, node.propagationRisk))
        : 0;

      const isCritical = Boolean(node.compromised || propagationRisk >= 70);
      const isWarning = !isCritical && propagationRisk > 30;

      // Color computation based on ViewMode & Security Semantics
      let nodeColorHex: number;
      if (viewMode === 'risk') {
        nodeColorHex = isCritical ? BLACKSITE.criticalRed : (isWarning ? BLACKSITE.investigationAmber : BLACKSITE.healthyGreen);
      } else {
        nodeColorHex = isCritical
          ? BLACKSITE.criticalRed
          : isWarning
          ? BLACKSITE.investigationAmber
          : (BLACKSITE[normalizedType as keyof typeof BLACKSITE] ?? BLACKSITE.default);
      }

      const isSelected = selectedNodeId === node.id;
      const isHovered = hoveredNodeId === node.id;
      const isConnectedToFocus = activeFocusId ? connectedNodeIds.has(node.id) : true;
      const opacity = activeFocusId ? (isConnectedToFocus ? 1.0 : 0.18) : 1.0;

      // Geometry Families by Entity Archetype:
      // 1. Users / Identities: Sphere core + orbital electron ring
      // 2. Endpoints / Devices: Compact technical Octahedron
      // 3. Protected Resources: Architectural Dodecahedron + Pedestal
      let coreGeo: THREE.BufferGeometry;
      let shellGeo: THREE.BufferGeometry;

      if (normalizedType === 'user') {
        coreGeo = new THREE.SphereGeometry(2.1, 24, 24);
        shellGeo = new THREE.IcosahedronGeometry(3.1, 0);
      } else if (normalizedType === 'device') {
        coreGeo = new THREE.OctahedronGeometry(2.3, 0);
        shellGeo = new THREE.OctahedronGeometry(3.3, 0);
      } else {
        coreGeo = new THREE.DodecahedronGeometry(2.4, 0);
        shellGeo = new THREE.IcosahedronGeometry(3.6, 0);
      }

      // Emissive Core Mesh
      const coreMat = new THREE.MeshStandardMaterial({
        color: nodeColorHex,
        emissive: nodeColorHex,
        emissiveIntensity: isSelected ? 1.1 : (isHovered ? 0.9 : (isCritical ? 0.85 : 0.45)),
        roughness: 0.15,
        metalness: 0.85,
        transparent: true,
        opacity,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.name = 'coreMesh';
      coreMesh.userData = { nodeId: node.id, node };
      group.add(coreMesh);

      // Outer Wireframe Holographic Shell
      const shellMat = new THREE.MeshBasicMaterial({
        color: isSelected ? BLACKSITE.highEnergyCyan : nodeColorHex,
        wireframe: true,
        transparent: true,
        opacity: opacity * 0.7,
      });
      const shellMesh = new THREE.Mesh(shellGeo, shellMat);
      shellMesh.name = 'outerShell';
      group.add(shellMesh);

      // Identity Orbital Ring for Users
      if (normalizedType === 'user') {
        const torusGeo = new THREE.TorusGeometry(3.3, 0.08, 8, 32);
        const torusMat = new THREE.MeshBasicMaterial({
          color: BLACKSITE.iceBlue,
          transparent: true,
          opacity: opacity * 0.75,
        });
        const orbitalRing = new THREE.Mesh(torusGeo, torusMat);
        orbitalRing.name = 'orbitalRing';
        orbitalRing.rotation.x = Math.PI / 3;
        group.add(orbitalRing);
      }

      // Architectural Base Pedestal for Resources
      if (normalizedType !== 'user' && normalizedType !== 'device') {
        const pedestalGeo = new THREE.RingGeometry(2.8, 3.6, 24);
        const pedestalMat = new THREE.MeshBasicMaterial({
          color: nodeColorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: opacity * 0.35,
        });
        const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
        pedestal.rotation.x = Math.PI / 2;
        pedestal.position.y = -2.8;
        group.add(pedestal);
      }

      // Active Critical Threat Aura Ring
      if (isCritical) {
        const beaconGeo = new THREE.RingGeometry(3.8, 4.8, 32);
        const beaconMat = new THREE.MeshBasicMaterial({
          color: BLACKSITE.criticalRed,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        const threatBeacon = new THREE.Mesh(beaconGeo, beaconMat);
        threatBeacon.name = 'threatBeacon';
        group.add(threatBeacon);
      }

      // Suspicious Warning Ring
      if (isWarning && !isCritical) {
        const warnGeo = new THREE.RingGeometry(3.6, 4.2, 32);
        const warnMat = new THREE.MeshBasicMaterial({
          color: BLACKSITE.investigationAmber,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
        });
        const warnBeacon = new THREE.Mesh(warnGeo, warnMat);
        group.add(warnBeacon);
      }

      // Active Selection Targeting Reticle (High-Energy Cyan)
      if (isSelected) {
        const selectRingGeo = new THREE.RingGeometry(4.6, 5.2, 32);
        const selectRingMat = new THREE.MeshBasicMaterial({
          color: BLACKSITE.highEnergyCyan,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95,
        });
        const selectRing = new THREE.Mesh(selectRingGeo, selectRingMat);
        selectRing.name = 'selectRing';
        group.add(selectRing);
      }

      scene.add(group);
      nodeMeshesRef.current.set(node.id, group);
    });

    // Construct 3D Quadratic Curved Connections & Flow Packets
    rawEdges.forEach((edge, i) => {
      const fromPos = node3DPositions.get(edge.from);
      const toPos = node3DPositions.get(edge.to);
      if (!fromPos || !toPos) return;

      const isConnectedToFocus = activeFocusId ? connectedEdgeIndices.has(i) : true;
      const opacity = activeFocusId
        ? (isConnectedToFocus ? 0.95 : 0.06)
        : (edge.attackPath ? 0.95 : (viewMode === 'traffic' ? 0.8 : 0.35));

      // 3D Quadratic Bezier Curve with Arched Midpoint
      const midPoint = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
      const distance = fromPos.distanceTo(toPos);
      midPoint.y += Math.min(distance * 0.22, 14); // Elevation arch

      const curve = new THREE.QuadraticBezierCurve3(fromPos, midPoint, toPos);
      const points = curve.getPoints(24);
      const curveGeo = new THREE.BufferGeometry().setFromPoints(points);

      // Color: Cyan on selection, Red on attack, Muted Blue on neutral
      const lineColor = edge.attackPath
        ? BLACKSITE.criticalRed
        : (isConnectedToFocus && activeFocusId ? BLACKSITE.highEnergyCyan : BLACKSITE.structuralBorder);

      const curveMat = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity,
        linewidth: edge.attackPath || isConnectedToFocus ? 2 : 1,
      });

      const line = new THREE.Line(curveGeo, curveMat);
      scene.add(line);
      edgeLinesRef.current.push(line);

      // Directional Flow Particle Pulse
      const packetGeo = new THREE.SphereGeometry(0.55, 8, 8);
      const packetMat = new THREE.MeshBasicMaterial({
        color: edge.attackPath ? BLACKSITE.criticalRed : (isConnectedToFocus && activeFocusId ? BLACKSITE.highEnergyCyan : BLACKSITE.iceBlue),
        transparent: true,
        opacity: isConnectedToFocus || edge.attackPath ? 0.95 : 0.5,
      });
      const packet = new THREE.Mesh(packetGeo, packetMat);
      packet.position.copy(curve.getPoint(0.3));
      scene.add(packet);

      edgeCurvesRef.current.push({
        curve,
        packet,
        edgeIndex: i,
        isAttack: Boolean(edge.attackPath),
      });
    });

  }, [filteredNodes, rawEdges, node3DPositions, activeFocusId, connectedNodeIds, connectedEdgeIndices, selectedNodeId, hoveredNodeId, viewMode]);

  // Smooth Camera Glide on Selection
  useEffect(() => {
    if (!selectedNodeId || !cameraRef.current || !controlsRef.current) return;
    const pos = node3DPositions.get(selectedNodeId);
    if (pos) {
      targetCamPosRef.current = new THREE.Vector3(pos.x + 22, pos.y + 16, pos.z + 36);
      targetLookAtRef.current = pos.clone();
    }
  }, [selectedNodeId, node3DPositions]);

  // Camera Presets
  const applyPreset = (preset: 'cinematic' | 'flow' | 'overhead' | 'threat') => {
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
      // Find actual qualifying compromised / high-risk entity
      const compromised = filteredNodes.find(n => n.compromised);
      const highestThreat = compromised || [...filteredNodes].sort((a, b) => (b.propagationRisk ?? 0) - (a.propagationRisk ?? 0))[0];

      if (highestThreat && (highestThreat.compromised || (highestThreat.propagationRisk ?? 0) >= 60)) {
        const pos = node3DPositions.get(highestThreat.id);
        if (pos) {
          targetCamPosRef.current = new THREE.Vector3(pos.x + 18, pos.y + 14, pos.z + 32);
          targetLookAtRef.current = pos.clone();
          setSelectedNode(highestThreat.id);
          setThreatToast(`Threat Focus: Locked onto ${highestThreat.label || highestThreat.id} (Risk: ${highestThreat.propagationRisk ?? 0}%)`);
        }
      } else {
        // Genuine state: inform that no critical threat qualifies
        setThreatToast('Nominal Defense: No active critical threat entity detected in live topology.');
        targetCamPosRef.current = new THREE.Vector3(28, 48, 130);
        targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
      }
    }
  };

  // Zoom helpers
  const handleZoomIn = () => {
    if (!cameraRef.current) return;
    cameraRef.current.position.multiplyScalar(0.85);
  };
  const handleZoomOut = () => {
    if (!cameraRef.current) return;
    cameraRef.current.position.multiplyScalar(1.15);
  };
  const handleResetCamera = () => {
    applyPreset('cinematic');
    setSelectedNode(null);
    setThreatToast(null);
  };

  return (
    <div className="relative w-full h-full min-h-[480px] rounded-2xl border border-[#27364B] bg-[#050810] overflow-hidden select-none shadow-2xl group">
      {/* Cinematic Vignette Overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(5,8,16,0.75)_100%)]" />

      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="w-full h-full min-h-[480px] cursor-grab active:cursor-grabbing" />

      {/* Floating 3D Navigation & Preset Rail (Top Left) */}
      <div className="absolute left-3.5 top-3.5 z-20 flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md shadow-2xl">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-1.5 rounded-lg text-[#A3B3C9] hover:text-[#31E6F7] hover:bg-[#131F31] transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-1.5 rounded-lg text-[#A3B3C9] hover:text-[#31E6F7] hover:bg-[#131F31] transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleResetCamera}
          title="Reset Camera"
          className="p-1.5 rounded-lg text-[#A3B3C9] hover:text-[#31E6F7] hover:bg-[#131F31] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-[#27364B] mx-1" />

        {/* View Presets */}
        <div className="flex items-center gap-1 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => applyPreset('cinematic')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              activePreset === 'cinematic'
                ? 'bg-[#31E6F7]/20 text-[#31E6F7] font-bold border border-[#31E6F7]/40'
                : 'text-[#A3B3C9] hover:text-[#F0F5FC] hover:bg-[#131F31]'
            }`}
          >
            Cinematic
          </button>
          <button
            type="button"
            onClick={() => applyPreset('flow')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              activePreset === 'flow'
                ? 'bg-[#4DA3FF]/20 text-[#4DA3FF] font-bold border border-[#4DA3FF]/40'
                : 'text-[#A3B3C9] hover:text-[#F0F5FC] hover:bg-[#131F31]'
            }`}
          >
            Flow
          </button>
          <button
            type="button"
            onClick={() => applyPreset('overhead')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              activePreset === 'overhead'
                ? 'bg-[#9A8CFF]/20 text-[#9A8CFF] font-bold border border-[#9A8CFF]/40'
                : 'text-[#A3B3C9] hover:text-[#F0F5FC] hover:bg-[#131F31]'
            }`}
          >
            Overhead
          </button>
          <button
            type="button"
            onClick={() => applyPreset('threat')}
            className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              activePreset === 'threat'
                ? 'bg-[#FF304F]/20 text-[#FF304F] font-bold border border-[#FF304F]/40'
                : 'text-[#A3B3C9] hover:text-[#FF304F] hover:bg-[#131F31]'
            }`}
          >
            <Crosshair className="w-3 h-3 text-[#FF304F]" /> Threat Focus
          </button>
        </div>
      </div>

      {/* Data Visualization Modes Strip (Top Center) */}
      <div className="absolute left-1/2 -translate-x-1/2 top-3.5 z-20 hidden md:flex items-center gap-1 p-1.5 rounded-xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md shadow-2xl text-[10px] font-mono">
        <span className="text-[#6F829D] px-2 flex items-center gap-1">
          <Activity className="w-3 h-3 text-[#31E6F7]" /> Mode:
        </span>
        {(['topology', 'risk', 'traffic', 'investigation'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
              viewMode === mode
                ? 'bg-[#31E6F7]/20 text-[#31E6F7] font-bold border border-[#31E6F7]/40 shadow-sm'
                : 'text-[#A3B3C9] hover:text-[#F0F5FC] hover:bg-[#131F31]'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Filter Chips Toolbar (Bottom Left) */}
      <div className="absolute left-3.5 bottom-3.5 z-20 hidden sm:flex items-center gap-1 p-1.5 rounded-xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md shadow-2xl text-[10px] font-mono">
        <span className="text-[#6F829D] px-2 flex items-center gap-1">
          <Compass className="w-3 h-3 text-[#31E6F7]" /> Filter:
        </span>
        {[
          { id: 'all', label: `All (${rawNodes.length})` },
          { id: 'identity', label: 'Users' },
          { id: 'endpoints', label: 'Endpoints' },
          { id: 'resources', label: 'Databases & APIs' },
        ].map(filter => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setEntityFilter(filter.id)}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              entityFilter === filter.id
                ? 'bg-[#31E6F7]/20 text-[#31E6F7] font-bold border border-[#31E6F7]/40'
                : 'text-[#A3B3C9] hover:text-[#F0F5FC] hover:bg-[#131F31]'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Status Legend (Bottom Right) */}
      <div className="absolute right-3.5 bottom-3.5 z-20 hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl border border-[#27364B] bg-[#0E1726]/90 backdrop-blur-md shadow-2xl text-[10px] font-mono text-[#A3B3C9]">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#4DA3FF]" /> Identities</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#59D9D0]" /> Endpoints</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#46E6A5]" /> Databases</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#9A8CFF]" /> AI / Apps</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#FF304F] animate-pulse" /> Critical</span>
      </div>

      {/* Notification Toast (Threat Focus or Nominal Status) */}
      {threatToast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-14 z-30 px-3.5 py-1.5 rounded-lg border border-[#31E6F7]/40 bg-[#0E1726]/95 backdrop-blur-md shadow-2xl text-xs font-mono text-[#F0F5FC] flex items-center gap-2 animate-in fade-in duration-200">
          <Radio className="w-3.5 h-3.5 text-[#31E6F7] animate-pulse" />
          <span>{threatToast}</span>
          <button
            type="button"
            onClick={() => setThreatToast(null)}
            className="text-[#6F829D] hover:text-[#F0F5FC] ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Contextual 3D Entity Inspector HUD (Top Right) */}
      {activeInspectorNode && (
        <div className="absolute right-3.5 top-3.5 p-4 rounded-xl border border-[#27364B] bg-[#0E1726]/95 backdrop-blur-md shadow-2xl w-64 max-w-[calc(100%-28px)] text-xs font-mono space-y-2.5 pointer-events-auto transition-all animate-in fade-in z-30">
          <div className="flex items-center justify-between gap-2 border-b border-[#27364B] pb-2">
            <div className="flex items-center gap-2 truncate">
              <span className="text-base">{NODE_ICONS[String(activeInspectorNode.type || '').toLowerCase()] ?? DEFAULT_NODE_ICON}</span>
              <div className="truncate">
                <div className="font-bold text-[#F0F5FC] truncate text-xs">
                  {activeInspectorNode.label || activeInspectorNode.id}
                </div>
                <div className="text-[10px] text-[#A3B3C9] truncate">
                  {activeInspectorNode.id}
                </div>
              </div>
            </div>
            {selectedNodeId && (
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="text-[#6F829D] hover:text-[#F0F5FC] p-0.5 rounded"
                title="Deselect"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#A3B3C9]">Security State:</span>
            {activeInspectorNode.compromised || (activeInspectorNode.propagationRisk ?? 0) >= 70 ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded bg-rose-950/60 text-[#FF304F] border border-[#FF304F]/60">
                <ShieldAlert className="w-3 h-3 text-[#FF304F]" /> COMPROMISED
              </span>
            ) : (activeInspectorNode.propagationRisk ?? 0) > 30 ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded bg-amber-950/60 text-[#FFBD59] border border-[#FFBD59]/60">
                <AlertTriangle className="w-3 h-3 text-[#FFBD59]" /> SUSPICIOUS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-950/60 text-[#46E6A5] border border-[#46E6A5]/60">
                <CheckCircle2 className="w-3 h-3 text-[#46E6A5]" /> NOMINAL
              </span>
            )}
          </div>

          <div className="flex justify-between text-[11px]">
            <span className="text-[#A3B3C9]">Entity Type:</span>
            <span className="capitalize text-[#31E6F7] font-semibold">{activeInspectorNode.type || 'Unknown'}</span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#A3B3C9]">Risk Score:</span>
              <span className={
                (activeInspectorNode.propagationRisk ?? 0) >= 70 ? 'text-[#FF304F] font-bold' :
                (activeInspectorNode.propagationRisk ?? 0) > 30 ? 'text-[#FFBD59] font-bold' : 'text-[#46E6A5]'
              }>
                {activeInspectorNode.propagationRisk ?? 0}%
              </span>
            </div>
            <div className="w-full bg-[#131F31] h-1.5 rounded-full overflow-hidden border border-[#27364B]/50">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, activeInspectorNode.propagationRisk ?? 0))}%`,
                  background:
                    (activeInspectorNode.propagationRisk ?? 0) >= 70 ? '#FF304F' :
                    (activeInspectorNode.propagationRisk ?? 0) > 30 ? '#FFBD59' : '#46E6A5',
                }}
              />
            </div>
          </div>

          {/* Connected Entities Inspector */}
          {connectedPeers.length > 0 && (
            <div className="pt-2 border-t border-[#27364B]/60 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-[#A3B3C9]">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-[#31E6F7]" /> 3D Connected Neighbors ({connectedPeers.length}):
                </span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {connectedPeers.slice(0, 5).map(({ node: peer, direction }) => (
                  <button
                    key={peer.id}
                    type="button"
                    onClick={() => {
                      setSelectedNode(peer.id);
                    }}
                    className="w-full flex items-center justify-between p-1 rounded bg-[#131F31]/80 hover:bg-[#131F31] border border-[#27364B]/50 text-[10px] transition-colors text-left group"
                    title={`Fly camera to ${peer.label || peer.id}`}
                  >
                    <span className="truncate text-[#F0F5FC] group-hover:text-[#31E6F7]">
                      {NODE_ICONS[String(peer.type || '').toLowerCase()] ?? '📦'} {peer.label || peer.id}
                    </span>
                    <span className="text-[9px] text-[#6F829D] font-mono flex items-center gap-0.5">
                      {direction === 'upstream' ? '← in' : 'out →'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-[9px] text-[#6F829D] pt-1 text-center border-t border-[#27364B]/40">
            {selectedNodeId === activeInspectorNode.id ? 'Click canvas or ✕ to unpin' : 'Click node in 3D to pin inspector'}
          </div>
        </div>
      )}
    </div>
  );
};
