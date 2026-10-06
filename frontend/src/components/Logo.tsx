export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14.5" stroke="#4A8FE7" strokeWidth="1.5" opacity="0.4" />
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * 360;
        return (
          <line
            key={i}
            x1="16" y1="6" x2="16" y2="11"
            stroke="#4A8FE7"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${angle} 16 16)`}
          />
        );
      })}
      <circle cx="16" cy="16" r="4.5" fill="#4A8FE7" />
    </svg>
  );
}