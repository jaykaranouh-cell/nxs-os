/**
 * NXS City — real-time 3D command campus.
 *
 * A photoreal-leaning, fully data-reactive city built with react-three-fiber:
 *  - a glowing central Orchestrator tower on a ringed plaza,
 *  - district building clusters lit by their live activity,
 *  - data packets physically flowing along conduits between districts and HQ,
 *  - bloom + reflective floor + atmospheric fog for the cinematic render look.
 *
 * Everything reacts to real business data passed in via `activity`.
 */

import { useMemo, useRef, useState, useEffect, Suspense, Component, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, MeshReflectorMaterial, Html, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

// ── Imported city model ───────────────────────────────────────────────────────
// Drop a glTF binary here and the scene swaps the procedural buildings for your
// hand-built / kit city, keeping the live data overlay (conduits, packets,
// labels) on top. Get kits from KitBash3D, Sketchfab, Quaternius, Kenney.
//   File path:  artifacts/nexus-ai/public/models/city.glb   →  served at /models/city.glb
const CITY_MODEL_URL = "/models/city.glb";
// Footprint the model is auto-scaled to (max horizontal extent, world units).
const CITY_MODEL_FIT = 30;
// Tune if your kit sits off-centre or at the wrong height after import.
const CITY_MODEL_Y_OFFSET = 0;

/** Detect whether a city model has been dropped in (HEAD request, cached). */
function useCityModel(): boolean | null {
  const [present, setPresent] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(CITY_MODEL_URL, { method: "HEAD" })
      .then((r) => { if (alive) setPresent(r.ok && (r.headers.get("content-type") ?? "").indexOf("text/html") === -1); })
      .catch(() => { if (alive) setPresent(false); });
    return () => { alive = false; };
  }, []);
  return present;
}

/** Loads, centres, scales and lightly tonemaps an imported city model. */
function CityModel() {
  const { scene } = useGLTF(CITY_MODEL_URL);
  const prepared = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const maxXZ = Math.max(size.x, size.z) || 1;
    const scale = CITY_MODEL_FIT / maxXZ;
    root.position.set(-center.x * scale, -box.min.y * scale + CITY_MODEL_Y_OFFSET, -center.z * scale);
    root.scale.setScalar(scale);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    return root;
  }, [scene]);
  return <primitive object={prepared} />;
}

