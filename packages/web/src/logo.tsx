/**
 * The Astra mark.
 *
 * An original mark: a stylized neural network node with flowing connections
 * representing AI cognition. Drawn from scratch with unique geometry.
 */
export function AstraLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Astra Agent AI"
    >
      <defs>
        <linearGradient id="astraNode" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd89e" />
          <stop offset="50%" stopColor="#f0a04e" />
          <stop offset="100%" stopColor="#e87d2e" />
        </linearGradient>
        <linearGradient id="astraLink" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8de8ff" />
          <stop offset="100%" stopColor="#4db8e8" />
        </linearGradient>
        <linearGradient id="astraPulse" x1="0.5" y1="0.5" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#fff5e6" />
          <stop offset="100%" stopColor="#ffcc80" />
        </linearGradient>
        <radialGradient id="astraGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe8b8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffb84d" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer glow ring */}
      <circle cx="32" cy="32" r="28" fill="url(#astraGlow)" />

      {/* Neural network connections - flowing lines */}
      <path
        d="M32 10 C38 14, 42 20, 44 28 C46 36, 46 44, 44 52 C42 60, 38 66, 32 70"
        stroke="url(#astraLink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.7"
        strokeDasharray="8 4"
      />
      <path
        d="M32 10 C26 14, 22 20, 20 28 C18 36, 18 44, 20 52 C22 60, 26 66, 32 70"
        stroke="url(#astraLink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.7"
        strokeDasharray="8 4"
      />
      <path
        d="M10 32 C14 26, 20 22, 28 20 C36 18, 44 18, 52 20 C60 22, 66 26, 70 32"
        stroke="url(#astraLink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.7"
        strokeDasharray="8 4"
      />
      <path
        d="M10 32 C14 38, 20 42, 28 44 C36 46, 44 46, 52 44 C60 42, 66 38, 70 32"
        stroke="url(#astraLink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.7"
        strokeDasharray="8 4"
      />

      {/* Diagonal connections */}
      <path
        d="M16 16 C22 22, 26 28, 28 32 C30 36, 32 40, 32 44"
        stroke="url(#astraLink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M48 16 C42 22, 38 28, 36 32 C34 36, 32 40, 32 44"
        stroke="url(#astraLink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M16 48 C22 42, 26 36, 28 32 C30 28, 32 24, 32 20"
        stroke="url(#astraLink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M48 48 C42 42, 38 36, 36 32 C34 28, 32 24, 32 20"
        stroke="url(#astraLink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* Central neural node - the core */}
      <circle cx="32" cy="32" r="14" fill="url(#astraNode)" stroke="#ffd9ab" strokeWidth="1.5" opacity="0.95" />

      {/* Inner pulse/core */}
      <circle cx="32" cy="32" r="7" fill="url(#astraPulse)" opacity="0.9" />

      {/* Synapse nodes - smaller circles at connection points */}
      <circle cx="32" cy="10" r="3.5" fill="url(#astraLink)" opacity="0.9" />
      <circle cx="32" cy="54" r="3.5" fill="url(#astraLink)" opacity="0.9" />
      <circle cx="10" cy="32" r="3.5" fill="url(#astraLink)" opacity="0.9" />
      <circle cx="54" cy="32" r="3.5" fill="url(#astraLink)" opacity="0.9" />
      <circle cx="18" cy="18" r="2.5" fill="url(#astraLink)" opacity="0.7" />
      <circle cx="46" cy="18" r="2.5" fill="url(#astraLink)" opacity="0.7" />
      <circle cx="18" cy="46" r="2.5" fill="url(#astraLink)" opacity="0.7" />
      <circle cx="46" cy="46" r="2.5" fill="url(#astraLink)" opacity="0.7" />

      {/* Animated pulse indicator */}
      <circle cx="32" cy="32" r="5" fill="none" stroke="url(#astraPulse)" strokeWidth="1.5" opacity="0.6">
        <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
