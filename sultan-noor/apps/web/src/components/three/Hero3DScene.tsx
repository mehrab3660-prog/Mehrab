"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { useCart } from "@/context/CartContext";
import type { SceneHotspot } from "@/lib/types";
import { API_ORIGIN } from "@/lib/api";

function formatToman(value: string | number) {
  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}

// Colors mirror the site's committed Dark Premium palette (globals.css
// @theme) rather than introducing a second palette just for the 3D layer.
const COLORS = {
  floor: "#0b1220",
  wall: "#101b2e",
  wallAccent: "#1c2740",
  brand: "#f5b82e",
  brandLight: "#ffd873",
  metal: "#2a3550",
};

function Lamp({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <group position={[0, 1.55, -0.6]}>
      {/* cord */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.7, 8]} />
        <meshStandardMaterial color={COLORS.metal} />
      </mesh>
      {/* bulb — click toggles the visual light only, never real product state */}
      <mesh
        position={[0, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial
          color={on ? COLORS.brandLight : "#3a3a3a"}
          emissive={on ? COLORS.brand : "#000000"}
          emissiveIntensity={on ? 2 : 0}
        />
      </mesh>
      {on && <pointLight color={COLORS.brand} intensity={8} distance={6} decay={2} />}
    </group>
  );
}

function WallSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <mesh
      position={[1.4, 0.4, -0.98]}
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
    <mesh position={[-1.4, -0.6, -0.98]}>
      <boxGeometry args={[0.16, 0.16, 0.03]} />
      <meshStandardMaterial color={COLORS.metal} />
    </mesh>
  );
}

function SmartHub() {
  return (
    <mesh position={[1.1, -0.55, -0.5]}>
      <cylinderGeometry args={[0.1, 0.1, 0.05, 24]} />
      <meshStandardMaterial color={COLORS.brandLight} emissive={COLORS.brand} emissiveIntensity={0.4} />
    </mesh>
  );
}

function Room({ lampOn, onToggleLamp, switchOn, onToggleSwitch }: { lampOn: boolean; onToggleLamp: () => void; switchOn: boolean; onToggleSwitch: () => void }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={COLORS.floor} />
      </mesh>
      <mesh position={[0, 0.5, -1]}>
        <planeGeometry args={[6, 3]} />
        <meshStandardMaterial color={COLORS.wall} />
      </mesh>
      <mesh position={[0, 1.9, -1]}>
        <boxGeometry args={[6, 0.1, 0.2]} />
        <meshStandardMaterial color={COLORS.wallAccent} />
      </mesh>
      <Lamp on={lampOn} onToggle={onToggleLamp} />
      <WallSwitch on={switchOn} onToggle={onToggleSwitch} />
      <Socket />
      <SmartHub />
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

export default function Hero3DScene({ hotspots }: { hotspots: SceneHotspot[] }) {
  const [lampOn, setLampOn] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [activeHotspot, setActiveHotspot] = useState<SceneHotspot | null>(null);

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

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "low-power" }}
        camera={{ position: [2.4, 0.6, 2.6], fov: 45 }}
        aria-hidden="true"
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 2]} intensity={0.6} />
        <group>
          <Room lampOn={lampOn} onToggleLamp={() => setLampOn((v) => !v)} switchOn={switchOn} onToggleSwitch={() => setSwitchOn((v) => !v)} />
          {resolvedHotspots.map((h) => (
            <HotspotMarker key={h.id} hotspot={h} onOpen={setActiveHotspot} />
          ))}
        </group>
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom
          enableRotate
          minDistance={1.8}
          maxDistance={4.5}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.05}
          minAzimuthAngle={-Math.PI / 3}
          maxAzimuthAngle={Math.PI / 3}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      {activeHotspot && <HotspotPopover hotspot={activeHotspot} onClose={() => setActiveHotspot(null)} />}
    </div>
  );
}
