import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { collectFingerprint, getFingerprintId } from "@/services/fingerprintService";
import { mlBackendService } from "@/services/mlBackendService";

const SECTIONS = 6;
const WAYPOINTS_Z = [9, -7, -18, -29, -40, -52];
const GATES = [
  { z: -7, r: 1.5, color: 0xff2b4d, label: 1 },
  { z: -18, r: 1.6, color: 0xff2b4d, label: 2 },
  { z: -29, r: 1.7, color: 0xffb020, label: 3 },
  { z: -40, r: 1.85, color: 0xff2b4d, label: 4, converge: true },
  { z: -52, r: 2.1, color: 0xe9ecf5, label: 5, console: true },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function weave(z: number): [number, number] {
  return [Math.sin(z * 0.12) * 0.5, Math.cos(z * 0.09) * 0.3];
}

export default function LoginPage3D() {
  const navigate = useNavigate();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const authRef = useRef<HTMLFormElement | null>(null);
  const depthRef = useRef<HTMLDivElement | null>(null);
  const copyRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [username, setUsername] = useState("sumukh");
  const [password, setPassword] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050507, 0.038);
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 120);
    camera.position.set(0, 0, 9);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      mount.classList.add("tn-webgl-unavailable");
      return () => mount.classList.remove("tn-webgl-unavailable");
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const starCount = 900;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 30;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      starPos[i * 3 + 2] = Math.random() * -60 + 10;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x4a2c33, size: 0.035, transparent: true, opacity: 0.55 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const streamCount = 260;
    const streamGeo = new THREE.BufferGeometry();
    const streamPos = new Float32Array(streamCount * 3);
    const streamSpeed = new Float32Array(streamCount);
    for (let i = 0; i < streamCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.3 + Math.random() * 1.1;
      streamPos[i * 3] = Math.cos(angle) * radius;
      streamPos[i * 3 + 1] = Math.sin(angle) * radius;
      streamPos[i * 3 + 2] = Math.random() * -55 + 10;
      streamSpeed[i] = 0.04 + Math.random() * 0.06;
    }
    streamGeo.setAttribute("position", new THREE.BufferAttribute(streamPos, 3));
    const streamMat = new THREE.PointsMaterial({
      color: 0xff5470,
      size: 0.05,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stream = new THREE.Points(streamGeo, streamMat);
    scene.add(stream);

    const gateMeshes: Array<{
      def: (typeof GATES)[number];
      group: THREE.Group;
      ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
      innerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null;
      sensors: Array<{
        core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
        glow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
      }>;
    }> = [];

    GATES.forEach((gate) => {
      const group = new THREE.Group();
      group.position.z = gate.z;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(gate.r, 0.02, 8, 64),
        new THREE.MeshBasicMaterial({ color: gate.color, transparent: true, opacity: 0.5 }),
      );
      group.add(ring);

      let innerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null;
      if (gate.converge) {
        innerRing = new THREE.Mesh(
          new THREE.TorusGeometry(gate.r * 0.6, 0.015, 8, 48),
          new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.4 }),
        );
        group.add(innerRing);
      }

      const sensors: Array<{
        core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
        glow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
      }> = [];
      const sensorCount = gate.console ? 10 : gate.converge ? 9 : 6;
      for (let i = 0; i < sensorCount; i++) {
        const angle = (i / sensorCount) * Math.PI * 2;
        const sx = Math.cos(angle) * gate.r;
        const sy = Math.sin(angle) * gate.r;
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xf4f4f6 }),
        );
        core.position.set(sx, sy, 0);
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 12, 12),
          new THREE.MeshBasicMaterial({
            color: gate.color,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        glow.position.set(sx, sy, 0);
        group.add(core, glow);
        sensors.push({ core, glow });
      }

      if (gate.console) {
        const sweep = new THREE.Mesh(
          new THREE.CircleGeometry(gate.r * 0.98, 24, 0, Math.PI * 0.22),
          new THREE.MeshBasicMaterial({
            color: gate.color,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        group.add(sweep);
      }

      scene.add(group);
      gateMeshes.push({ def: gate, group, ring, innerRing, sensors });
    });

    let scrollProgress = 0;
    let mouseX = 0;
    let mouseY = 0;
    let camZ = WAYPOINTS_Z[0];
    const animationStart = performance.now();
    let rafId = 0;

    function onResize() {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    function updateActive() {
      const progress = scrollProgress * (SECTIONS - 1);
      const activeIndex = Math.round(progress);
      if (heroRef.current) heroRef.current.style.opacity = activeIndex === 0 ? "1" : "0.22";
      copyRefs.current.forEach((element) => {
        if (!element) return;
        const section = Number.parseInt(element.dataset.section ?? "-1", 10);
        element.classList.toggle("is-active", section === activeIndex);
      });
      authRef.current?.classList.toggle("is-active", activeIndex === 5);
      if (depthRef.current) {
        const depth = Math.round(progress * 220);
        depthRef.current.innerHTML = `DEPTH <b>${String(depth).padStart(3, "0")}</b>m · GATE ${Math.min(activeIndex, 5)}/5`;
      }
    }

    function onScroll() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      updateActive();
    }

    function onMouseMove(event: MouseEvent) {
      mouseX = (event.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (event.clientY / window.innerHeight - 0.5) * 2;
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove);

    function animate() {
      rafId = window.requestAnimationFrame(animate);
      const elapsed = (performance.now() - animationStart) / 1000;
      const progress = scrollProgress * (WAYPOINTS_Z.length - 1);
      const index = Math.min(WAYPOINTS_Z.length - 2, Math.floor(progress));
      const fraction = progress - index;
      const targetZ = lerp(WAYPOINTS_Z[index], WAYPOINTS_Z[index + 1], fraction);
      camZ = lerp(camZ, targetZ, reduceMotion ? 1 : 0.07);

      const [weaveX, weaveY] = weave(camZ);
      const parallaxX = reduceMotion ? 0 : mouseX * 0.3;
      const parallaxY = reduceMotion ? 0 : mouseY * 0.18;
      camera.position.set(weaveX + parallaxX, weaveY - parallaxY, camZ);
      camera.lookAt(weaveX * 0.6, weaveY * 0.6, camZ - 6);
      camera.rotation.z = reduceMotion ? 0 : mouseX * 0.035;
      stars.position.z = camZ * 0.02;

      const positions = streamGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < streamCount; i++) {
        let z = positions.getZ(i) + streamSpeed[i] * (reduceMotion ? 0 : 1);
        if (z > camZ + 6) z = camZ - 50;
        positions.setZ(i, z);
      }
      positions.needsUpdate = true;

      gateMeshes.forEach(({ def, group, ring, innerRing, sensors }) => {
        const active = Math.abs(camZ - def.z) < 3.2;
        const targetOpacity = active ? 0.9 : 0.35;
        ring.material.opacity = lerp(ring.material.opacity, targetOpacity, reduceMotion ? 1 : 0.08);
        ring.scale.setScalar(active && !reduceMotion ? 1 + Math.sin(elapsed * 4) * 0.04 : 1);
        sensors.forEach(({ core, glow }, i) => {
          const targetScale = active ? 1.6 : 1;
          const targetGlowOpacity = active ? 0.5 : 0.16;
          glow.scale.setScalar(lerp(glow.scale.x, targetScale, reduceMotion ? 1 : 0.08));
          glow.material.opacity = lerp(glow.material.opacity, targetGlowOpacity, reduceMotion ? 1 : 0.08);
          if (active && !reduceMotion) core.scale.setScalar(1 + Math.sin(elapsed * 3 + i) * 0.15);

          if (def.label === 3 && active && !reduceMotion) {
            const sweepIndex = Math.floor((elapsed * 2) % sensors.length);
            core.material.color.set(i === sweepIndex ? 0xffe0a8 : 0xf4f4f6);
          }
          if (def.converge && active && !reduceMotion) {
            const on = Math.floor(elapsed * 2.2 + i * 0.7) % 3 === 0;
            core.material.color.set(on ? 0xffb020 : 0xf4f4f6);
          }
        });

        if (def.console) {
          if (!reduceMotion) group.rotation.z = elapsed * 0.6;
        } else if (!reduceMotion) {
          group.rotation.z = Math.sin(elapsed * 0.3 + def.z) * 0.15;
        }
        if (innerRing && !reduceMotion) {
          innerRing.rotation.z = -elapsed * 0.9;
          innerRing.material.opacity = lerp(innerRing.material.opacity, active ? 0.75 : 0.2, 0.08);
        }
      });

      renderer.render(scene, camera);
    }

    onScroll();
    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAuthenticating(true);
    try {
      const fingerprint = collectFingerprint();
      const fingerprintId = getFingerprintId(fingerprint);
      const result = await mlBackendService.login(username.trim(), password, fingerprint, fingerprintId);
      if (result.login_status !== "allowed") {
        setError(result.message || "Access denied. This device could not be verified.");
        return;
      }
      navigate("/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Check the backend and try again.");
    } finally {
      setAuthenticating(false);
    }
  }

  return (
    <div className="tn3d-root">
      <style>{`
        .tn3d-root{position:relative;--bg:#050507;--panel:rgba(14,15,19,.74);--line:rgba(255,255,255,.1);--red:#ff2b4d;--red-2:#ff5470;--amber:#ffb020;--white-gate:#e9ecf5;--text:#f4f4f6;--text-dim:#a9a3a5;--text-faint:#82777a;color-scheme:dark;background:var(--bg);color:var(--text);font-family:'Sora',-apple-system,system-ui,sans-serif;overscroll-behavior-y:none}
        .tn3d-root *{box-sizing:border-box}
        .tn3d-root canvas{display:block}
        .tn-canvas{position:fixed;inset:0;z-index:0;pointer-events:none}
        .tn-canvas.tn-webgl-unavailable{background:radial-gradient(ellipse at 50% 35%,rgba(255,43,77,.12),transparent 56%),#050507}
        .tn-overlay{position:fixed;inset:0;z-index:4;pointer-events:none}
        .tn-overlay .vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.55) 100%)}
        .tn-overlay .scan{position:absolute;inset:0;opacity:.5;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.025) 0,rgba(255,255,255,.025) 1px,transparent 1px,transparent 3px)}
        .tn-overlay .sweepline{position:absolute;left:0;right:0;height:1px;top:0;background:linear-gradient(90deg,transparent,rgba(255,43,77,.16),transparent);box-shadow:0 0 12px 1px rgba(255,43,77,.08);animation:tn3d-sweepdown 13s linear infinite}
        @keyframes tn3d-sweepdown{0%{top:-2%;opacity:0}8%{opacity:1}92%{opacity:1}100%{top:102%;opacity:0}}
        .tn-hud{position:fixed;inset:0;z-index:5;pointer-events:none;padding:26px 36px;display:flex;justify-content:space-between;align-items:flex-start;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.14em;color:var(--text-faint)}
        .tn-hud .dotline{display:flex;align-items:center;gap:8px}.tn-hud .dot{width:6px;height:6px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red);animation:tn3d-pulse 2.2s ease-in-out infinite}
        @keyframes tn3d-pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .tn-hud .brand{text-align:right;color:#9b6b74}.tn-hud .brand strong{display:block;color:var(--text);font-family:'Chakra Petch','Sora',sans-serif;font-size:15px;letter-spacing:.06em;margin-bottom:3px}
        .tn-hud .depth{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);font-size:10px;letter-spacing:.18em;color:var(--text-faint);white-space:nowrap}.tn-hud .depth b{color:var(--red-2);font-weight:600}
        .tn-section{position:relative;z-index:3;min-height:100vh;display:flex;align-items:center;padding:0 48px;scroll-snap-align:start}.tn-section.right{justify-content:flex-end}.tn-section.center{justify-content:center;text-align:center}
        .tn3d-root{scroll-snap-type:y proximity;scroll-behavior:smooth}
        .tn-copy{max-width:480px;opacity:.22;transition:opacity .6s ease}.tn-copy.is-active{opacity:1}
        .tn-copy .eyebrow{display:flex;align-items:center;gap:10px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.14em;color:var(--red-2);margin-bottom:14px}.tn-copy .eyebrow .tag{padding:3px 8px;border:1px solid rgba(255,43,77,.4);border-radius:4px;font-size:10px;color:var(--red-2)}
        .tn-copy.csi .eyebrow,.tn-copy.csi .eyebrow .tag{color:var(--amber);border-color:rgba(255,176,32,.4)}
        .tn-copy h2{font-family:'Chakra Petch','Sora',sans-serif;font-size:clamp(24px,3.4vw,34px);font-weight:600;line-height:1.15;margin:0 0 16px;letter-spacing:-.01em;text-wrap:balance}.tn-copy p{font-size:16px;line-height:1.6;color:var(--text-dim);margin:0;max-width:46ch}
        .tn-hero{opacity:1;transition:opacity .6s ease}.tn-hero .gate-label{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.3em;color:var(--text-faint);margin-bottom:18px}.tn-hero h1{font-family:'Chakra Petch','Sora',sans-serif;font-size:clamp(34px,6vw,60px);font-weight:600;line-height:1.08;margin:0 0 20px;letter-spacing:-.02em;text-wrap:balance}.tn-hero h1 .accent{color:var(--red-2);text-shadow:0 0 22px rgba(255,43,77,.5)}
        .scroll-cue{display:flex;flex-direction:column;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.16em;color:var(--text-faint)}.scroll-cue .chev{width:9px;height:9px;border-right:1.5px solid var(--text-faint);border-bottom:1.5px solid var(--text-faint);transform:rotate(45deg);animation:tn3d-bob 1.8s ease-in-out infinite}
        @keyframes tn3d-bob{0%,100%{transform:translateY(0) rotate(45deg);opacity:.5}50%{transform:translateY(6px) rotate(45deg);opacity:1}}
        .tn-auth{position:relative;z-index:3;width:min(380px,100%);background:var(--panel);border:1px solid rgba(233,236,245,.18);border-radius:4px;padding:36px 32px;backdrop-filter:blur(14px);box-shadow:0 30px 70px -24px rgba(233,236,245,.12);opacity:.4;transition:opacity .6s ease;text-align:left}.tn-auth.is-active{opacity:1}
        .tn-auth .eyebrow{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;color:var(--text-faint);margin-bottom:10px}.tn-auth h2{font-family:'Chakra Petch','Sora',sans-serif;font-size:26px;font-weight:600;margin:0 0 8px}.tn-auth .sub{font-size:14px;color:#9a9ba3;margin:0 0 28px;line-height:1.5}
        .tn-auth .tn-field{margin-bottom:18px}.tn-auth .tn-field label{display:block;font-size:12px;color:#9a9ba3;margin-bottom:7px;text-transform:uppercase;letter-spacing:.04em}.tn-auth .tn-field input{width:100%;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.14);border-radius:3px;padding:11px 13px;color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:border-color .2s ease}.tn-auth .tn-field input:focus{border-color:var(--white-gate);box-shadow:0 0 0 3px rgba(233,236,245,.12)}
        .tn-auth-btn{width:100%;background:linear-gradient(135deg,var(--red),#c4123a);color:#fff;border:none;border-radius:3px;padding:13px;font-size:14px;font-weight:600;letter-spacing:.03em;cursor:pointer;margin-top:6px;font-family:inherit;transition:opacity .2s ease;box-shadow:0 8px 24px -8px rgba(255,43,77,.45)}.tn-auth-btn:hover{opacity:.9}.tn-auth-btn:disabled{opacity:.6;cursor:default}
        .tn-auth-error{color:#ff8294;font-size:12px;line-height:1.5;margin:0 0 12px}.tn-footnote{margin-top:26px;padding-top:18px;border-top:1px solid var(--line);font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.1em;color:#82777a}
        @media(prefers-reduced-motion:reduce){.scroll-cue .chev,.tn-hud .dot,.tn-overlay .sweepline{animation:none!important}.tn3d-root{scroll-behavior:auto}}
        @media(max-width:760px){.tn-section{padding:0 24px;justify-content:center!important;text-align:center}.tn-copy{max-width:100%}.tn-hud{padding:18px 20px;font-size:9px}.tn-auth{opacity:.85}.tn-hud .depth{bottom:14px}.tn-auth{padding:30px 24px}}
        @media(max-width:420px){.tn-hud{padding:16px 14px;font-size:8px}.tn-section{padding:0 16px}.tn-auth{padding:26px 20px}.tn-hero .gate-label{font-size:9px}}
      `}</style>

      <div className="tn-canvas" ref={mountRef} />
      <div className="tn-overlay" aria-hidden="true">
        <div className="vignette" />
        <div className="scan" />
        <div className="sweepline" />
      </div>

      <div className="tn-hud" aria-hidden="true">
        <div className="dotline"><span className="dot" />AGENTIC SOC — LIVE</div>
        <div className="brand"><strong>TRUSTNET&nbsp;AI</strong>NODE-07</div>
        <div className="depth" ref={depthRef}>DEPTH <b>000</b>m · GATE 0/5</div>
      </div>

      <section className="tn-section center">
        <div className="tn-hero" ref={heroRef}>
          <div className="gate-label">ENTRY POINT · DESCENDING</div>
          <h1>Cyber security,<br /><span className="accent">incident intelligence.</span></h1>
          <div className="scroll-cue">DESCEND TO AUTHENTICATE<span className="chev" /></div>
        </div>
      </section>

      <section className="tn-section">
        <div className="tn-copy" data-section="1" ref={(element) => { copyRefs.current[0] = element; }}>
          <div className="eyebrow"><span className="tag">LAYER 01</span>BEHAVIORAL ANALYTICS</div>
          <h2>Every anomaly gets caught before it becomes an incident.</h2>
          <p>Learns what normal looks like for every user and device, then flags the moment it doesn&apos;t — continuously, not on a schedule.</p>
        </div>
      </section>

      <section className="tn-section right">
        <div className="tn-copy" data-section="2" ref={(element) => { copyRefs.current[1] = element; }}>
          <div className="eyebrow"><span className="tag">LAYER 02</span>RISK PROPAGATION</div>
          <h2>Maps how one compromised device threatens everything else.</h2>
          <p>Sees the attack path to your most restricted assets before an attacker does — blast radius, not a single alert.</p>
        </div>
      </section>

      <section className="tn-section center">
        <div className="tn-copy csi" data-section="3" style={{ margin: "0 auto" }} ref={(element) => { copyRefs.current[2] = element; }}>
          <div className="eyebrow"><span className="tag">LAYER 03</span>PHYSICAL IDENTITY</div>
          <h2>RF fingerprints don&apos;t lie, even when MAC addresses do.</h2>
          <p>Confirms a device is what it claims to be, at the hardware level — not just the address it happens to present.</p>
        </div>
      </section>

      <section className="tn-section right">
        <div className="tn-copy" data-section="4" ref={(element) => { copyRefs.current[3] = element; }}>
          <div className="eyebrow"><span className="tag">LAYER 04</span>AGENTIC AI</div>
          <h2>Every layer&apos;s signal converges into one decision.</h2>
          <p>Grounded in evidence, not guesswork — it investigates, acts and keeps your team in the loop, within limits you set.</p>
        </div>
      </section>

      <section className="tn-section center">
        <form className="tn-auth" id="authPanel" ref={authRef} onSubmit={handleSubmit}>
          <div className="eyebrow">LAYER 05 · COMMAND ACCESS</div>
          <h2>Authenticate operator</h2>
          <p className="sub">You&apos;ve reached the console. Enter your demo username and password to continue.</p>
          <div className="tn-field">
            <label htmlFor="operator-id">Operator username</label>
            <input id="operator-id" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </div>
          <div className="tn-field">
            <label htmlFor="operator-password">Password</label>
            <input id="operator-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </div>
          {error && <p className="tn-auth-error" role="alert">{error}</p>}
          <button className="tn-auth-btn" type="submit" disabled={authenticating}>
            {authenticating ? "VERIFYING DEVICE…" : "AUTHENTICATE & ENTER CONSOLE"}
          </button>
          <div className="tn-footnote">DEVICE FINGERPRINT · IN-MEMORY BASELINE</div>
          <p className="tn-auth-error" style={{ margin: "12px 0 0", color: "var(--text-faint)" }}>Demo: sumukh / sumukh@123. First successful login sets the baseline.</p>
        </form>
      </section>
    </div>
  );
}
