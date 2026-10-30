"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance: "interaction-only";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
      "error-callback": () => boolean;
    },
  ): string;
  remove(widget: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type Props = {
  siteKey: string;
  /** A token proving this browser passed, or null when there's no usable one. */
  onToken: (token: string | null) => void;
  /** The check couldn't run at all, for example because a content blocker stopped it. */
  onFailed: () => void;
};

/**
 * Cloudflare's bot check. It stays out of sight unless it needs the person to tap something. A token
 * works once, so give this a new `key` after each use to get another.
 */
export function Turnstile({ siteKey, onToken, onFailed }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded || !container.current || !window.turnstile) return;
    const { turnstile } = window;
    const widget = turnstile.render(container.current, {
      sitekey: siteKey,
      appearance: "interaction-only",
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
      "timeout-callback": () => onToken(null),
      "error-callback": () => {
        onToken(null);
        onFailed();
        return true;
      },
    });
    return () => turnstile.remove(widget);
  }, [loaded, siteKey, onToken, onFailed]);

  return (
    <>
      {/* Cloudflare asks that this is loaded from its own address, not bundled. */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setLoaded(true)}
        onError={onFailed}
      />
      <div ref={container} />
    </>
  );
}