/** Falls back to `fallback` if the model fails to parse. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export interface District3D {
  id: string;
  name: string;
  hue: string;          // accent colour
  status: "online" | "attention" | "alert" | "standby";
  metric: string;
}
export interface Activity3D { level: number; alert: boolean }

const ALERT = "#f87171";
const RAD = 9.2;        // district ring radius

// Stable angular placement around the tower (degrees), keyed by id.
const ANGLES: Record<string, number> = {
  sales: 145, marketing: 60, intelligence: 195, memory: 25,
  finance: 230, operations: 285, delivery: 330, radar: 350,
};
const HEIGHTS: Record<string, number> = {
  sales: 4.2, marketing: 3.0, intelligence: 2.6, memory: 3.2,
  finance: 2.2, operations: 2.4, delivery: 2.2, radar: 2.8,
};

// ── Procedural lit-window texture (cached per colour) ─────────────────────────

const texCache = new Map<string, THREE.CanvasTexture>();
function windowTexture(hue: string): THREE.CanvasTexture {
  const cached = texCache.get(hue);
  if (cached) return cached;
  const cols = 6, rows = 18;
  const cw = 16, ch = 16;
  const cv = document.createElement("canvas");
  cv.width = cols * cw; cv.height = rows * ch;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#05080f";
  ctx.fillRect(0, 0, cv.width, cv.height);
  const c = new THREE.Color(hue);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      // deterministic-ish "random" lit pattern
      const lit = ((r * 73 + col * 31 + ((r * col) % 7)) % 10) > 4;
      if (!lit) { ctx.fillStyle = "#0a1120"; ctx.fillRect(col*cw+3, r*ch+3, cw-6, ch-7); continue; }
      const b = 0.55 + ((r * 17 + col * 7) % 5) / 10; // brightness variance
      ctx.fillStyle = `rgb(${Math.round(c.r*255*b+30)},${Math.round(c.g*255*b+40)},${Math.round(c.b*255*b+60)})`;
      ctx.fillRect(col*cw+3, r*ch+3, cw-6, ch-7);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(hue, tex);
  return tex;
}

// ── A single lit building box ─────────────────────────────────────────────────

function Building({
  position, size, hue, intensity, repeatY = 3,
}: {
  position: [number, number, number];
  size: [number, number, number];
  hue: string;
  intensity: number;
  repeatY?: number;
}) {
  const tex = useMemo(() => {
    const t = windowTexture(hue).clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(size[0] * 1.2)), repeatY);
    return t;
  }, [hue, size, repeatY]);

  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color="#070b16"
        emissive={"#ffffff"}
        emissiveMap={tex}
        emissiveIntensity={intensity}
        metalness={0.6}
        roughness={0.35}
      />
    </mesh>
  );
}

// ── District cluster (clickable) ──────────────────────────────────────────────

function DistrictCluster({
  d, activity, onSelect, showBuildings = true,
}: {
  d: District3D; activity: Activity3D; onSelect: (id: string) => void; showBuildings?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const ang = (ANGLES[d.id] ?? 0) * Math.PI / 180;
  const x = Math.cos(ang) * RAD;
  const z = Math.sin(ang) * RAD;
  const h = HEIGHTS[d.id] ?? 2.4;
  const col = activity.alert ? ALERT : d.hue;
  const emis = (0.9 + activity.level * 1.8) * (hover ? 1.5 : 1);

  const group = (
    <group
      position={[x, 0, z]}
      onClick={(e) => { e.stopPropagation(); onSelect(d.id); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
    >
      {/* buildings — hidden when an imported model is in use */}
      {showBuildings && <>
        <Building position={[0, h / 2, 0]} size={[2.2, h, 2.2]} hue={col} intensity={emis} repeatY={Math.round(h)} />
        <Building position={[2.0, (h*0.55)/2, 1.0]} size={[1.5, h*0.55, 1.5]} hue={col} intensity={emis*0.85} repeatY={2} />
        <Building position={[-1.6, (h*0.4)/2, -1.4]} size={[1.3, h*0.4, 1.7]} hue={col} intensity={emis*0.8} repeatY={2} />
        {/* rooftop beacon */}
        <mesh position={[0, h + 0.25, 0]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color={col} toneMapped={false} />
        </mesh>
      </>}
      {/* ground glow pad — always shown so the district reads on the map */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[3.4, 40]} />
        <meshBasicMaterial color={col} transparent opacity={hover ? 0.16 : 0.07} />
      </mesh>
      {/* floating label */}
      <Html position={[0, (showBuildings ? h : 1.5) + 1.1, 0]} center distanceFactor={20} zIndexRange={[20, 0]} occlude={false}>
        <div
          onClick={(e) => { e.stopPropagation(); onSelect(d.id); }}
          style={{ cursor: "pointer", transform: hover ? "scale(1.06)" : "scale(1)", transition: "transform .15s" }}
          className="select-none whitespace-nowrap text-center pointer-events-auto"
        >
          <div
            className="text-[11px] font-bold text-white tracking-wide px-2.5 py-1 rounded-md backdrop-blur-md"
            style={{ background: "rgba(6,10,20,0.7)", border: `1px solid ${col}55`, boxShadow: `0 0 16px ${col}33` }}
          >
            {d.name}
          </div>
          <div className="text-[8px] font-mono mt-0.5 px-1.5 py-0.5 rounded" style={{ color: col }}>
            {d.metric}
          </div>
        </div>
      </Html>
    </group>
  );

  return group;
}

// ── Central Orchestrator tower + plaza ────────────────────────────────────────

