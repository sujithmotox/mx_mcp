export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <div className={`grid place-items-center rounded-lg bg-brand text-brand-fg ${className}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18 L9 6 L12 13 L15 6 L20 18" />
      </svg>
    </div>
  );
}
