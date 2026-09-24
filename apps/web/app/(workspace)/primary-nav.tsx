"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ICONS } from "./nav-icons";

export type NavEntry = {
  label: string;
  href: string;
  badge?: number;
};

export function PrimaryNav({
  navigation,
  onSelect,
}: {
  navigation: readonly NavEntry[];
  onSelect?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary">
      {navigation.map(({ label, href, badge }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        const Icon = NAV_ICONS[href];
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "nav-link active" : "nav-link"}
            href={href}
            key={href}
            onClick={onSelect}
          >
            {Icon ? <Icon className="nav-link-icon" /> : null}
            <span className="nav-link-label">{label}</span>
            {badge ? <span className="nav-link-badge">{badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