function CentralTower({ activity, onSelect, showBuildings = true }: { activity: Activity3D; onSelect: (id: string) => void; showBuildings?: boolean }) {
  const auraRef = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  useFrame((state) => {
    if (auraRef.current) {
      const t = state.clock.elapsedTime;
      const s = 1 + Math.sin(t * 1.4) * 0.06;
      auraRef.current.scale.set(s, s, s);
      (auraRef.current.material as THREE.MeshBasicMaterial).opacity = 0.10 + Math.sin(t * 1.4) * 0.04;
    }
  });
  const col = activity.alert ? ALERT : "#5b9bff";
  return (
    <group
      onClick={(e) => { e.stopPropagation(); onSelect("hq"); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
    >
      {/* plaza rings */}
      {[2.6, 3.6, 4.7].map((r, i) => (
        <mesh key={i} rotation={[-Math.PI/2, 0, 0]} position={[0, 0.03 + i*0.001, 0]}>
          <ringGeometry args={[r - 0.07, r, 64]} />
          <meshBasicMaterial color={col} transparent opacity={0.5 - i*0.12} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* radial spokes */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} rotation={[-Math.PI/2, 0, 0]} position={[Math.cos(a)*3.6, 0.025, Math.sin(a)*3.6]}>
            <planeGeometry args={[2.0, 0.05]} />
            <meshBasicMaterial color={col} transparent opacity={0.25} toneMapped={false} />
          </mesh>
        );
      })}
      {/* tower body (stacked, tapering) — hidden when an imported model is in use */}
      {showBuildings && <>
        <Building position={[0, 3.5, 0]} size={[2.4, 7, 2.4]} hue="#5b9bff" intensity={hover ? 2.6 : 2.1} repeatY={7} />
        <Building position={[0, 7.8, 0]} size={[1.7, 2.2, 1.7]} hue="#7db5ff" intensity={2.2} repeatY={2} />
        {/* glowing crown + antenna */}
        <mesh position={[0, 9.1, 0]}>
          <boxGeometry args={[1.1, 0.5, 1.1]} />
          <meshBasicMaterial color="#9cc7ff" toneMapped={false} />
        </mesh>
        <mesh position={[0, 10.0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.4, 6]} />
          <meshBasicMaterial color="#cfe2ff" toneMapped={false} />
        </mesh>
        <mesh position={[0, 10.8, 0]}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshBasicMaterial color="#dcebff" toneMapped={false} />
        </mesh>
      </>}
      {/* breathing aura */}
      <mesh ref={auraRef} position={[0, 3, 0]}>
        <sphereGeometry args={[5.5, 24, 24]} />
        <meshBasicMaterial color={col} transparent opacity={0.1} toneMapped={false} />
      </mesh>
      {/* point light from the tower */}
      <pointLight position={[0, 6, 0]} color={col} intensity={28} distance={26} decay={2} />
      <Html position={[0, showBuildings ? 11.6 : 6.5, 0]} center distanceFactor={20} zIndexRange={[20, 0]}>
        <div
          onClick={(e) => { e.stopPropagation(); onSelect("hq"); }}
          className="select-none whitespace-nowrap text-center pointer-events-auto" style={{ cursor: "pointer" }}
        >
          <div className="text-[12px] font-black text-white tracking-wider px-3 py-1 rounded-md backdrop-blur-md"
            style={{ background: "rgba(6,10,20,0.78)", border: `1px solid ${col}77`, boxShadow: `0 0 22px ${col}55` }}>
            NXS — Orchestrator OS
          </div>
        </div>
      </Html>
    </group>
  );
}

// ── Conduits with flowing data packets ────────────────────────────────────────

