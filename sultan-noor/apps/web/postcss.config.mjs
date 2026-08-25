const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Tailwind v4 wraps its output in native CSS `@layer` blocks, which
    // browsers older than ~2022 (Chrome <99, Firefox <97, Safari <15.4) don't
    // understand and silently drop entirely — losing every Tailwind class.
    // This flattens `@layer` into plain, specificity-boosted rules that
    // preserve the same cascade order without needing native support.
    "@csstools/postcss-cascade-layers": {},
  },
};

export default config;
