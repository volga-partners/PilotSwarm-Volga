import { useState, useEffect } from "react";
import { blessedToHtml } from "./blessedToHtml";

interface StartupSplashProps {
  onNewSession: () => void;
}

const FALLBACK_SPLASH_HTML = "Welcome to PilotSwarm\nStart a new session to begin.";

export default function StartupSplash({ onNewSession }: StartupSplashProps) {
  const [splashHtml, setSplashHtml] = useState(FALLBACK_SPLASH_HTML);

  useEffect(() => {
    fetch("/splash.txt")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        const trimmed = text.trim();
        const looksLikeHtml = /<!doctype html>|<html/i.test(trimmed);
        if (!trimmed || looksLikeHtml) {
          setSplashHtml(FALLBACK_SPLASH_HTML);
          return;
        }
        setSplashHtml(blessedToHtml(trimmed));
      })
      .catch(() => setSplashHtml(FALLBACK_SPLASH_HTML));
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8">
      <pre
        className="font-mono text-xs select-none whitespace-pre"
        style={{ lineHeight: "1.1" }}
        dangerouslySetInnerHTML={{ __html: splashHtml }}
      />

      <button
        onClick={onNewSession}
        className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white font-medium text-sm"
      >
        + New Session
      </button>
    </div>
  );
}
