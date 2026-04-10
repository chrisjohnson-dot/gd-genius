import React from "react";

export type GopherState = "idle" | "thinking" | "found" | "celebrating" | "teaching" | "waving";

interface GopherAvatarProps {
  state?: GopherState;
  size?: number;
  className?: string;
}

/**
 * Animated Gopher character using CSS/SVG.
 * States: idle, thinking, found, celebrating, teaching, waving
 */
export function GopherAvatar({ state = "idle", size = 40, className = "" }: GopherAvatarProps) {
  const isThinking = state === "thinking";
  const isCelebrating = state === "celebrating";
  const isWaving = state === "waving";
  const isFound = state === "found";
  const isTeaching = state === "teaching";

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animation: isCelebrating
            ? "gopher-bounce 0.5s ease-in-out infinite alternate"
            : isWaving
            ? "gopher-wave 1s ease-in-out infinite"
            : isThinking
            ? "gopher-bob 2s ease-in-out infinite"
            : "none",
        }}
      >
        <style>{`
          @keyframes gopher-bounce {
            from { transform: translateY(0px); }
            to { transform: translateY(-6px); }
          }
          @keyframes gopher-wave {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-8deg); }
            75% { transform: rotate(8deg); }
          }
          @keyframes gopher-bob {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-3px); }
          }
          @keyframes gopher-spin-eye {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.1); }
          }
        `}</style>

        {/* Body */}
        <ellipse cx="32" cy="40" rx="18" ry="16" fill="#8B6914" />

        {/* Head */}
        <circle cx="32" cy="24" r="16" fill="#A07820" />

        {/* Ears */}
        <ellipse cx="18" cy="12" rx="5" ry="7" fill="#8B6914" />
        <ellipse cx="46" cy="12" rx="5" ry="7" fill="#8B6914" />
        <ellipse cx="18" cy="12" rx="3" ry="4.5" fill="#C8A0A0" />
        <ellipse cx="46" cy="12" rx="3" ry="4.5" fill="#C8A0A0" />

        {/* Face */}
        <ellipse cx="32" cy="28" rx="10" ry="8" fill="#C8A060" />

        {/* Eyes */}
        <ellipse
          cx="26"
          cy="22"
          rx="3"
          ry={isThinking ? 1.5 : 3}
          fill="#1a1a2e"
          style={{ animation: "gopher-spin-eye 4s ease-in-out infinite" }}
        />
        <ellipse
          cx="38"
          cy="22"
          rx="3"
          ry={isThinking ? 1.5 : 3}
          fill="#1a1a2e"
          style={{ animation: "gopher-spin-eye 4s ease-in-out 0.2s infinite" }}
        />

        {/* Eye shine */}
        <circle cx="27" cy="21" r="1" fill="white" />
        <circle cx="39" cy="21" r="1" fill="white" />

        {/* Nose */}
        <ellipse cx="32" cy="27" rx="2.5" ry="1.5" fill="#4a2a0a" />

        {/* Mouth */}
        {isCelebrating || isFound ? (
          // Big smile
          <path d="M 26 31 Q 32 37 38 31" stroke="#4a2a0a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        ) : isThinking ? (
          // Thoughtful expression
          <path d="M 28 31 Q 32 33 36 31" stroke="#4a2a0a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        ) : (
          // Neutral smile
          <path d="M 27 31 Q 32 35 37 31" stroke="#4a2a0a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        )}

        {/* Teeth */}
        <rect x="29" y="31" width="3" height="4" rx="0.5" fill="white" />
        <rect x="32" y="31" width="3" height="4" rx="0.5" fill="white" />

        {/* Arms */}
        {isWaving ? (
          <>
            <ellipse
              cx="14"
              cy="38"
              rx="5"
              ry="3"
              fill="#8B6914"
              style={{
                transformOrigin: "20px 38px",
                animation: "gopher-wave 1s ease-in-out infinite",
              }}
            />
            <ellipse cx="50" cy="38" rx="5" ry="3" fill="#8B6914" />
          </>
        ) : isTeaching ? (
          <>
            <ellipse cx="14" cy="36" rx="5" ry="3" fill="#8B6914" transform="rotate(-20 14 36)" />
            <ellipse cx="50" cy="38" rx="5" ry="3" fill="#8B6914" />
          </>
        ) : (
          <>
            <ellipse cx="14" cy="40" rx="5" ry="3" fill="#8B6914" />
            <ellipse cx="50" cy="40" rx="5" ry="3" fill="#8B6914" />
          </>
        )}

        {/* Thinking dots */}
        {isThinking && (
          <>
            <circle cx="46" cy="10" r="2" fill="#6366f1" opacity="0.8">
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.2s" repeatCount="indefinite" begin="0s" />
            </circle>
            <circle cx="52" cy="8" r="2.5" fill="#6366f1" opacity="0.6">
              <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1.2s" repeatCount="indefinite" begin="0.4s" />
            </circle>
            <circle cx="58" cy="5" r="3" fill="#6366f1" opacity="0.4">
              <animate attributeName="opacity" values="0.4;0.05;0.4" dur="1.2s" repeatCount="indefinite" begin="0.8s" />
            </circle>
          </>
        )}

        {/* Star burst for celebrating/found */}
        {(isCelebrating || isFound) && (
          <>
            <circle cx="10" cy="8" r="2" fill="#f59e0b">
              <animate attributeName="r" values="2;3;2" dur="0.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="54" cy="8" r="2" fill="#10b981">
              <animate attributeName="r" values="2;3;2" dur="0.8s" repeatCount="indefinite" begin="0.4s" />
            </circle>
            <circle cx="8" cy="20" r="1.5" fill="#f59e0b">
              <animate attributeName="r" values="1.5;2.5;1.5" dur="0.8s" repeatCount="indefinite" begin="0.2s" />
            </circle>
          </>
        )}

        {/* Book for teaching */}
        {isTeaching && (
          <rect x="6" y="32" width="10" height="8" rx="1" fill="#3b82f6" />
        )}
      </svg>
    </div>
  );
}
