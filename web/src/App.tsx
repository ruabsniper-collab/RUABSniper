import { Route, Routes, useLocation } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { ToastHost } from "./components/ToastHost";
import { SearchPage } from "./pages/SearchPage";
import { CourseDetailPage } from "./pages/CourseDetailPage";
import { RegisterPage } from "./pages/RegisterPage";
import { OpenSnipesPage } from "./pages/OpenSnipesPage";
import { WatchesPage } from "./pages/WatchesPage";
import { MySchedulePage } from "./pages/MySchedulePage";
import { SettingsPage } from "./pages/SettingsPage";

// The 4 bottom-nav destinations stay mounted permanently instead of being
// swapped in/out by <Routes> -- react-router unmounts whatever page isn't
// the current route match, which was wiping every tab's component state
// (a search query, its results, open filters) the moment you switched to
// another tab and back. That's not how tabs are supposed to behave -- the
// original Expo app's bottom tab navigator kept every tab's screen alive in
// the background for exactly this reason, and this restores the same
// behavior: each tab's own useState survives switching away and back,
// because the component itself never unmounts, it's just hidden with CSS.
//
// CourseDetail/Register aren't tabs -- they're a real navigation stack
// reached *from* Search, so they still go through normal routing (mount
// fresh per param, real back-button semantics), rendered on top of the
// hidden tabs when their path matches.
const TABS = [
  { path: "/", Page: SearchPage },
  { path: "/watches", Page: WatchesPage },
  { path: "/schedule", Page: MySchedulePage },
  { path: "/settings", Page: SettingsPage },
];

export default function App() {
  const { pathname } = useLocation();
  const onStackPage = pathname.startsWith("/course/") || pathname === "/register" || pathname === "/watches/open";

  return (
    <>
      <main className="app-main">
        {TABS.map(({ path, Page }) => (
          <div key={path} style={{ display: !onStackPage && pathname === path ? "block" : "none" }}>
            <Page />
          </div>
        ))}
        {onStackPage && (
          <Routes>
            <Route path="/course/:courseId" element={<CourseDetailPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/watches/open" element={<OpenSnipesPage />} />
          </Routes>
        )}
      </main>
      <ToastHost />
      <BottomNav />
    </>
  );
}
