/** The Tonalli sun: the same mark as the favicon. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="9" className="fill-heat-4" />
      <circle cx="16" cy="16" r="4.5" className="fill-heat-6" />
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1="16"
          y1="2"
          x2="16"
          y2="5"
          className="stroke-heat-5"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${i * 45} 16 16)`}
        />
      ))}
    </svg>
  );
}
