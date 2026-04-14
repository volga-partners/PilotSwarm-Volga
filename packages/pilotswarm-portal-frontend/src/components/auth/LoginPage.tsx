import { useState } from "react";
import { useAuth } from "../../hooks/AuthContext";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const { authConfig, isLoading, loginMicrosoft, loginGoogle } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMicrosoftLogin = async () => {
    try {
      setError(null);
      setIsSubmitting(true);
      await loginMicrosoft();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      setIsSubmitting(true);
      await loginGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.spinner} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome to PilotSwarm</h1>
        <p className={styles.subtitle}>Sign in to continue</p>

        {error && <div className={styles.error}>{error}</div>}

        {/* OAuth Buttons - Full Width */}
        <div className={styles.oauthButtonsContainer}>
          <button
            onClick={handleMicrosoftLogin}
            className={`${styles.button} ${styles.microsoftButton}`}
            disabled={isSubmitting}
          >
            <span className={styles.icon}>🔷</span>
            Sign in with Microsoft
          </button>

          <button
            onClick={handleGoogleLogin}
            className={`${styles.button} ${styles.googleButton}`}
            disabled={isSubmitting}
          >
            <span className={styles.icon}>🔍</span>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
