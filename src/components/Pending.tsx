"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type ComponentProps, type ReactNode, use, useTransition } from "react";

type Navigate = (href: string, options?: { scroll?: boolean }) => void;

const PendingContext = createContext<{ pending: boolean; navigate: Navigate }>({
  pending: false,
  navigate: () => {},
});

/**
 * Filter changes load the page again on the server. This tracks that, so the
 * charts can stay on screen, dimmed, until the new numbers arrive.
 */
export function PendingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate: Navigate = (href, options) => startTransition(() => router.push(href, options));
  return <PendingContext value={{ pending, navigate }}>{children}</PendingContext>;
}

export function usePending() {
  return use(PendingContext);
}

/** Holds the previous numbers at reduced opacity while new ones load. */
export function PendingFrame({ children }: { children: ReactNode }) {
  const { pending } = usePending();
  return (
    <div aria-busy={pending} className={`space-y-4 transition-opacity duration-200 ${pending ? "opacity-50" : ""}`}>
      {children}
    </div>
  );
}

/** A link to a filtered view of the dashboard. */
export function FilterLink({ href, scroll = true, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const { navigate } = usePending();
  return (
    <Link
      {...props}
      href={href}
      // Each view runs the stats on the server, so don't fetch them until tapped.
      prefetch={false}
      onNavigate={(event) => {
        event.preventDefault();
        navigate(href, { scroll });
      }}
    />
  );
}
