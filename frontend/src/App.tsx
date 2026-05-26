import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { CalendarStep } from "./pages/onboarding/CalendarStep";
import { ProfileStep } from "./pages/onboarding/ProfileStep";
import { ScenariosStep } from "./pages/onboarding/ScenariosStep";
import { Workspace } from "./pages/Workspace";
import { Done } from "./pages/Done";

export const App = () => {
  const { user, loading, logout } = useAuth();

  if (loading)
    return (
      <div className="screen-center">
        <div className="skeleton-stack" aria-label="Loading">
          <div className="skeleton-line w-220" />
          <div className="skeleton-line w-360" />
          <div className="skeleton-line w-180" />
        </div>
      </div>
    );
  if (!user) return <Login />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Scheduling Agent
        </Link>
        <div className="user">
          <Link to="/onboarding/calendar" className="navbtn">
            Setup
          </Link>
          <span className="muted">{user.email}</span>
          <button onClick={() => logout()}>Sign out</button>
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/onboarding/calendar" replace />} />
          <Route path="/onboarding/calendar" element={<CalendarStep />} />
          <Route path="/onboarding/profile" element={<ProfileStep />} />
          <Route path="/onboarding/scenarios" element={<ScenariosStep />} />
          <Route path="/upload" element={<Navigate to="/onboarding/calendar" replace />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/done" element={<Done />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};
