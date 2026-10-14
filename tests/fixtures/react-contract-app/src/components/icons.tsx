import type { SVGProps } from "react";

const svg = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", "aria-hidden": true } as const;

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5" {...p}>
    <path d="M3 11l9-8 9 8M5 10v10h14V10" />
  </svg>
);
export const BasketIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5" {...p}>
    <path d="M4 9h16l-2 11H6zM9 9l3-5 3 5" />
  </svg>
);
export const BackIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5 rtl:-scale-x-100" {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5" {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg} className="size-5" {...p}>
    <path d="M12 8v5M12 16h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
  </svg>
);
