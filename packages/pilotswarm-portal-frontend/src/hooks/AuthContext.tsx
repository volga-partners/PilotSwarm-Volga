import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  AuthConfig,
  User,
  fetchAuthConfig,
  getStoredToken,
  getStoredUser,
  storeToken,
  storeUser,
  clearToken,
  clearUser,
  logout as logoutUtil,
  loginWithMicrosoft,
  loginWithGoogle,
  handleOAuthCallback,
} from "../lib/auth";

interface AuthContextValue {
  authConfig: AuthConfig | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  getAccessToken: () => Promise<string | null>;
  loginMicrosoft: () => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load auth config and restore session on mount
  useEffect(() => {
    async function init() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch auth config from backend
        const config = await fetchAuthConfig();
        setAuthConfig(config);

        // Restore session from localStorage
        const storedToken = getStoredToken();
        const storedUser = getStoredUser();

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);
          setIsLoading(false);
          return;
        }

        // Check for OAuth callback
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");

        if (code && state) {
          try {
            const newToken = await handleOAuthCallback(code, state);
            setToken(newToken);
            storeToken(newToken);

            // Fetch user info from backend using the token
            try {
              const response = await fetch(`${import.meta.env.VITE_PORTAL_API_BASE_URL || ''}/api/user`, {
                headers: {
                  Authorization: `Bearer ${newToken}`,
                },
              });

              if (response.ok) {
                const userData = await response.json();
                setUser(userData);
                storeUser(userData);
              } else {
                // If user endpoint doesn't exist, create a basic user object
                const basicUser: User = {
                  id: code,
                  email: "user@example.com",
                  displayName: "User",
                  provider: "microsoft",
                  providerId: code,
                };
                setUser(basicUser);
                storeUser(basicUser);
              }
            } catch {
              // If user endpoint doesn't exist, create a basic user object
              const basicUser: User = {
                id: code,
                email: "user@example.com",
                displayName: "User",
                provider: "microsoft",
                providerId: code,
              };
              setUser(basicUser);
              storeUser(basicUser);
            }

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch (err) {
            setError(`OAuth callback failed: ${err instanceof Error ? err.message : String(err)}`);
            console.error("[auth] OAuth callback error:", err);
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } catch (err) {
        setError(`Auth initialization failed: ${err instanceof Error ? err.message : String(err)}`);
        console.error("[auth] Init failed:", err);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    return token || null;
  }, [token]);

  const loginMicrosoft = useCallback(async () => {
    try {
      setError(null);
      if (!authConfig?.microsoft) throw new Error("Microsoft auth not configured");
      await loginWithMicrosoft(authConfig.microsoft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [authConfig]);

  const loginGoogle = useCallback(async () => {
    try {
      setError(null);
      if (!authConfig?.google) throw new Error("Google auth not configured");
      await loginWithGoogle(authConfig.google);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [authConfig]);

  const logout = useCallback(() => {
    logoutUtil();
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authConfig,
        user,
        isAuthenticated: !!user && !!token,
        isLoading,
        error,
        getAccessToken,
        loginMicrosoft,
        loginGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
