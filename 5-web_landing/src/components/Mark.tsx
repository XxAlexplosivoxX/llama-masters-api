/** The Tonalli sun: the same mark as the favicon. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden>
      <rect width="128" height="128" fill="#0B0F19" />
      <g fill="#ED5E5E">
        <rect x="72" y="12" width="8" height="16" />
        <rect x="72" y="16" width="8" height="12" transform="rotate(-45 76 64)" />
        <rect x="24" y="60" width="16" height="8" />
        <rect x="72" y="16" width="8" height="12" transform="rotate(-135 76 64)" />
        <rect x="72" y="100" width="8" height="16" />
      </g>
      <path
        fill="#F3845A"
        fillRule="evenodd"
        d="M76 36a28 28 0 1 1 0 56a28 28 0 1 1 0-56Z M76 44a20 20 0 0 1 0 40Z"
      />
    </svg>
  );
}
