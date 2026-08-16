export default function SectionDivider() {
  return (
    <div aria-hidden className="my-6 flex items-center gap-3 sm:my-10">
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-border-color to-transparent" />
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-brand/60">
        <path
          d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.7.8.7 1.3v.3h5.6v-.3c0-.5.3-1 .7-1.3A6 6 0 0 0 12 3Z"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M9 18h6M10 21h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border-color to-transparent" />
    </div>
  );
}
