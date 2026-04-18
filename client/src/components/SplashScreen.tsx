/**
 * GD Platform — SplashScreen Component
 * ─────────────────────────────────────
 * Drop-in startup splash screen for GD Genius.
 *
 * USAGE
 * ─────
 * In App.tsx (or main entry component):
 *
 *   const [splashDone, setSplashDone] = useState(false);
 *   if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />;
 *
 * TIMING CONSTANTS (adjust these to taste)
 * ─────────────────────────────────────────
 *   ENTER_MS   — logo scale-in + fade-in duration
 *   DISPLAY_MS — how long the screen is held at full opacity
 *   FADE_MS    — fade-out duration before the app appears
 *
 * Total visible time ≈ ENTER_MS + DISPLAY_MS + FADE_MS
 */

import { useEffect, useState } from "react";

// ── 1. GD Genius logo ─────────────────────────────────────────────────────────
const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663425420251/K5ogkLhSXtccCnqH4Vm3fs/gdgenius-logo_87bc3961.png";

// ── 2. Timing constants ───────────────────────────────────────────────────────
const ENTER_MS   = 800;   // logo scale-in  (ms)
const DISPLAY_MS = 3200;  // hold time      (ms)
const FADE_MS    = 900;   // fade-out       (ms)

// ── 3. Accent colour for the progress bar ────────────────────────────────────
const ACCENT_FROM = "#22c55e"; // green-500
const ACCENT_TO   = "#16a34a"; // green-600

// ── 4. Background colour ──────────────────────────────────────────────────────
const BG_COLOR = "#0f1117"; // near-black

interface SplashScreenProps {
  /** Called when the animation is fully complete and the app should appear. */
  onDone: () => void;
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"),  ENTER_MS);
    const t2 = setTimeout(() => setPhase("exit"),  ENTER_MS + DISPLAY_MS);
    const t3 = setTimeout(() => onDone(),          ENTER_MS + DISPLAY_MS + FADE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BG_COLOR,
        transition: `opacity ${FADE_MS}ms ease`,
        opacity: phase === "exit" ? 0 : 1,
        pointerEvents: phase === "exit" ? "none" : "all",
      }}
    >
      {/* ── Logo + effects ─────────────────────────────────────────────────── */}
      <div
        style={{
          transform:  phase === "enter" ? "scale(0.82)" : "scale(1)",
          opacity:    phase === "enter" ? 0 : 1,
          transition: `transform ${ENTER_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ${ENTER_MS}ms ease`,
          position: "relative",
        }}
      >
        {/* Radial glow halo */}
        <div
          style={{
            position: "absolute",
            inset: "-24px",
            borderRadius: "24px",
            background: `radial-gradient(ellipse at center, rgba(34,197,94,0.18) 0%, transparent 70%)`,
            animation: phase === "hold" ? "gd-pulse-glow 2.8s ease-in-out infinite" : "none",
          }}
        />

        {/* Logo */}
        <img
          src={LOGO_URL}
          alt="GD Genius"
          style={{
            width: "clamp(240px, 36vw, 420px)",
            height: "auto",
            display: "block",
            position: "relative",
            zIndex: 1,
            borderRadius: "12px",
          }}
          draggable={false}
        />

        {/* Shimmer sweep — fires once after logo appears */}
        {phase === "hold" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "12px",
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "-100%",
                width: "60%",
                height: "100%",
                background:
                  "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)",
                animation: "gd-shimmer-sweep 3.6s ease-in-out 0.6s forwards",
              }}
            />
          </div>
        )}
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: "40px",
          width: "clamp(180px, 28vw, 320px)",
          height: "3px",
          background: "rgba(255,255,255,0.08)",
          borderRadius: "99px",
          overflow: "hidden",
          opacity: phase === "enter" ? 0 : 1,
          transition: "opacity 400ms ease 300ms",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: "99px",
            background: `linear-gradient(90deg, ${ACCENT_FROM}, ${ACCENT_TO})`,
            animation:
              phase !== "enter"
                ? `gd-progress-fill ${DISPLAY_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`
                : "none",
            width: "0%",
          }}
        />
      </div>

      {/* ── Tagline ─────────────────────────────────────────────────────────── */}
      <p
        style={{
          marginTop: "20px",
          color: "rgba(255,255,255,0.35)",
          fontSize: "12px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontFamily: "Inter, sans-serif",
          opacity: phase === "enter" ? 0 : 1,
          transition: `opacity 600ms ease ${ENTER_MS + 200}ms`,
        }}
      >
        Empowering Warehouse Operations
      </p>

      {/* ── Keyframes (namespaced with gd- prefix to avoid collisions) ──────── */}
      <style>{`
        @keyframes gd-pulse-glow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.04); }
        }
        @keyframes gd-shimmer-sweep {
          0%   { left: -100%; }
          100% { left: 160%; }
        }
        @keyframes gd-progress-fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
