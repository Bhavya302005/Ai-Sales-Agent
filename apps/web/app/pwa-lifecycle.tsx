"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "signalpath.pwa-install-dismissed.v1";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Installation remains optional; never block the authenticated application.
      });
    }

    if (isStandalone() || window.localStorage.getItem(DISMISSED_KEY) === "true") return;

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const safari = /safari/i.test(window.navigator.userAgent)
      && !/crios|fxios|edgios/i.test(window.navigator.userAgent);
    const iosHelpTimer = ios && safari
      ? window.setTimeout(() => setShowIosHelp(true), 0)
      : undefined;

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () => {
      if (iosHelpTimer !== undefined) window.clearTimeout(iosHelpTimer);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setShowIosHelp(false);
    setInstallPrompt(null);
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") dismiss();
  }

  if (!showIosHelp && !installPrompt) return null;

  return (
    <aside className="pwa-install-card" aria-label="Install SignalPath">
      <Image alt="" height={44} src="/apple-touch-icon.png" width={44} />
      <div className="pwa-install-copy">
        <strong>Install SignalPath</strong>
        {showIosHelp ? (
          <span>In Safari, tap Share, then Add to Home Screen.</span>
        ) : (
          <span>Add the app to your device for a standalone experience.</span>
        )}
      </div>
      {installPrompt ? (
        <button className="pwa-install-action" onClick={install} type="button">Install</button>
      ) : null}
      <button aria-label="Dismiss install instructions" className="pwa-install-dismiss" onClick={dismiss} type="button">
        ×
      </button>
    </aside>
  );
}
