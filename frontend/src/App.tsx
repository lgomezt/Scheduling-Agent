import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { Done } from "./pages/Done";
import { SurveyPage } from "./pages/study/SurveyPage";
import { ScenariosPage } from "./pages/study/ScenariosPage";
import { OnboardingPage } from "./pages/study/OnboardingPage";

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
                questionnaireId="demographic"
                stepNumber={2}
                stepTitle="Demographic survey"
                nextPath="/preferences"
              />
            }
          />
          <Route
            path="/preferences"
            element={
              <SurveyPage
                questionnaireId="preferences_values"
                stepNumber={3}
                stepTitle="Preferences questionnaire"
                nextPath="/scenarios"
              />
            }
          />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/followup" element={<Navigate to="/complete" replace />} />
          <Route path="/onboarding/calendar" element={<Navigate to="/onboarding" replace />} />
          <Route path="/onboarding/profile" element={<Navigate to="/survey" replace />} />
          <Route path="/onboarding/scenarios" element={<Navigate to="/scenarios" replace />} />
          <Route path="/upload" element={<Navigate to="/survey" replace />} />
          <Route path="/workspace" element={<Navigate to="/scenarios" replace />} />
          <Route path="/done" element={<Navigate to="/complete" replace />} />
          <Route path="/complete" element={<Done />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};
