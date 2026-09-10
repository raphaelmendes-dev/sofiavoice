// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rs4Machine · Design DNA · tokens.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const TOKENS = {
  cyan:    "#00f0ff",
  purple:  "#8a2be2",
  green:   "#00ff9c",
  blue:    "#3b82f6",
  red:     "#ff3b3b",
  bg:      "#0d1117",
  surface: "#161b22",
  border:  "#21262d",
  text:    "#e0e0e0",
  muted:   "#888888",
  dim:     "#444444",
};

// ── Helpers de cor ────────────────────────────────────────────────
// Convierte #RRGGBB (o #RRGGBBAA) en rgba() con opacidad 0–100.
// Reemplaza el patrón frágil `${color}${hex}` que solo funcionaba con
// hex de 6 dígitos (ex: ${color}55). Ahora cualquier formato es seguro.
export const withAlpha = (colorHex, opacityPct = 100) => {
  const hex = colorHex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = Math.max(0, Math.min(100, opacityPct)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// Mezcla un color con blanco (0 = sin cambio, 1 = blanco puro).
// Permite garantizar contraste AA sobre superficies oscuras (badges),
// en especial para tonos como el púrpura #8a2be2.
export const lighten = (colorHex, amount = 0) => {
  const hex = colorHex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix  = Math.max(0, Math.min(1, amount));
  const blend = (c) => Math.round(c + (255 - c) * mix);
  return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
};

// ── Estados de la IA ──────────────────────────────────────────────
// Los rótulos son semánticos: describen la acción real del sistema.
// "STAND-BY" en lugar de "OFFLINE": la app está viva, esperando entrada.
export const STATE_CONFIG = {
  idle: {
    color: TOKENS.cyan,
    label: "STANDBY",
    badge: "STANDBY",
    rings: 1,
    speed: 3,
  },
  listening: {
    color: TOKENS.green,
    label: "OUVINDO...",
    badge: "ESCUTANDO",
    rings: 3,
    speed: 1.5,
  },
  thinking: {
    color: TOKENS.blue,
    label: "PROCESSANDO",
    badge: "PROCESSANDO",
    rings: 2,
    speed: 2.5,
  },
  speaking: {
    color: TOKENS.purple,
    label: "FALANDO",
    badge: "FALANDO",
    rings: 4,
    speed: 0.8,
  },
};

// Troca para a URL do Render no deploy
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";