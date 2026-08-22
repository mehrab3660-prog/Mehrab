"use client";

import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF } from "@react-three/drei";
import { useCart } from "@/context/CartContext";
import type { SceneHotspot } from "@/lib/types";
import { API_ORIGIN } from "@/lib/api";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

// Real CC0 assets (Kenney) — see public/models/THIRD_PARTY_LICENSES.md.
// No primitive-built house or furniture: every structural/furniture piece
// below is a loaded GLB model, never Box/Plane/Cylinder/Sphere geometry.
const EXT = "/models/exterior";
const INT = "/models/interior";

// Preload every model the scene will ever need the moment this module
// loads (i.e. as soon as the homepage scrolls it into view) — otherwise
// useGLTF() suspends the interior/exterior group and the canvas shows
// nothing at all for a beat while each GLB fetches, right when the fade
// finishes and the user is looking straight at it.
const EXTERIOR_MODEL_URLS = [`${EXT}/building-small-b.glb`, `${EXT}/grass-trees.glb`, `${EXT}/grass-trees-tall.glb`];
const INTERIOR_MODEL_URLS = [
  `${INT}/rugRounded.glb`,
  `${INT}/loungeDesignSofa.glb`,
  `${INT}/chairModernCushion.glb`,
  `${INT}/tableCoffee.glb`,
  `${INT}/cabinetTelevision.glb`,
  `${INT}/pottedPlant.glb`,
  `${INT}/lampRoundFloor.glb`,
];
[...EXTERIOR_MODEL_URLS, ...INTERIOR_MODEL_URLS].forEach((url) => useGLTF.preload(url));

const COLORS = {
  floor: "#3d2c1e",
  wall: "#5a4a3a",
  wallAccent: "#6b5847",
  brand: "#f5b82e",
  brandLight: "#ffd873",
  metal: "#2a3550",
  sky: "#cfe0e8",
  ground: "#6b6b4a",
};

