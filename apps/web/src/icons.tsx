// Set de íconos de línea (estilo Feather/Heroicons), inline SVG en vez de emojis —
// heredan color de texto vía currentColor y se ven consistentes entre SO/navegador,
// a diferencia de los emojis de sistema.
import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconCheckSquare(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m8 12 3 3 5-6" />
    </Icon>
  );
}

export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </Icon>
  );
}

export function IconNote(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 2.5h9l4 4V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2Z" />
      <path d="M14.5 2.5V7h4.3M8 11h6M8 15h6" />
    </Icon>
  );
}

export function IconCar(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4.5 16v2.2a1 1 0 0 0 1 1H7a1 1 0 0 0 1-1V16M16 16v2.2a1 1 0 0 0 1 1h1.5a1 1 0 0 0 1-1V16" />
      <path d="M3.5 16v-4.2a2 2 0 0 1 .3-1L5.6 7a2 2 0 0 1 1.8-1.1h9.2A2 2 0 0 1 18.4 7l1.8 3.8a2 2 0 0 1 .3 1V16a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />
      <path d="M3.5 12.5h17M7 12.5V9M17 12.5V9" />
    </Icon>
  );
}

export function IconLogOut(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </Icon>
  );
}

export function IconX(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function IconCheckCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3L15.5 9.5" />
    </Icon>
  );
}

export function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 3.2 1 4.6 1.6 5.4a1 1 0 0 1-.8 1.6H5.2a1 1 0 0 1-.8-1.6C5 13.6 6 12.2 6 9Z" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" />
    </Icon>
  );
}

export function IconBellOff(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8.7 5.3A6 6 0 0 1 18 9c0 2.4.6 3.8 1.2 4.7M17.6 16H5.2a1 1 0 0 1-.8-1.6C5 13.6 6 12.2 6 9c0-.6.1-1.2.3-1.7" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0M2.5 2.5l19 19" />
    </Icon>
  );
}
