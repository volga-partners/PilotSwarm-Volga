import { useState } from "react";
import { useAuth } from "../../hooks/AuthContext";
import styles from "./LoginPage.module.css";

export function SignupPage() {
  const { authConfig, isLoading, loginMicrosoft, loginGoogle } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMicrosoftSignup = async () => {
    try {
      setError(null);
      setIsSubmitting(true);
      await loginMicrosoft();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
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
        <h1 className={styles.title}>Create Account</h1>
        <p className={styles.subtitle}>Join PilotSwarm and start orchestrating intelligent agents</p>

        {error && <div className={styles.error}>{error}</div>}

        {/* OAuth Buttons - Full Width */}
        <div className={styles.oauthButtonsContainer}>
          <button
            onClick={handleMicrosoftSignup}
            className={`${styles.button} ${styles.microsoftButton}`}
            disabled={isSubmitting}
          >
            <span className={styles.icon}>🔷</span>
            Sign up with Microsoft
          </button>

          <button
            onClick={handleGoogleSignup}
            className={`${styles.button} ${styles.googleButton}`}
            disabled={isSubmitting}
          >
            <span className={styles.icon}>🔍</span>
            Sign up with Google
          </button>
        </div>
      </div>
    </div>
  );
}
