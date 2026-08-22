"use client";

import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, MeshReflectorMaterial } from "@react-three/drei";
import { useCart } from "@/context/CartContext";
import type { SceneHotspot } from "@/lib/types";
import { API_ORIGIN } from "@/lib/api";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

// Colors mirror the site's committed Dark Premium palette (globals.css
// @theme) rather than introducing a second palette just for the 3D layer.
// Interior tones lean warm (wood/amber) to match the "warm modern home"
// brief; exterior tones lean cool/dusk to read as night outside.
const COLORS = {
  floor: "#0b1220",
  wall: "#2a2018",
  wallAccent: "#3a2c1c",
  brand: "#f5b82e",
  brandLight: "#ffd873",
  metal: "#2a3550",
  window: "#ffd9a0",
  night: "#070a12",
  houseWall: "#241a12",
  roof: "#160f0a",
  ground: "#0c1410",
  tree: "#0d1c14",
};

// A real enclosed interior room (floor + ceiling + back + two side walls)
// so it has depth from every orbit angle instead of reading as a flat
// backdrop.
const ROOM_HALF = 3;
const FLOOR_Y = -1;
const CEILING_Y = 1.6;
const WALL_Y = (FLOOR_Y + CEILING_Y) / 2;
const WALL_H = CEILING_Y - FLOOR_Y;

// Named camera waypoints for the exterior → entrance → interior sequence
// (Sprint 9 redesign, §1-3 of the owner's brief).
const CAM_EXTERIOR = { pos: new THREE.Vector3(5.5, 1.8, 8), look: new THREE.Vector3(0, 1, -1) };
const CAM_APPROACH = { pos: new THREE.Vector3(0.3, 1.2, 2.3), look: new THREE.Vector3(0, 1, 0.4) };
const CAM_INTERIOR = { pos: new THREE.Vector3(2.6, 0.5, 3.2), look: new THREE.Vector3(0, 0.2, -1) };

type Stage = "exterior" | "approaching" | "interior";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

// Drives the camera during the scripted "walking toward the door" beat and
// snaps it (instantly, only while the screen is faded to black) whenever
// the exterior/interior stage settles — OrbitControls owns the camera the
// rest of the time, so this never fights the user's own drag/orbit.
type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;

function StageCamera({ stage, controlsRef }: { stage: Stage; controlsRef: RefObject<OrbitControlsHandle | null> }) {
  const { camera } = useThree();
  const prevStage = useRef<Stage>(stage);

  useEffect(() => {
    if (stage === prevStage.current) return;
    prevStage.current = stage;
    if (stage === "approaching") return; // handled frame-by-frame below
    const target = stage === "interior" ? CAM_INTERIOR : CAM_EXTERIOR;
    camera.position.copy(target.pos);
    camera.lookAt(target.look);
    controlsRef.current?.target.copy(target.look);
    controlsRef.current?.update();
  }, [stage, camera, controlsRef]);

  useFrame((_, delta) => {
    if (stage !== "approaching") return;
    const t = 1 - Math.pow(0.001, delta);
    camera.position.lerp(CAM_APPROACH.pos, t);
    camera.lookAt(CAM_APPROACH.look);
  });

  return null;
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, -0.9, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 0.5, 6]} />
        <meshStandardMaterial color="#3a2a1a" />
      </mesh>
      <mesh position={[0, -0.3, 0]}>
        <coneGeometry args={[0.55, 1.1, 8]} />
        <meshStandardMaterial color={COLORS.tree} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <coneGeometry args={[0.4, 0.9, 8]} />
        <meshStandardMaterial color={COLORS.tree} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <coneGeometry args={[0.25, 0.7, 8]} />
        <meshStandardMaterial color={COLORS.tree} />
      </mesh>
    </group>
  );
}

