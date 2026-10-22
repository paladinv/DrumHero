"use client";

import { useEffect } from "react";

export function OfflineNavigationGuard() {
  useEffect(() => {
    const forceCachedDocument = (event: MouseEvent) => {
      if (navigator.onLine || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || (destination.pathname === window.location.pathname && destination.hash)) return;
      event.preventDefault();
      window.location.assign(destination.href);
    };
    document.addEventListener("click", forceCachedDocument, true);
    return () => document.removeEventListener("click", forceCachedDocument, true);
  }, []);
  return null;
}
