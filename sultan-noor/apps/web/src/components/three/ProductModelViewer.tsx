"use client";

import { Suspense, useRef, useState, type ComponentRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF } from "@react-three/drei";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-foreground/50">
      در حال بارگذاری مدل سه‌بعدی...
    </div>
  );
}

export default function ProductModelViewer({ url, onFallback }: { url: string; onFallback: () => void }) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function resetCamera() {
    controlsRef.current?.reset();
  }

  async function toggleFullscreen() {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.().catch(() => {});
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.().catch(() => {});
      setFullscreen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border-color bg-surface-2">
      <Suspense fallback={<Loading />}>
        <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 3], fov: 40 }} onError={onFallback}>
          <Stage environment="city" intensity={0.5}>
            <Model url={url} />
          </Stage>
          <OrbitControls ref={controlsRef} enablePan={false} minDistance={1.2} maxDistance={6} enableDamping />
        </Canvas>
      </Suspense>
      <div className="absolute bottom-3 left-3 flex gap-2">
        <button
          type="button"
          onClick={resetCamera}
          className="rounded-lg border border-border-color bg-surface/90 px-3 py-1.5 text-xs font-bold backdrop-blur hover:border-brand/50"
        >
          بازنشانی دوربین
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-lg border border-border-color bg-surface/90 px-3 py-1.5 text-xs font-bold backdrop-blur hover:border-brand/50"
        >
          {fullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
        </button>
      </div>
    </div>
  );
}