// The exterior "house among the trees at dusk" scene the owner asked for —
// stylized, primitive-based geometry (no photoreal textures/assets exist
// for this store), styled toward the reference image's mood.
function ExteriorScene({ onEnter }: { onEnter: () => void }) {
  const treePositions: [number, number, number][] = [
    [-3.2, -1, -2.5],
    [-2.6, -1, 0.5],
    [3, -1, -2],
    [3.6, -1, 0.8],
    [-4, -1, 2.2],
    [4.2, -1, -0.5],
  ];

  return (
    <group>
      <fog attach="fog" args={[COLORS.night, 6, 20]} />
      <color attach="background" args={[COLORS.night]} />
      <ambientLight intensity={0.25} color="#8fb0ff" />
      <directionalLight position={[-4, 6, -3]} intensity={0.3} color="#8fb0ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={COLORS.ground} roughness={1} />
      </mesh>

      {treePositions.map((p, i) => (
        <Tree key={i} position={p} scale={0.9 + (i % 3) * 0.2} />
      ))}

      {/* house body */}
      <mesh position={[0, 0.5, -1]} castShadow>
        <boxGeometry args={[4, 3, 3]} />
        <meshStandardMaterial color={COLORS.houseWall} roughness={0.9} />
      </mesh>
      {/* roof */}
      <mesh position={[0, 2.5, -1]} rotation={[0, Math.PI / 4, 0]} scale={[1, 1, 1.9]}>
        <coneGeometry args={[2.6, 1.4, 4]} />
        <meshStandardMaterial color={COLORS.roof} roughness={1} />
      </mesh>
      {/* chimney */}
      <mesh position={[1.2, 3.4, -1.6]}>
        <boxGeometry args={[0.3, 0.9, 0.3]} />
        <meshStandardMaterial color="#1a1310" />
      </mesh>

      {/* door — the click target that starts the walk-in sequence */}
      <mesh
        position={[0, -0.4, 0.52]}
        onClick={(e) => {
          e.stopPropagation();
          onEnter();
        }}
      >
        <boxGeometry args={[0.7, 1.4, 0.08]} />
        <meshStandardMaterial color="#171009" />
      </mesh>
      <mesh position={[0.32, -0.4, 0.57]}>
        <boxGeometry args={[0.03, 0.15, 0.03]} />
        <meshStandardMaterial color={COLORS.brand} emissive={COLORS.brand} emissiveIntensity={1} />
      </mesh>

      {/* warm lit windows either side of the door */}
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.52]}>
          <planeGeometry args={[0.7, 0.9]} />
          <meshStandardMaterial color={COLORS.window} emissive={COLORS.window} emissiveIntensity={1.2} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 0.52]}>
        <planeGeometry args={[1.6, 0.6]} />
        <meshStandardMaterial color={COLORS.window} emissive={COLORS.window} emissiveIntensity={1} />
      </mesh>

      <pointLight position={[0, 0.2, 1.4]} color={COLORS.window} intensity={4} distance={5} decay={2} />
      <pointLight position={[-1.1, 0.3, 1]} color={COLORS.window} intensity={2} distance={3} decay={2} />
      <pointLight position={[1.1, 0.3, 1]} color={COLORS.window} intensity={2} distance={3} decay={2} />
    </group>
  );
}

function Lamp({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <group position={[0, CEILING_Y, -0.8]}>
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.6, 8]} />
        <meshStandardMaterial color={COLORS.metal} />
      </mesh>
      <mesh position={[0, -0.58, 0]}>
        <coneGeometry args={[0.22, 0.22, 24, 1, true]} />
        <meshStandardMaterial color={COLORS.metal} side={THREE.DoubleSide} />
      </mesh>
      {/* bulb — click toggles the visual light only, never real product state */}
      <mesh
        position={[0, -0.68, 0]}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshStandardMaterial
          color={on ? COLORS.brandLight : "#3a3a3a"}
          emissive={on ? COLORS.brand : "#000000"}
          emissiveIntensity={on ? 2.2 : 0}
        />
      </mesh>
      {on && <pointLight position={[0, -0.68, 0]} color={COLORS.brand} intensity={10} distance={7} decay={2} castShadow />}
    </group>
  );
}

function WallSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <mesh
      position={[1.6, 0.1, -ROOM_HALF + 0.05]}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <boxGeometry args={[0.18, 0.28, 0.04]} />
      <meshStandardMaterial color={on ? COLORS.brand : COLORS.metal} />
    </mesh>
  );
}

function Socket() {
  return (
    <mesh position={[-1.6, FLOOR_Y + 0.4, -ROOM_HALF + 0.05]}>
      <boxGeometry args={[0.16, 0.16, 0.03]} />
      <meshStandardMaterial color={COLORS.metal} />
    </mesh>
  );
}

function SmartHub() {
  return (
    <mesh position={[1.3, FLOOR_Y + 0.025, -ROOM_HALF + 0.8]} castShadow>
      <cylinderGeometry args={[0.1, 0.1, 0.05, 24]} />
      <meshStandardMaterial color={COLORS.brandLight} emissive={COLORS.brand} emissiveIntensity={0.4} />
    </mesh>
  );
}

