/**
 * Minimal inline line icons for the workspace sidebar.
 * Hand-authored (no icon library dependency) to match the thin, single-stroke
 * style used throughout the Hirevia design system. Each icon is 20x20,
 * inherits color via `currentColor`, and takes no props beyond className.
 */

type IconProps = { className?: string };

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function BusinessIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 21h18" />
      <path d="M6 21V9l6-5 6 5v12" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}

export function DiscoverIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function LeadsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

export function CampaignsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 11v2a2 2 0 0 0 2 2h1l3 5V4L6 9H5a2 2 0 0 0-2 2Z" />
      <path d="M14 8a4 4 0 0 1 0 8" />
      <path d="M17.5 5.5a8 8 0 0 1 0 13" />
    </svg>
  );
}

export function AnalyticsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function CallbacksIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1 .36 1.98.68 2.92a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.16-1.25a2 2 0 0 1 2.11-.45c.94.32 1.92.55 2.92.68A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

export function NotificationsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 3.5 1.5 5 1.5 6.5H4.5C4.5 13 6 11.5 6 8Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IntegrationsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <rect x="14" y="14" width="7" height="7" rx="1.4" />
    </svg>
  );
}

export function AdminIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  );
}

export function VoiceIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.45.7.76 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export const NAV_ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  "/onboarding": BusinessIcon,
  "/sources": DiscoverIcon,
  "/leads": LeadsIcon,
  "/campaigns": CampaignsIcon,
  "/analytics": AnalyticsIcon,
  "/callbacks": CallbacksIcon,
  "/notifications": NotificationsIcon,
  "/settings/integrations": IntegrationsIcon,
  "/admin": AdminIcon,
  "/voice-lab": VoiceIcon,
};
