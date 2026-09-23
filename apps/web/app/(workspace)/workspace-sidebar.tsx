"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { signOut } from "@/app/login/actions";
import type { Me, Workspace } from "@/lib/api";

import { PrimaryNav, type NavEntry } from "./primary-nav";

interface WorkspaceSidebarProps {
  workspace: Workspace;
  me: Me;
  navigation: NavEntry[];
}

export function WorkspaceSidebar({ workspace, me, navigation }: WorkspaceSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close drawer on route change during render
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsOpen(false);
  }

  // Handle escape key and lock body scroll while drawer is open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const integrationsNav: NavEntry[] = [
    { label: "Integrations", href: "/settings/integrations" },
  ];

  return (
    <>
      {/* Mobile Top Navigation Header */}
      <header className="mobile-header" aria-label="Mobile Navigation">
        <button
          type="button"
          id="mobile-nav-toggle"
          className="mobile-menu-trigger"
          onClick={() => setIsOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={isOpen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <Link className="mobile-brand" href="/onboarding">
          Signal<span>Path</span>
        </Link>

        <span className="mobile-workspace-pill" title={workspace.name}>
          {workspace.name}
        </span>
      </header>

      {/* Mobile Drawer Backdrop */}
      <div
        className={`mobile-drawer-backdrop ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile Slide-Over Drawer with all Navigation Options */}
      <div
        className={`mobile-drawer ${isOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Menu"
      >
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-brand">
            <Link className="brand" href="/onboarding" onClick={() => setIsOpen(false)}>
              Signal<span>Path</span>
            </Link>
            <div className="workspace-label">
              <span>Workspace</span>
              <strong>{workspace.name}</strong>
            </div>
          </div>
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <PrimaryNav navigation={navigation} onSelect={() => setIsOpen(false)} />

        <div className="mobile-drawer-bottom">
          <div className="mobile-sidebar-promo">
            <div className="mobile-promo-header">
              <span className="mobile-promo-dot" />
              <strong>Evidence-first calling</strong>
            </div>
            <p>Every call stays consent-gated, transcript-backed, and human-owned.</p>
          </div>

          <PrimaryNav navigation={integrationsNav} onSelect={() => setIsOpen(false)} />

          <div className="mobile-drawer-footer">
            <span className="mobile-drawer-role">Role: {me.role}</span>
            <form action={signOut}>
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Desktop Floating Sidebar (Preserved exactly as-is for desktop) */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <Link className="brand" href="/onboarding">
            Signal<span>Path</span>
          </Link>
          <div className="workspace-label">
            <span>Workspace</span>
            <strong>{workspace.name}</strong>
          </div>
        </div>
        <PrimaryNav navigation={navigation} />
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <p className="sidebar-promo-title">Evidence-first calling</p>
            <p className="sidebar-promo-copy">Every call stays consent-gated, transcript-backed, and human-owned.</p>
          </div>
          <PrimaryNav navigation={integrationsNav} />
          <div className="sidebar-footer">
            <span>{me.role}</span>
            <form action={signOut}>
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