function InteriorScene({
  lampOn,
  onToggleLamp,
  switchOn,
  onToggleSwitch,
  highQuality,
  hotspots,
  onOpenHotspot,
  onExit,
}: {
  lampOn: boolean;
  onToggleLamp: () => void;
  switchOn: boolean;
  onToggleSwitch: () => void;
  highQuality: boolean;
  hotspots: SceneHotspot[];
  onOpenHotspot: (h: SceneHotspot) => void;
  onExit: () => void;
}) {
  return (
    <group>
      <color attach="background" args={[COLORS.wall]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 4]} intensity={0.5} castShadow={highQuality} />

      {/* floor — a soft real-time reflection sells a premium interior far
          better than a flat matte plane. Skipped on mobile: it's the single
          most expensive effect in this scene. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} receiveShadow>
        <planeGeometry args={[ROOM_HALF * 2, ROOM_HALF * 2]} />
        {highQuality ? (
          <MeshReflectorMaterial
            blur={[300, 100]}
            resolution={512}
            mixBlur={1}
            mixStrength={35}
            roughness={0.9}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.2}
            color={COLORS.floor}
            metalness={0.3}
          />
        ) : (
          <meshStandardMaterial color={COLORS.floor} />
        )}
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING_Y, 0]}>
        <planeGeometry args={[ROOM_HALF * 2, ROOM_HALF * 2]} />
        <meshStandardMaterial color={COLORS.wall} />
      </mesh>

      <mesh position={[0, WALL_Y, -ROOM_HALF]} receiveShadow>
        <planeGeometry args={[ROOM_HALF * 2, WALL_H]} />
        <meshStandardMaterial color={COLORS.wall} />
      </mesh>

      <mesh position={[-ROOM_HALF, WALL_Y, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_HALF * 2, WALL_H]} />
        <meshStandardMaterial color={COLORS.wallAccent} />
      </mesh>

      <mesh position={[ROOM_HALF, WALL_Y, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_HALF * 2, WALL_H]} />
        <meshStandardMaterial color={COLORS.wallAccent} />
      </mesh>

      {/* window on the left wall — a second, cooler light source that
          contrasts the lamp's warm glow */}
      <mesh position={[-ROOM_HALF + 0.02, 0.5, -0.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.2, 1.4]} />
        <meshStandardMaterial color="#bcd9ff" emissive="#bcd9ff" emissiveIntensity={0.4} />
      </mesh>
      <pointLight position={[-ROOM_HALF + 0.6, 0.5, -0.6]} color="#bcd9ff" intensity={1.5} distance={4} decay={2} />

      <Lamp on={lampOn} onToggle={onToggleLamp} />
      <WallSwitch on={switchOn} onToggle={onToggleSwitch} />
      <Socket />
      <SmartHub />

      {hotspots.map((h) => (
        <HotspotMarker key={h.id} hotspot={h} onOpen={onOpenHotspot} />
      ))}

      {/* door back to the exterior view, on the near (open) side of the room */}
      <Html position={[0, FLOOR_Y + 0.05, ROOM_HALF - 0.3]} center distanceFactor={8} zIndexRange={[5, 0]}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExit();
          }}
          className="rounded-full border border-border-color bg-black/70 px-3 py-1.5 text-xs font-bold text-white backdrop-blur transition hover:border-brand/50"
        >
          ← نمای بیرونی
        </button>
      </Html>
    </group>
  );
}

function HotspotMarker({ hotspot, onOpen }: { hotspot: SceneHotspot; onOpen: (h: SceneHotspot) => void }) {
  return (
    <Html position={[hotspot.position.x, hotspot.position.y, hotspot.position.z]} center distanceFactor={6} zIndexRange={[10, 0]}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(hotspot);
        }}
        aria-label={`مشاهده محصول: ${hotspot.product.name}`}
        className="flex h-9 w-9 animate-pulse items-center justify-center rounded-full border-2 border-brand bg-black/70 text-base shadow-[0_0_16px_rgba(245,184,46,0.6)] transition hover:animate-none hover:scale-110"
      >
        {hotspot.icon}
      </button>
    </Html>
  );
}

