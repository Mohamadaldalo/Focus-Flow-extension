interface ApertureTimerProps {
  progress: number;
  timeLabel: string;
  modeLabel: string;
  tone: "focus" | "break" | "idle";
  size?: number;
}

const TONE_COLORS: Record<ApertureTimerProps["tone"], string> = {
  focus:  "#4A8FE7",  // NEU blue
  break:  "#D4A017",  // NEU gold
  idle:   "#7A90B5",  // muted
};

export function ApertureTimer({ progress, timeLabel, modeLabel, tone, size = 320 }: ApertureTimerProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = size * 0.38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);
  const color = TONE_COLORS[tone];
  const center = size / 2;
  const bladeCount = 16;
  const bladeInner = radius + size * 0.035;
  const bladeOuter = radius + size * 0.075;
  const rotation = clamped * 60;

  const blades = Array.from({ length: bladeCount }).map((_, i) => {
    const angle = (i / bladeCount) * 360;
    return (
      <line
        key={i}
        x1={center} y1={center - bladeInner}
        x2={center} y2={center - bladeOuter}
        stroke={color}
        strokeWidth={size * 0.006}
        strokeLinecap="round"
        opacity={0.55}
        transform={`rotate(${angle} ${center} ${center})`}
      />
    );
  });

  return (
    <div
      className="relative inline-flex items-center justify-center rounded-full transition-shadow duration-700"
      style={{
        width: size,
        height: size,
        boxShadow: tone === "focus" ? `0 0 60px -10px ${color}55` : undefined,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${center}px ${center}px`, transition: "transform 1s linear" }}>
          {blades}
        </g>
        {/* track */}
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#263D6B" strokeWidth={size * 0.025} />
        {/* progress arc */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.025}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.6s ease" }}
        />
      </svg>

      <div className="absolute flex flex-col items-center">
        <span className="font-mono tabular-nums text-paper" style={{ fontSize: size * 0.155, lineHeight: 1 }}>
          {timeLabel}
        </span>
        <span className="mt-2 font-display text-muted tracking-wide" style={{ fontSize: size * 0.045 }}>
          {modeLabel}
        </span>
      </div>
    </div>
  );
}