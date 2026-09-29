// Inline stroke icons (no icon font or CDN, so they work offline).
type P = { size?: number };
const base = (size = 26) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconWeek = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4M8 13h2M14 13h2M8 17h2M14 17h2" />
  </svg>
);

export const IconSettings = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

export const IconBack = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const IconDumbbell = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />
  </svg>
);

export const IconToday = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconLog = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </svg>
);

export const IconPlus = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMinus = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M5 12h14" />
  </svg>
);

export const IconClose = ({ size = 24 }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconCheck = ({ size = 22 }: P) => (
  <svg {...base(size)}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

export const IconChevron = ({ size = 22, dir = 'right' }: P & { dir?: 'left' | 'right' | 'down' | 'up' }) => {
  const d = { right: 'M9 6l6 6-6 6', left: 'M15 6l-6 6 6 6', down: 'M6 9l6 6 6-6', up: 'M6 15l6-6 6 6' }[dir];
  return (
    <svg {...base(size)}>
      <path d={d} />
    </svg>
  );
};
