import { type Filters, linkTo, TABS, type TabKey } from "@/lib/filters";
import { FilterLink } from "./Pending";

const ICONS: Record<TabKey, React.ReactNode> = {
  overview: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  gigs: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
};

/** Overview, Gigs, Stats and Settings, pinned to the bottom of the screen. Each opens fresh. */
export function TabBar({ filters }: { filters: Filters }) {
  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-3xl">
        {TABS.map((tab) => {
          const current = filters.tab === tab.key;
          return (
            <li key={tab.key} className="flex-1">
              <FilterLink
                href={linkTo({ tab: tab.key })}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${
                  current ? "text-accent" : "text-muted"
                }`}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONS[tab.key]}
                </svg>
                {tab.label}
              </FilterLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
