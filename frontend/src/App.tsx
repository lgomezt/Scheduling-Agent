import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth/AuthContext";
import { getCurrentSession } from "./api/sessions";
import { Login } from "./pages/Login";
import { Upload } from "./pages/Upload";
import { Workspace } from "./pages/Workspace";
import { Done } from "./pages/Done";

export const App = () => {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="screen-center">Loading…</div>;
  if (!user) return <Login />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Scheduling Agent
        </Link>
        <div className="user">
          <Link to="/upload" className="navbtn">
            Upload material
          </Link>
          <span className="muted">{user.email}</span>
          <button onClick={() => logout()}>Sign out</button>
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<RouteGate />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/done" element={<Done />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

const RouteGate = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });
  if (isLoading) return <div className="screen-center">Loading session…</div>;
  if (!data) return <Navigate to="/upload" replace />;
  if (data.status === "completed") return <Navigate to="/done" replace />;
  return <Navigate to="/workspace" replace />;
};
