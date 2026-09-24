import { type Filters, TABS, type TabKey, withFilter } from "@/lib/filters";
import { FilterLink } from "./Pending";

const ICONS: Record<TabKey, React.ReactNode> = {
  overview: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.8.8 2.8 2.6 3 5.2" />
    </>
  ),
  places: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  gigs: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
};

/** The four parts of the dashboard, pinned to the bottom of the screen. Switching keeps the filters. */
export function TabBar({ filters, attention }: { filters: Filters; attention: number }) {
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
                href={withFilter(filters, { tab: tab.key })}
                aria-current={current ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${
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
                {tab.key === "gigs" && attention > 0 && (
                  <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-warn px-1.5 text-[10px] leading-4 font-semibold text-bg">
                    {attention}
                    <span className="sr-only"> need a look</span>
                  </span>
                )}
              </FilterLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
