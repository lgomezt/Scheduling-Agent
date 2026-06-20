export const Login = () => (
  <div className="login-page">
    <div className="login-card">
      <h1>Scheduling Agent</h1>
      <p className="muted">
        A research tool exploring how well LLMs can represent your scheduling decisions and reasoning.
      </p>
      <a className="btn-primary" href="/api/auth/google/login">
        Sign in with Google
      </a>
      <p className="footnote">
        Sign-in uses only your basic Google profile. The research export uses your participant code
        rather than your Google email.
      </p>
      <p className="footnote">
        The first time you sign in you may see a{" "}
        <em>"Google hasn't verified this app"</em> warning — that's expected during the study.
        Click <strong>Advanced</strong> → <strong>Continue</strong>.
      </p>
    </div>
  </div>
);
