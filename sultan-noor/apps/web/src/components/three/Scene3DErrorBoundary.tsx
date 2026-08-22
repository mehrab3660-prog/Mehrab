"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

// A 3D scene must never take the storefront down with it (Sprint 9 §17) —
// a lost WebGL context, a corrupted/missing model, or any other renderer
// error is caught here and swapped for the caller's 2D fallback instead of
// crashing the page.
export class Scene3DErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("3D scene failed, falling back to 2D:", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
