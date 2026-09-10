"use client";
import { STATE_CONFIG, withAlpha, lighten } from "@/constants/tokens";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StatusBadge — badge de status semántico da IA
//  · Contraste: el texto se aclara con lighten() para alcanzar AA sobre
//    superficies oscuras (púrpura #8a2be2 incluido).
//  · Pill redondeado con glow por estado y dot pulsante cuando está activo.
//  · role="status" + aria-live para screen readers.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function StatusBadge({ state }) {
  const cfg    = STATE_CONFIG[state];
  const color  = cfg.color;
  const text   = lighten(color, 0.35);
  const active = state !== "idle";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={cfg.badge}
      title={cfg.label}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           "8px",
        padding:       "6px 14px",
        border:        `1px solid ${withAlpha(color, 45)}`,
        borderRadius:  "999px",
        background:    `linear-gradient(180deg, ${withAlpha(color, 18)} 0%, ${withAlpha(color, 8)} 100%)`,
        fontFamily:    "'JetBrains Mono', monospace",
        fontSize:      "11px",
        fontWeight:    "700",
        letterSpacing: "0.14em",
        color:         text,
        textTransform: "uppercase",
        boxShadow:     `0 0 14px ${withAlpha(color, 18)}, inset 0 0 8px ${withAlpha(color, 6)}`,
      }}
    >
      <span style={{
        width:        "7px",
        height:       "7px",
        borderRadius: "50%",
        background:   color,
        boxShadow:    `0 0 8px ${color}`,
        animation:    active ? "dot-blink 1.2s ease-in-out infinite" : "none",
        flexShrink:   0,
      }} />
      {cfg.badge}
    </div>
  );
}