// The source GLBs (Kenney's Starter Kit: City Builder / Furniture Kit) ship
// with flat, highly-saturated "toy" colors meant for a cartoon city-builder
// game. Muting saturation and lifting roughness on every material — without
// touching geometry — is what turns the same real asset from "game demo"
// into something closer to a warm architectural illustration.
function toneDownMaterial(mat: THREE.Material, { desaturate = 0.55, lighten = 0 }: { desaturate?: number; lighten?: number }) {
  const std = mat as THREE.MeshStandardMaterial;
  if (!std.color) return;
  if (lighten) {
    const hsl = { h: 0, s: 0, l: 0 };
    std.color.getHSL(hsl);
    std.color.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + lighten, 0, 1));
  }
  if (typeof std.roughness === "number") std.roughness = Math.max(std.roughness, 0.7);
  if (typeof std.metalness === "number") std.metalness = Math.min(std.metalness, 0.15);
  if (desaturate <= 0) return;
  // Kenney's low-poly kits paint color either as a flat material/vertex
  // color, or via a UV-mapped texture atlas (baseColorTexture) with an
  // untouched white baseColorFactor — a plain material.color edit only
  // ever affects the former, leaving textured meshes (like the house)
  // completely unchanged. Patching the compiled shader to blend the final
  // sampled color toward its own luminance desaturates both cases the same
  // way, which is what actually pulls the source's saturated "toy" palette
  // down into something calmer.
  std.onBeforeCompile = (shader) => {
    shader.uniforms.uDesaturate = { value: desaturate };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uDesaturate;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(luma), uDesaturate);
        }`,
      );
  };
  std.needsUpdate = true;
}

const ROOM_HALF = 3;
const FLOOR_Y = -1;
const CEILING_Y = 1.6;
const WALL_Y = (FLOOR_Y + CEILING_Y) / 2;
const WALL_H = CEILING_Y - FLOOR_Y;

const CAM_EXTERIOR = { pos: new THREE.Vector3(4.6, 2.2, 6), look: new THREE.Vector3(0, 1.2, -1) };
const CAM_APPROACH = { pos: new THREE.Vector3(0.2, 1.3, 2), look: new THREE.Vector3(0, 1, 0) };
const CAM_INTERIOR = { pos: new THREE.Vector3(2.6, 0.6, 3.2), look: new THREE.Vector3(0, 0.2, -1) };

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

// Loads a real GLB, clones it (so the same asset can be placed multiple
// times), enables shadows on every mesh, and normalizes it to sit centered
// on its own base at a given height — so composing a scene never depends
// on knowing each source model's raw scale/pivot in advance.
function GltfProp({
  url,
  position,
  rotation = [0, 0, 0],
  targetHeight,
  onClick,
  shadows = true,
  tone,
}: {
  url: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  targetHeight: number;
  onClick?: (e: { stopPropagation: () => void }) => void;
  shadows?: boolean;
  tone?: { desaturate?: number; lighten?: number };
}) {
  const { scene } = useGLTF(url);
  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = shadows;
        mesh.receiveShadow = shadows;
        if (tone) {
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => m.clone());
            mesh.material.forEach((m) => toneDownMaterial(m, tone));
          } else {
            mesh.material = mesh.material.clone();
            toneDownMaterial(mesh.material, tone);
          }
        }
      }
    });
    const box1 = new THREE.Box3().setFromObject(clone);
    const size1 = box1.getSize(new THREE.Vector3());
    clone.scale.setScalar(targetHeight / (size1.y || 1));
    const box2 = new THREE.Box3().setFromObject(clone);
    const center2 = box2.getCenter(new THREE.Vector3());
    clone.position.x -= center2.x;
    clone.position.z -= center2.z;
    clone.position.y -= box2.min.y;
    return clone;
    // tone's fields (not the object itself, a fresh literal on every render)
    // are the real deps here — keeps this memo stable across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, targetHeight, shadows, tone?.desaturate, tone?.lighten]);

  return <primitive object={prepared} position={position} rotation={rotation} onClick={onClick} />;
}

// Drives the camera during the scripted "walking toward the door" beat and
// snaps it (instantly, only while the screen is faded to black) whenever
// the exterior/interior stage settles — OrbitControls owns the camera the
// rest of the time, so this never fights the user's own drag/orbit.
function StageCamera({ stage, controlsRef }: { stage: Stage; controlsRef: RefObject<ComponentRef<typeof OrbitControls> | null> }) {
  const { camera } = useThree();
  const prevStage = useRef<Stage>(stage);

  useEffect(() => {
    if (stage === prevStage.current) return;
    prevStage.current = stage;
    if (stage === "approaching") return;
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

// A real house and trees under warm, soft golden-hour daylight — the
// owner's brief explicitly forbids simulating the house from Box/Plane/
// Cylinder/Sphere primitives, so the structure is a loaded CC0 GLB
// (Kenney's Starter Kit: City Builder). That source model ships with flat,
// highly-saturated "toy" colors meant for a cartoon city-builder game, so
// every mesh is re-tinted (tone prop) toward muted, natural tones instead —
// same real geometry, a calmer architectural read. The garage model was
// dropped entirely: a single house reads as a home, a house-plus-garage
// cluster reads as a game-asset diorama.
const HOUSE_TONE = { desaturate: 0.62, lighten: 0.08 };
const TREE_TONE = { desaturate: 0.35 };

function ExteriorScene({ onEnter }: { onEnter: () => void }) {
  // Kept behind/beside the house's front face (z <= -0.8) so trees frame
  // the house instead of standing between it and the camera.
  const treeSpots: { pos: [number, number, number]; h: number; tall?: boolean }[] = [
    { pos: [-3.4, -1, -2.4], h: 2.1 },
    { pos: [-4.3, -1, -0.8], h: 1.9, tall: true },
    { pos: [3.2, -1, -2.8], h: 2.2, tall: true },
    { pos: [4.2, -1, -1], h: 1.9 },
  ];

  return (
    <group>
      {/* Tighter fog hides the flat ground plane's edge sooner, so it reads
          as a garden clearing rather than an infinite game-map plane. */}
      <fog attach="fog" args={[COLORS.sky, 8, 20]} />
      <color attach="background" args={[COLORS.sky]} />
      <hemisphereLight args={[COLORS.sky, COLORS.ground, 0.9]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 6, 5]} intensity={2} color="#ffe6bf" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 3, -2]} intensity={0.4} color={COLORS.sky} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={COLORS.ground} roughness={1} />
      </mesh>

      {treeSpots.map((t, i) => (
        <GltfProp
          key={i}
          url={`${EXT}/${t.tall ? "grass-trees-tall" : "grass-trees"}.glb`}
          position={t.pos}
          targetHeight={t.h}
          tone={TREE_TONE}
        />
      ))}

      <GltfProp
        url={`${EXT}/building-small-b.glb`}
        position={[0, -1, -1.2]}
        targetHeight={3.1}
        tone={HOUSE_TONE}
        onClick={(e) => {
          e.stopPropagation();
          onEnter();
        }}
      />
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
      {on && <pointLight position={[0, -0.68, 0]} color={COLORS.brand} intensity={10} distance={7} decay={2} />}
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
    <mesh position={[1.3, FLOOR_Y + 0.025, -ROOM_HALF + 0.8]}>
      <cylinderGeometry args={[0.1, 0.1, 0.05, 24]} />
      <meshStandardMaterial color={COLORS.brandLight} emissive={COLORS.brand} emissiveIntensity={0.4} />
    </mesh>
  );
}

// A real, furnished living room — sofa/table/TV/chair/lamp/rug/plant are
// all loaded CC0 GLB models (Kenney Furniture Kit), never primitives. Only
// the room shell (walls/floor/ceiling) and the small electrical fixtures
// (switch/socket/hub, which are simple flat objects in real life too) stay
// as plain geometry.
function InteriorScene({
  lampOn,
  onToggleLamp,
  switchOn,
  onToggleSwitch,
  hotspots,
  onOpenHotspot,
  onExit,
}: {
  lampOn: boolean;
  onToggleLamp: () => void;
  switchOn: boolean;
  onToggleSwitch: () => void;
  hotspots: SceneHotspot[];
  onOpenHotspot: (h: SceneHotspot) => void;
  onExit: () => void;
}) {
  return (
    <group>
      <color attach="background" args={[COLORS.wall]} />
      <hemisphereLight args={["#fff2dd", COLORS.wall, 1.4]} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[3, 4, 4]} intensity={2.2} color="#fff2dd" />

      {/* A plain glossy material (not MeshReflectorMaterial) — the reflector's
          render-to-texture pass was found to conflict with shadow-mapped GLB
          furniture on some GPUs/drivers, silently leaving the canvas blank.
          A reliable render beats a fancier one that can fail for real
          customers. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
        <planeGeometry args={[ROOM_HALF * 2, ROOM_HALF * 2]} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.35} metalness={0.15} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING_Y, 0]}>
        <planeGeometry args={[ROOM_HALF * 2, ROOM_HALF * 2]} />
        <meshStandardMaterial color={COLORS.wall} />
      </mesh>

      <mesh position={[0, WALL_Y, -ROOM_HALF]}>
        <planeGeometry args={[ROOM_HALF * 2, WALL_H]} />
        <meshStandardMaterial color={COLORS.wall} />
      </mesh>

      <mesh position={[-ROOM_HALF, WALL_Y, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM_HALF * 2, WALL_H]} />
        <meshStandardMaterial color={COLORS.wallAccent} />
      </mesh>

      <mesh position={[ROOM_HALF, WALL_Y, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM_HALF * 2, WALL_H]} />
        <meshStandardMaterial color={COLORS.wallAccent} />
      </mesh>

      {/* window on the left wall — a dark wood frame with mullion bars around
          the glowing glass reads as an actual window, not a plain bright
          card; also a second, brighter light source so the room never ends
          up black-on-black */}
      <mesh position={[-ROOM_HALF + 0.015, 0.5, -0.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.4, 1.6]} />
        <meshStandardMaterial color={COLORS.wallAccent} roughness={0.8} />
      </mesh>
      <mesh position={[-ROOM_HALF + 0.02, 0.5, -0.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.2, 1.4]} />
        <meshStandardMaterial color="#eaf4ff" emissive="#eaf6ff" emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      <mesh position={[-ROOM_HALF + 0.03, 0.5, -0.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.2, 0.04]} />
        <meshStandardMaterial color={COLORS.wallAccent} />
      </mesh>
      <mesh position={[-ROOM_HALF + 0.03, 0.5, -0.6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.04, 1.4]} />
        <meshStandardMaterial color={COLORS.wallAccent} />
      </mesh>
      <pointLight position={[-ROOM_HALF + 1, 0.5, -0.6]} color="#dcefff" intensity={6} distance={6} decay={2} />

      {/* real furniture — tone-matched to the same muted, warm palette as
          the exterior house so both scenes read as one consistent design
          language rather than two different asset packs stitched together */}
      <GltfProp url={`${INT}/rugRounded.glb`} position={[0.3, FLOOR_Y, 0.6]} targetHeight={0.04} shadows={false} tone={{ desaturate: 0.3 }} />
      <GltfProp
        url={`${INT}/loungeDesignSofa.glb`}
        position={[0.6, FLOOR_Y, 1.6]}
        rotation={[0, Math.PI, 0]}
        targetHeight={0.85}
        shadows={false}
        tone={{ desaturate: 0.45, lighten: 0.05 }}
      />
      <GltfProp
        url={`${INT}/chairModernCushion.glb`}
        position={[-1.6, FLOOR_Y, 1.2]}
        rotation={[0, Math.PI / 4, 0]}
        targetHeight={0.78}
        shadows={false}
        tone={{ desaturate: 0.45, lighten: 0.05 }}
      />
      <GltfProp url={`${INT}/tableCoffee.glb`} position={[0.4, FLOOR_Y, 0.4]} targetHeight={0.38} shadows={false} tone={{ desaturate: 0.3 }} />
      <GltfProp
        url={`${INT}/cabinetTelevision.glb`}
        position={[0.2, FLOOR_Y, -ROOM_HALF + 0.35]}
        targetHeight={0.65}
        shadows={false}
        tone={{ desaturate: 0.3 }}
      />
      <GltfProp url={`${INT}/pottedPlant.glb`} position={[2.3, FLOOR_Y, -1.4]} targetHeight={0.95} shadows={false} tone={{ desaturate: 0.2 }} />
      <GltfProp
        url={`${INT}/lampRoundFloor.glb`}
        position={[-2.3, FLOOR_Y, 0.2]}
        targetHeight={1.15}
        shadows={false}
        tone={{ desaturate: 0.3, lighten: 0.05 }}
      />

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
// the screen fades to black and the scene swaps to the interior. The user
// can always skip straight to the fade via the "رد کردن" button.
const APPROACH_MS = 1100;
const FADE_MS = 350;

export default function Hero3DScene({ hotspots }: { hotspots: SceneHotspot[] }) {
  const [stage, setStage] = useState<Stage>("exterior");
  const [fade, setFade] = useState(0);
  const [lampOn, setLampOn] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [activeHotspot, setActiveHotspot] = useState<SceneHotspot | null>(null);
  const isMobile = useIsMobile();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const approachTimer = useRef<number | null>(null);

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

  function swapToInterior() {
    setFade(1);
    window.setTimeout(() => {
      setStage("interior");
      window.setTimeout(() => setFade(0), 30);
    }, FADE_MS);
  }

  function enterHouse() {
    if (stage !== "exterior") return;
    setStage("approaching");
    approachTimer.current = window.setTimeout(swapToInterior, APPROACH_MS);
  }

  function skipApproach() {
    if (approachTimer.current) window.clearTimeout(approachTimer.current);
    swapToInterior();
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
        gl={{ antialias: true, powerPreference: "low-power", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
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
          maxDistance={10}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 2.1}
          minAzimuthAngle={-Math.PI / 2.2}
          maxAzimuthAngle={Math.PI / 2.2}
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

      {stage === "approaching" && (
        <button
          type="button"
          onClick={skipApproach}
          className="absolute bottom-4 left-4 z-10 rounded-xl border border-border-color bg-black/60 px-3 py-2 text-xs font-bold text-white backdrop-blur"
        >
          رد کردن ←
        </button>
      )}

      {activeHotspot && <HotspotPopover hotspot={activeHotspot} onClose={() => setActiveHotspot(null)} />}
    </div>
  );
}
