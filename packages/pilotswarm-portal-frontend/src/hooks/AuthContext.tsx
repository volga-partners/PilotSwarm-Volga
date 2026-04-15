import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  AuthConfig,
  User,
  fetchAuthConfig,
  getApiBaseUrl,
  getStoredToken,
  getStoredUser,
  storeToken,
  storeUser,
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
            const response = await fetch(`${getApiBaseUrl()}/api/user`, {
              headers: {
                Authorization: `Bearer ${newToken}`,
              },
            });

            if (!response.ok) {
              throw new Error(`Failed to load user profile (${response.status})`);
            }

            const userData = (await response.json()) as User;
            setUser(userData);
            storeUser(userData);

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch (err) {
            // Ensure partially stored callback state doesn't leave a ghost session.
            logoutUtil();
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
