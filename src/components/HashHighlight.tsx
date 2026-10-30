"use client";

import { useEffect } from "react";

/**
 * Rings the gig the address points at (#gig-…), e.g. from the Overview's upcoming gig.
 * CSS :target doesn't apply after an in-app link, so this does it instead.
 */
export function HashHighlight() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const gig = id ? document.getElementById(id) : null;
    if (!gig) return;
    gig.classList.add("ring-2", "ring-accent");
    gig.scrollIntoView({ block: "start" });
    const timer = setTimeout(() => gig.classList.remove("ring-2", "ring-accent"), 2500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
