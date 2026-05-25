import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getCurrentSession, createSession } from "../api/sessions";

export const Done = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session, isLoading } = useQuery({
    queryKey: ["session", "current"],
    queryFn: getCurrentSession,
  });

  const startNew = useMutation({
    mutationFn: createSession,
    onSuccess: (s) => {
      qc.setQueryData(["session", "current"], s);
      navigate("/upload");
    },
  });

  if (isLoading) return <div className="screen-center">Loading…</div>;

  return (
    <div className="screen done-screen">
      <h2>Session complete</h2>
      <p className="muted">
        Thanks for working through every scenario. Download your log to share with the researcher,
        then optionally start a new session.
      </p>
      <div className="done-actions">
        <a
          className="btn-primary"
          href={session ? `/api/export/${session.id}` : "#"}
          download
        >
          Download log (JSON)
        </a>
        <button className="btn-secondary" onClick={() => startNew.mutate()} disabled={startNew.isPending}>
          {startNew.isPending ? "Starting…" : "Start a new session"}
        </button>
      </div>
    </div>
  );
};
