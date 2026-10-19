"use client";

import { useEffect, useRef } from "react";

/**
 * Registers the PdfEditz service worker so the editor installs as a PWA and
 * keeps working offline. Mounted once from the app root.
 *
 * - Only registers in the browser and only when a worker is supported.
 * - Silently no-ops on `file://` (some local/dev setups) and during SSR.
 * - When a newer worker takes control it asks it to skip waiting, so the next
 *   navigation serves fresh code without a hard reload prompt.
 */
export default function PwaRegister() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol === "file:") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              installing.postMessage("skip-waiting");
            }
          });
        });
      } catch {
        // A missing worker must never break the editor.
      }
    };

    // Register after first paint so it never competes with the initial load.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
