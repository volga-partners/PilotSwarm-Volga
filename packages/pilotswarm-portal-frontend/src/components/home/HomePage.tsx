import { useNavigate } from "react-router-dom";
import styles from "./HomePage.module.css";

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={styles.navbar}>
        <div className={styles.logo}>🚁 PilotSwarm</div>
      </nav>

      {/* Main Content */}
      <div className={styles.content}>
        <div className={styles.hero}>
          <h1 className={styles.title}>Welcome to PilotSwarm</h1>
          <p className={styles.subtitle}>
            Your intelligent swarm orchestration platform for multi-agent automation
          </p>
          <p className={styles.description}>
            PilotSwarm enables you to create, manage, and monitor intelligent agent swarms
            that work together to solve complex problems at scale. Build once, deploy anywhere.
          </p>

          {/* Features */}
          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>🤖</span>
              <h3>AI-Powered Agents</h3>
              <p>Create intelligent agents that learn and adapt to your needs</p>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>⚙️</span>
              <h3>Orchestration</h3>
              <p>Seamlessly coordinate multiple agents for optimal performance</p>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>📊</span>
              <h3>Real-time Monitoring</h3>
              <p>Track and analyze agent activities in real-time dashboards</p>
            </div>
          </div>

          {/* Buttons */}
          <div className={styles.buttonGroup}>
            <button
              onClick={() => navigate("/login")}
              className={`${styles.button} ${styles.primaryButton}`}
            >
              Sign In
            </button>
            <button
              onClick={() => navigate("/signup")}
              className={`${styles.button} ${styles.secondaryButton}`}
            >
              Create Account
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>&copy; 2024 PilotSwarm. All rights reserved.</p>
      </footer>
    </div>
  );
}
