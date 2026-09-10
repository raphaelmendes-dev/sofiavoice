"use client";
import { STATE_CONFIG, withAlpha } from "@/constants/tokens";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VoiceVisualizer — orbe central responsivo
//  · listening → espectro REAL (FFT del micrófono vía audioData del hook)
//  · speaking  → barras animadas por CSS puro (sin Math.random ni Date.now)
//  · thinking  → scan lines de barrido
//  · idle      → respiración / standby
//  Dimensiones relativas: min(260px, 70vw). Glows con withAlpha().
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const BAR_COUNT = 22;

const clamp01 = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.min(1, n));
};

const hasSpectrum = (d) => Array.isArray(d) && d.length >= 16;

export default function VoiceVisualizer({ state, audioData }) {
  const cfg    = STATE_CONFIG[state];
  const color  = cfg.color;
  const active = state !== "idle";
  const live   = hasSpectrum(audioData) ? audioData : null;

  // Alturas en % del contenedor; con datos en vivo siguen la energía real.
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const base = live ? clamp01(live[i]) : 0.08;
    return 6 + base * 88;
  });

  return (
    <div style={{
      position:       "relative",
      width:          "min(260px, 70vw)",
      height:         "min(260px, 70vw)",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
    }}>

      {/* Anillos de expansión */}
      {Array.from({ length: cfg.rings }).map((_, i) => (
        <div key={i} style={{
          position:     "absolute",
          width:        `${60 + i * 12}%`,
          height:       `${60 + i * 12}%`,
          borderRadius: "50%",
          border:       `1px solid ${withAlpha(color, 40)}`,
          opacity:      state === "idle" ? 0.08 : 0,
          animation:    active
            ? `ring-expand ${cfg.speed + i * 0.4}s ease-out ${i * (cfg.speed / cfg.rings)}s infinite`
            : "none",
          boxShadow: `0 0 12px ${withAlpha(color, 14)}`,
        }} />
      ))}

      {/* Anillo externo estático */}
      <div style={{
        position:     "absolute",
        width:        "78%",
        height:       "78%",
        borderRadius: "50%",
        border:       `1px solid ${withAlpha(color, 24)}`,
        boxShadow:    `0 0 20px ${withAlpha(color, 14)}, inset 0 0 20px ${withAlpha(color, 7)}`,
      }} />

      {/* Núcleo */}
      <div style={{
        position:       "relative",
        width:          "54%",
        height:         "54%",
        borderRadius:   "50%",
        border:         `2px solid ${color}`,
        background:     `radial-gradient(circle at center, ${withAlpha(color, 10)} 0%, ${withAlpha(color, 4)} 50%, transparent 70%)`,
        boxShadow:      `0 0 30px ${withAlpha(color, 34)}, 0 0 60px ${withAlpha(color, 14)}, inset 0 0 30px ${withAlpha(color, 14)}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        animation:      state === "thinking"
          ? "spin-slow 4s linear infinite"
          : state === "idle"
          ? "idle-breathe 3s ease-in-out infinite"
          : "core-pulse 1.2s ease-in-out infinite",
        transition: "border-color 0.6s ease, box-shadow 0.6s ease",
      }}>

        {/* Scan lines — thinking */}
        {state === "thinking" && (
          <div style={{ position: "absolute", inset: "4px", borderRadius: "50%", overflow: "hidden", opacity: 0.3 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                position:   "absolute",
                left: 0, right: 0,
                height:     "1px",
                background: color,
                top:        `${10 + i * 16}%`,
                opacity:    0.6,
              }} />
            ))}
          </div>
        )}

        {/* Espectro real — listening/speaking con datos en vivo del micrófono */}
        {(state === "listening" || state === "speaking") && live && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "46%", width: "88%" }}>
            {bars.map((h, i) => (
              <div key={i} style={{
                flex:        1,
                height:      `${h}%`,
                background:  `linear-gradient(to top, ${withAlpha(color, 45)}, ${withAlpha(color, 90)})`,
                borderRadius: "2px",
                boxShadow:   `0 0 4px ${withAlpha(color, 40)}`,
                transition:  "height 0.06s linear",
              }} />
            ))}
          </div>
        )}

        {/* Ondas — listening sin datos en vivo (fallback suave) */}
        {state === "listening" && !live && (
          <svg width="80" height="40" viewBox="0 0 80 40">
            {[0, 1, 2].map((i) => (
              <path key={i}
                d={`M ${8 + i * 8} 20 Q ${20 + i * 6} ${10 - i * 3} ${32 + i * 8} 20 Q ${44 + i * 4} ${30 + i * 3} ${56 + i * 4} 20`}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                style={{
                  opacity:   0.6 - i * 0.15,
                  animation: `wave-move ${1 + i * 0.3}s ease-in-out ${i * 0.2}s infinite alternate`,
                }}
              />
            ))}
          </svg>
        )}

        {/* Barras — speaking: animadas por CSS puro (determinista y fluido) */}
        {state === "speaking" && !live && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "58%", width: "74%" }}>
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} style={{
                flex:            1,
                height:          "100%",
                borderRadius:    "3px",
                background:      `linear-gradient(to top, ${withAlpha(color, 40)}, ${withAlpha(color, 90)})`,
                boxShadow:       `0 0 5px ${withAlpha(color, 45)}`,
                transformOrigin: "bottom",
                animation:       `bar-bounce ${0.55 + (i % 5) * 0.09}s ease-in-out ${i * 0.05}s infinite`,
              }} />
            ))}
          </div>
        )}

        {/* Ícono idle */}
        {state === "idle" && (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" fill={color} opacity="0.8" />
            <circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1" opacity="0.4" />
          </svg>
        )}
      </div>

      {/* Label de estado */}
      <div style={{
        position:      "absolute",
        bottom:        "-8px",
        fontFamily:    "'JetBrains Mono', monospace",
        fontSize:      "10px",
        letterSpacing: "0.2em",
        color:         color,
        textTransform: "uppercase",
        textShadow:    `0 0 10px ${withAlpha(color, 60)}`,
        opacity:       0.9,
      }}>
        {cfg.label}
      </div>
    </div>
  );
}