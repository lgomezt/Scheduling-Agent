import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMe, logout as logoutApi, type Me } from "../api/auth";

type AuthState = {
  user: Me | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
  });
  const { mutateAsync } = useMutation({
    mutationFn: logoutApi,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  return (
    <AuthContext.Provider
      value={{
        user: data ?? null,
        loading: isLoading,
        logout: () => mutateAsync().then(() => undefined),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
