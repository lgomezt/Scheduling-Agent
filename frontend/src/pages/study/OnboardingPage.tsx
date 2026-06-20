import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const firstName = user?.name?.split(/\s+/)[0] || "there";

  return (
    <div className="study-screen">
      <div className="study-card intro-card">
        <div className="step-label">STEP 1 OF 5 · ONBOARDING</div>
        <h1>Hello {firstName},</h1>
        <p className="intro-copy">
          This study has four short parts: answer questions about your context and preferences,
          rank scheduling scenarios, then evaluate how close two agents are to representing you.
        </p>
        <div className="study-actions onboarding-actions">
          <button type="button" className="btn-secondary" onClick={() => void logout()}>
            Logout
          </button>
          <button type="button" onClick={() => navigate("/survey")}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
};
