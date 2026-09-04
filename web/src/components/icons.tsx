// Shared line icons -- hand-drawn inline SVG rather than an icon library
// dependency, same "no framework, this is small enough" reasoning as
// styles.css. 24x24 viewBox, stroke=currentColor, so every icon inherits
// its color from CSS (muted vs. accent) and needs no light/dark handling
// of its own. Search and Target are reused as-is by both BottomNav (tab
// icons) and EmptyState (the "nothing here yet" icon for that same tab),
// so the two always match.

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M20 20l-4.35-4.35" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="7" r="2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16" cy="15.5" r="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 7h2M12 7h8M4 15.5h10M20 15.5h-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

// Small inline glyphs for SectionRow's meta lines -- meeting time and each
// instructor row. Thinner stroke (1.5 vs the nav/empty-state icons' 1.75)
// and no viewBox padding assumptions since these render tiny (14px) next
// to text, not as a standalone tap target.
export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 20c1.4-3.8 4.6-6 7.5-6s6.1 2.2 7.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