function HotspotPopover({ hotspot, onClose }: { hotspot: SceneHotspot; onClose: () => void }) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const p = hotspot.product;

  async function handleAddToCart() {
    setAdding(true);
    try {
      await addItem(p.id, 1);
      setAdded(true);
    } catch {
      // Silently ignored — the "مشاهده محصول" link below always works as a
      // fallback if add-to-cart fails (e.g. logged out, out of stock).
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={p.name}
      className="absolute bottom-4 left-1/2 z-20 w-[min(90%,320px)] -translate-x-1/2 rounded-2xl border border-border-color bg-surface/95 p-4 shadow-2xl backdrop-blur"
    >
      <button onClick={onClose} aria-label="بستن" className="absolute left-3 top-3 text-foreground/50 hover:text-foreground">
        ✕
      </button>
      <div className="flex gap-3">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-lg bg-surface-2" />
        )}
        <div className="min-w-0 flex-1">
          {p.brand && <p className="truncate text-xs text-foreground/50">{p.brand}</p>}
          <p className="truncate text-sm font-bold">{p.name}</p>
          <p className="mt-1 text-sm font-extrabold text-brand">{formatToman(p.price)}</p>
          <p className={`text-xs ${p.inStock ? "text-emerald-400" : "text-red-400"}`}>{p.inStock ? "موجود" : "ناموجود"}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <a
          href={`/products/${p.slug}`}
          className="flex-1 rounded-lg border border-border-color py-2 text-center text-xs font-bold hover:border-brand/50"
        >
          مشاهده محصول
        </a>
        <button
          onClick={handleAddToCart}
          disabled={!p.inStock || adding || added}
          className="flex-1 rounded-lg bg-brand py-2 text-xs font-bold text-[#0b0e14] disabled:opacity-50"
        >
          {added ? "افزوده شد ✓" : adding ? "..." : "افزودن به سبد"}
        </button>
      </div>
    </div>
  );
}

// How long (ms) the camera spends visibly walking toward the door before
// the screen fades to black and the scene swaps to the interior.
const APPROACH_MS = 1200;
const FADE_MS = 400;

export default function Hero3DScene({ hotspots }: { hotspots: SceneHotspot[] }) {
  const [stage, setStage] = useState<Stage>("exterior");
  const [fade, setFade] = useState(0);
  const [lampOn, setLampOn] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [activeHotspot, setActiveHotspot] = useState<SceneHotspot | null>(null);
  const isMobile = useIsMobile();
  const controlsRef = useRef<OrbitControlsHandle>(null);

  // Resolves relative image URLs the same way the rest of the storefront
  // does, so hotspot popovers show real uploaded product photos.
  const resolvedHotspots = useMemo(
    () =>
      hotspots.map((h) => ({
        ...h,
        product: {
          ...h.product,
          imageUrl: h.product.imageUrl && !h.product.imageUrl.startsWith("http") ? `${API_ORIGIN}${h.product.imageUrl}` : h.product.imageUrl,
        },
      })),
    [hotspots],
  );

  function enterHouse() {
    if (stage !== "exterior") return;
    setStage("approaching");
    window.setTimeout(() => {
      setFade(1);
      window.setTimeout(() => {
        setStage("interior");
        window.setTimeout(() => setFade(0), 30);
      }, FADE_MS);
    }, APPROACH_MS);
  }

  function exitHouse() {
    setFade(1);
    window.setTimeout(() => {
      setStage("exterior");
      window.setTimeout(() => setFade(0), 30);
    }, FADE_MS);
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows={!isMobile}
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        gl={{ antialias: true, powerPreference: "low-power" }}
        camera={{ position: [CAM_EXTERIOR.pos.x, CAM_EXTERIOR.pos.y, CAM_EXTERIOR.pos.z], fov: 45 }}
        aria-hidden="true"
      >
        <StageCamera stage={stage} controlsRef={controlsRef} />
        {stage !== "interior" ? (
          <ExteriorScene onEnter={enterHouse} />
        ) : (
          <InteriorScene
            lampOn={lampOn}
            onToggleLamp={() => setLampOn((v) => !v)}
            switchOn={switchOn}
            onToggleSwitch={() => setSwitchOn((v) => !v)}
            highQuality={!isMobile}
            hotspots={resolvedHotspots}
            onOpenHotspot={setActiveHotspot}
            onExit={exitHouse}
          />
        )}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enabled={stage !== "approaching"}
          enablePan={false}
          enableZoom
          enableRotate
          minDistance={2}
          maxDistance={9}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 2.1}
          minAzimuthAngle={-Math.PI / 2.5}
          maxAzimuthAngle={Math.PI / 2.5}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      {/* fade-to-black mask for the exterior/interior scene swap */}
      <div
        className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: fade }}
        aria-hidden="true"
      />

      {stage === "exterior" && (
        <button
          type="button"
          onClick={enterHouse}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-[#0b0e14] shadow-lg shadow-brand/20"
        >
          ورود به خانه ←
        </button>
      )}

      {activeHotspot && <HotspotPopover hotspot={activeHotspot} onClose={() => setActiveHotspot(null)} />}
    </div>
  );
}
