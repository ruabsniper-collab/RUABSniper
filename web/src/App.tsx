import { Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { SearchPage } from "./pages/SearchPage";
import { CourseDetailPage } from "./pages/CourseDetailPage";
import { RegisterPage } from "./pages/RegisterPage";
import { WatchesPage } from "./pages/WatchesPage";
import { MySchedulePage } from "./pages/MySchedulePage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/course/:courseId" element={<CourseDetailPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/watches" element={<WatchesPage />} />
          <Route path="/schedule" element={<MySchedulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  );
}
