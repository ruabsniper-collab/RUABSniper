import { NavLink } from "react-router-dom";

// Mirrors the mobile app's 4-tab bottom bar (see the old
// mobile/src/navigation/RootNavigator.tsx) — "/" covers the Search ->
// CourseDetail -> Register flow, all nested under one nav item like the
// mobile app's SearchStack was.
export function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end>
        Search
      </NavLink>
      <NavLink to="/watches">Watches</NavLink>
      <NavLink to="/schedule">My Schedule</NavLink>
      <NavLink to="/settings">Settings</NavLink>
    </nav>
  );
}