function Conduit({ d, activity }: { d: District3D; activity: Activity3D }) {
  const ang = (ANGLES[d.id] ?? 0) * Math.PI / 180;
  const end = new THREE.Vector3(Math.cos(ang) * RAD, 0.06, Math.sin(ang) * RAD);
  const start = new THREE.Vector3(Math.cos(ang) * 4.6, 0.06, Math.sin(ang) * 4.6);
  const mid = start.clone().lerp(end, 0.5);
  mid.y = 0.9; // gentle arc up
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(start, mid, end), [d.id]);
  const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 40, 0.045, 8, false), [curve]);
  const col = activity.alert ? ALERT : d.hue;

  const count = 1 + Math.round(activity.level * 3);
  const speed = 0.12 + activity.level * 0.22;
  const packets = useRef<THREE.Mesh[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const m = packets.current[i];
      if (!m) continue;
      const u = ((t * speed + i / count) % 1);
      const p = curve.getPointAt(u);
      m.position.copy(p);
      const fade = Math.sin(u * Math.PI); // dim at the ends
      (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + fade * 0.65;
    }
  });

  return (
    <group>
      <mesh geometry={tubeGeo}>
        <meshBasicMaterial color={col} transparent opacity={0.32} toneMapped={false} />
      </mesh>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) packets.current[i] = el; }}>
          <sphereGeometry args={[activity.alert ? 0.13 : 0.1, 12, 12]} />
          <meshBasicMaterial color={col} transparent toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function Scene({ districts, activity, onSelect }: {
  districts: District3D[];
  activity: Record<string, Activity3D>;
  onSelect: (id: string) => void;
}) {
  const hqAct = activity.hq ?? { level: 1, alert: false };
  const hasModel = useCityModel();

  // Procedural buildings (used when no model is dropped in, and as the
  // fallback while/if the model can't load).
  const proceduralBuildings = (
    <>
      <CentralTower activity={hqAct} onSelect={onSelect} />
      {districts.map((d) => (
        <DistrictCluster key={d.id} d={d} activity={activity[d.id] ?? { level: 0.2, alert: false }} onSelect={onSelect} />
      ))}
    </>
  );

  // Light overlay (no boxes) for when an imported model supplies the geometry.
  const modelOverlay = (
    <>
      <CentralTower activity={hqAct} onSelect={onSelect} showBuildings={false} />
      {districts.map((d) => (
        <DistrictCluster key={d.id} d={d} activity={activity[d.id] ?? { level: 0.2, alert: false }} onSelect={onSelect} showBuildings={false} />
      ))}
    </>
  );

  return (
    <>
      <color attach="background" args={["#05070d"]} />
      <fog attach="fog" args={["#05070d", 22, 60]} />
      <ambientLight intensity={0.18} />
      <directionalLight position={[10, 18, 8]} intensity={0.25} color="#9db4e8" />

      {/* reflective floor */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[120, 120]} />
        <MeshReflectorMaterial
          resolution={1024}
          blur={[400, 120]}
          mixBlur={1}
          mixStrength={28}
          depthScale={1.1}
          minDepthThreshold={0.4}
          color="#06080f"
          metalness={0.85}
          roughness={0.55}
          mirror={0}
        />
      </mesh>
      {/* faint ground grid */}
      <gridHelper args={[120, 120, "#16243f", "#0c1626"]} position={[0, 0.01, 0]} />

      {hasModel ? (
        <ModelBoundary fallback={proceduralBuildings}>
          <Suspense fallback={proceduralBuildings}>
            <CityModel />
            {modelOverlay}
          </Suspense>
        </ModelBoundary>
      ) : (
        proceduralBuildings
      )}

      {districts.map((d) => (
        <Conduit key={d.id} d={d} activity={activity[d.id] ?? { level: 0.2, alert: false }} />
      ))}

      <OrbitControls
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.32}
        minDistance={16}
        maxDistance={42}
        minPolarAngle={0.5}
        maxPolarAngle={Math.PI / 2.35}
        target={[0, 2.5, 0]}
      />
      <EffectComposer>
        <Bloom intensity={1.15} luminanceThreshold={0.18} luminanceSmoothing={0.5} mipmapBlur />
        <Vignette eskil={false} offset={0.22} darkness={0.85} />
      </EffectComposer>
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export default function City3D({ districts, activity, onSelect }: {
  districts: District3D[];
  activity: Record<string, Activity3D>;
  onSelect: (id: string) => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [19, 15, 19], fov: 30 }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <Suspense fallback={null}>
        <Scene districts={districts} activity={activity} onSelect={onSelect} />
      </Suspense>
    </Canvas>
  );
}
