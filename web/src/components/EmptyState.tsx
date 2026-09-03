import type { ReactNode } from "react";
import { SearchIcon, TargetIcon } from "./icons";

type Icon = "target" | "search";

// Reuses the exact same icons as BottomNav's tab icons (components/icons.tsx)
// so a tab's own icon and its "nothing here yet" state always match.
const ICONS: Record<Icon, ReactNode> = {
  target: <TargetIcon />,
  search: <SearchIcon />,
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
