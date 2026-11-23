import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { SearchIcon, TargetIcon, CalendarIcon, SettingsIcon } from "./icons";
import { subscribeOpenSnipeCount } from "../lib/watchStatus";

// Mirrors the mobile app's 4-tab bottom bar (see the old
// mobile/src/navigation/RootNavigator.tsx) — "/" covers the Search ->
// CourseDetail -> Register flow, all nested under one nav item like the
// mobile app's SearchStack was.
const TABS = [
  { to: "/", end: true, label: "Search", Icon: SearchIcon },
  { to: "/watches", end: false, label: "Snipes", Icon: TargetIcon },
  { to: "/schedule", end: false, label: "My Schedule", Icon: CalendarIcon },
  { to: "/settings", end: false, label: "Settings", Icon: SettingsIcon },
];

export function BottomNav() {
  const { pathname } = useLocation();
  // Published by WatchesPage, which polls continuously once mounted
  // regardless of which tab is active -- see its own comment -- so this
  // dot stays live even while you're sitting on a different tab.
  const [openSnipeCount, setOpenSnipeCount] = useState(0);
  useEffect(() => subscribeOpenSnipeCount(setOpenSnipeCount), []);

  return (
    <nav className="bottom-nav">
      {TABS.map(({ to, end, label, Icon }) => (
        <NavLink key={to} to={to} end={end} onClick={(event) => {
          if (pathname !== to || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          document.querySelector<HTMLElement>(".app-main")?.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          });
        }}>
          <span className="nav-icon">
            <Icon />
            {to === "/watches" && openSnipeCount > 0 && <span className="nav-badge" />}
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
