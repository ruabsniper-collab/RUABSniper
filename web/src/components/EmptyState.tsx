import type { ReactNode } from "react";

type Icon = "target" | "search";

// Plain outline icons, hand-drawn as inline SVG rather than pulling in an
// icon library for two glyphs -- same "no framework, this is small enough"
// reasoning as styles.css. Colored via currentColor from .empty-state-icon
// so they pick up the theme automatically, light or dark.
const ICONS: Record<Icon, ReactNode> = {
  target: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 20l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

// A page-level "nothing here yet" state -- an outline icon above the
// existing .empty-text copy. Reserved for a whole page's primary empty
// state (Search, Watches); MySchedulePage's empty row stays plain text,
// since that's one line inside a bigger page, not the page itself.
export function EmptyState({ icon, children }: { icon: Icon; children: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{ICONS[icon]}</div>
      <p className="empty-text">{children}</p>
    </div>
  );
}
