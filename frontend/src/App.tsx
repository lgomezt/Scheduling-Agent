import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { Done } from "./pages/Done";
import { SurveyPage } from "./pages/study/SurveyPage";
import { ScenariosPage } from "./pages/study/ScenariosPage";
import { OnboardingPage } from "./pages/study/OnboardingPage";
import { ReflectionPage } from "./pages/study/ReflectionPage";

export const App = () => {
  const { user, loading } = useAuth();

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
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/onboarding" replace />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route
            path="/survey"
            element={
              <SurveyPage
                questionnaireId="preferences_values"
                stepNumber={2}
                stepTitle="Preferences questionnaire"
                nextPath="/scenarios"
              />
            }
          />
          <Route path="/preferences" element={<Navigate to="/survey" replace />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/reflection" element={<ReflectionPage />} />
          <Route path="/complete" element={<Done />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};
