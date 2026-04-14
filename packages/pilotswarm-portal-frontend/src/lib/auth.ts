/**
 * Authentication utilities for OAuth flow and token management
 */

export interface AuthConfig {
  enabled: boolean;
  microsoft?: {
    clientId: string;
    tenantId: string;
    authority: string;
    redirectUri?: string;
  };
  google?: {
    clientId: string;
  };
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  provider: "microsoft" | "google";
  providerId: string;
}

const TOKEN_STORAGE_KEY = "pilotswarm_access_token";
const USER_STORAGE_KEY = "pilotswarm_user";

/**
 * Get the API base URL
 */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_PORTAL_API_BASE_URL || "").replace(/\/+$/, "");
}

/**
 * Fetch auth configuration from backend
 */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/auth-config`);
    if (!response.ok) throw new Error("Failed to fetch auth config");
    return await response.json();
  } catch (error) {
    console.error("[auth] Failed to fetch auth config:", error);
    return { enabled: false };
  }
}

/**
 * Store access token in localStorage
 */
export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

/**
 * Retrieve access token from localStorage
 */
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * Clear stored token
 */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Store user info in localStorage
 */
export function storeUser(user: User): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

/**
 * Retrieve user info from localStorage
 */
export function getStoredUser(): User | null {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Clear stored user
 */
export function clearUser(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Generate PKCE code challenge and verifier
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  return crypto.subtle
    .digest("SHA-256", data)
    .then((buffer) => {
      const codeChallenge = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer))))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
      return { codeVerifier, codeChallenge };
    })
    .catch(() => ({ codeVerifier, codeChallenge: codeVerifier }));
}

/**
 * Microsoft OAuth login
 */
export async function loginWithMicrosoft(config: AuthConfig["microsoft"]): Promise<void> {
  if (!config) throw new Error("Microsoft auth not configured");

  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = Math.random().toString(36).substring(7);
  const nonce = Math.random().toString(36).substring(7);

  // Store for later verification
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem("oauth_nonce", nonce);
  sessionStorage.setItem("pkce_verifier", codeVerifier);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: config.redirectUri || window.location.origin,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });

  window.location.href = `${config.authority}/oauth2/v2.0/authorize?${params}`;
}

/**
 * Google OAuth login
 */
export async function loginWithGoogle(config: AuthConfig["google"]): Promise<void> {
  if (!config) throw new Error("Google auth not configured");

  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = Math.random().toString(36).substring(7);

  // Store for later verification
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem("pkce_verifier", codeVerifier);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: window.location.origin,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Handle OAuth callback from redirect
 * For Microsoft/Google OAuth, the ID token from the provider is used directly as Bearer token
 */
export async function handleOAuthCallback(code: string, state: string): Promise<string> {
  const storedState = sessionStorage.getItem("oauth_state");
  const codeVerifier = sessionStorage.getItem("pkce_verifier");

  if (!storedState || storedState !== state) {
    throw new Error("Invalid state parameter");
  }

  if (!codeVerifier) {
    throw new Error("PKCE verifier not found");
  }

  try {
    // Notify backend of successful OAuth callback (optional)
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/oauth-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        state,
        codeVerifier,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const token = data.token || data.accessToken || code;

      // Clean up session storage
      sessionStorage.removeItem("oauth_state");
      sessionStorage.removeItem("oauth_nonce");
      sessionStorage.removeItem("pkce_verifier");

      return token;
    }
  } catch (err) {
    console.warn("[auth] Failed to notify backend of OAuth callback:", err);
  }

  // Use the code (or ID token from provider) directly as the Bearer token
  // Backend will validate it using validateToken()
  const token = code;

  // Clean up session storage
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("oauth_nonce");
  sessionStorage.removeItem("pkce_verifier");

  return token;
}

/**
 * Logout and clear tokens
 */
export function logout(): void {
  clearToken();
  clearUser();
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("oauth_nonce");
  sessionStorage.removeItem("pkce_verifier");
}
