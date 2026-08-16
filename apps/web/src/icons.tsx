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

export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />
    </Icon>
  );
}

export function IconFolder(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
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

export function IconArrowLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </Icon>
  );
}

export function IconAlertTriangle(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 17.25h.01" />
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

export function IconRepeat(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M17 2.5 20.5 6 17 9.5" />
      <path d="M3.5 11V9a3 3 0 0 1 3-3h14" />
      <path d="M7 21.5 3.5 18 7 14.5" />
      <path d="M20.5 13v2a3 3 0 0 1-3 3h-14" />
    </Icon>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9c.5.4 1.1.8 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4-2-1.5Z" />
    </Icon>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m1 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7" />
      <path d="M10 11v6M14 11v6" />
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

export function IconFile(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M14 2.5H7a1.5 1.5 0 0 0-1.5 1.5v16A1.5 1.5 0 0 0 7 21.5h10a1.5 1.5 0 0 0 1.5-1.5V7.5L14 2.5Z" />
      <path d="M13.5 2.5V7a1 1 0 0 0 1 1h4" />
    </Icon>
  );
}

export function IconDownload(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v13m0 0-4.5-4.5M12 16l4.5-4.5" />
      <path d="M4.5 18.5V20a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </Icon>
  );
}

export function IconUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 20V7m0 0 4.5 4.5M12 7 7.5 11.5" />
      <path d="M4.5 18.5V20a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </Icon>
  );
}

export function IconPencil(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
    </Icon>
  );
}

export function IconChartBar(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
    </Icon>
  );
}

export function IconGripVertical(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconRobot(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3v3" />
      <rect x="5" y="6" width="14" height="13" rx="3" />
      <circle cx="9.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <path d="M9 16h6" />
      <path d="M3 11v3M21 11v3" />
    </Icon>
  );
}
