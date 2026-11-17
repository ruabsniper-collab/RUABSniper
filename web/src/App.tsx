import { Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { ToastHost } from "./components/ToastHost";
import { NotificationNavigation } from "./components/NotificationNavigation";
import { RegisterPage } from "./pages/RegisterPage";
const SearchPage = lazy(() => import("./pages/SearchPage").then((m) => ({ default: m.SearchPage })));
const CourseDetailPage = lazy(() => import("./pages/CourseDetailPage").then((m) => ({ default: m.CourseDetailPage })));
const OpenSnipesPage = lazy(() => import("./pages/OpenSnipesPage").then((m) => ({ default: m.OpenSnipesPage })));
const WatchesPage = lazy(() => import("./pages/WatchesPage").then((m) => ({ default: m.WatchesPage })));
const MySchedulePage = lazy(() => import("./pages/MySchedulePage").then((m) => ({ default: m.MySchedulePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

// Visited bottom-nav destinations stay mounted instead of being
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
  const { pathname, search } = useLocation();
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(TABS.some((tab) => tab.path === pathname) ? [pathname, "/watches"] : []));
  useEffect(() => {
    if (TABS.some((tab) => tab.path === pathname)) {
      setVisitedTabs((visited) => visited.has(pathname) && visited.has("/watches") ? visited : new Set([...visited, pathname, "/watches"]));
    }
  }, [pathname]);
  const onStackPage = pathname.startsWith("/course/") || pathname === "/register" || pathname === "/watches/open";

  return (
    <>
      <NotificationNavigation />
      <main className="app-main">
        {TABS.filter(({ path }) => visitedTabs.has(path) || pathname === path).map(({ path, Page }) => (
          <div key={path} style={{ display: !onStackPage && pathname === path ? "block" : "none" }}>
            <Suspense fallback={<div className="skeleton-row" style={{ height: 120 }} />}>
              <Page />
            </Suspense>
          </div>
        ))}
        {onStackPage && (
          <Suspense fallback={<div className="skeleton-row" style={{ height: 120 }} />}>
            <Routes>
              <Route path="/course/:courseId" element={<CourseDetailPage />} />
              <Route path="/register" element={<RegisterPage key={search} />} />
              <Route path="/watches/open" element={<OpenSnipesPage />} />
            </Routes>
          </Suspense>
        )}
      </main>
      <ToastHost />
      <BottomNav />
    </>
  );
}
