"use client";
import { useEffect, useRef } from "react";
import { TOKENS, withAlpha } from "@/constants/tokens";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TerminalLog — painel de logs estilo terminal + HUD de métricas
//  · Autoscroll inteligente: solo sigue el feed si el usuario ya estaba
//    al fondo (sticky). Si retrocede a leer, el scroll se congela.
//  · HUD de pipeline: chips STT / LLM / TTS / TOTAL com latências reais
//    medidas no hook useSofiaVoice (segundos, 2 decimais).
//  · Tipografías mínimas de 11px para legibilidade.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const fmt = (v) => (v === null || v === undefined ? "--" : `${v.toFixed(2)}s`);

export default function TerminalLog({ logs, metrics }) {
  const feedRef   = useRef(null);
  const stickyRef = useRef(true); // true = el usuario sigue el feed en vivo

  useEffect(() => {
    const feed = feedRef.current;
    if (feed && stickyRef.current) {
      feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
    }
  }, [logs]);

  const onScroll = () => {
    const feed = feedRef.current;
    if (!feed) return;
    const distance = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    stickyRef.current = distance < 28; // tolerância antes de considerar "despegado"
  };

  const colorFor = (type) => ({
    user:   TOKENS.cyan,
    ai:     TOKENS.purple,
    system: TOKENS.dim,
    error:  TOKENS.red,
  }[type] ?? TOKENS.muted);

  const prefixFor = (type) => ({
    user:   "▸ USER",
    ai:     "◈ SOFIA",
    system: "⬡ SYS",
    error:  "✖ ERR",
  }[type] ?? "·");

  const chips = [
    { label: "STT",   value: metrics?.stt,   color: TOKENS.cyan },
    { label: "LLM",   value: metrics?.llm,   color: TOKENS.blue },
    { label: "TTS",   value: metrics?.tts,   color: TOKENS.purple },
    { label: "TOTAL", value: metrics?.total, color: TOKENS.green },
  ];

  return (
    <div style={{
      width:        "100%",
      maxWidth:     "560px",
      height:       "280px",
      background:   "#080c10",
      border:       `1px solid ${TOKENS.border}`,
      borderRadius: "6px",
      overflow:     "hidden",
      display:      "flex",
      flexDirection: "column",
      boxShadow:    "inset 0 0 40px rgba(0,0,0,0.6)",
    }}>

      {/* Header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "8px",
        padding:      "8px 14px",
        borderBottom: `1px solid ${TOKENS.border}`,
        background:   TOKENS.surface,
        flexShrink:   0,
      }}>
        {["#ff5f57","#febc2e","#28c840"].map((c, i) => (
          <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c, opacity: 0.7 }} />
        ))}
        <span style={{
          marginLeft:    "8px",
          fontFamily:    "'JetBrains Mono', monospace",
          fontSize:      "11px",
          letterSpacing: "0.12em",
          color:         TOKENS.dim,
          textTransform: "uppercase",
        }}>
          rs4machine · sofia · terminal
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {[TOKENS.green, TOKENS.blue, TOKENS.purple].map((c, i) => (
            <div key={i} style={{
              width:        "4px",
              height:       "4px",
              borderRadius: "50%",
              background:   c,
              animation:    `blink-stagger ${1 + i * 0.3}s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      </div>

      {/* HUD · Métricas reais del pipeline */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "8px",
        padding:      "7px 14px",
        borderBottom: `1px solid ${TOKENS.border}`,
        background:   "#0a0f14",
        flexShrink:   0,
      }}>
        <span style={{
          fontFamily:    "'JetBrains Mono', monospace",
          fontSize:      "11px",
          letterSpacing: "0.1em",
          color:         TOKENS.muted,
          textTransform: "uppercase",
        }}>
          ◈ pipeline
        </span>
        {chips.map((c) => (
          <div key={c.label} title={`${c.label}: ${fmt(c.value)}`} style={{
            display:       "inline-flex",
            alignItems:    "center",
            gap:           "5px",
            padding:       "2px 8px",
            borderRadius:  "4px",
            border:        `1px solid ${withAlpha(c.color, 30)}`,
            background:    withAlpha(c.color, 8),
            fontFamily:    "'JetBrains Mono', monospace",
            fontSize:      "11px",
            fontWeight:    "600",
            letterSpacing: "0.05em",
            whiteSpace:    "nowrap",
          }}>
            <span style={{ color: TOKENS.muted }}>{c.label}:</span>
            <span style={{ color: c.color }}>{fmt(c.value)}</span>
          </div>
        ))}
      </div>

      {/* Linhas de log */}
      <div
        ref={feedRef}
        onScroll={onScroll}
        style={{
          flex:            1,
          minHeight:       0,
          padding:         "10px 14px",
          overflowY:       "auto",
          scrollbarWidth:  "thin",
          scrollbarColor:  `${TOKENS.border} transparent`,
        }}
      >
        {logs.map((log, i) => (
          <div key={i} style={{
            display:      "flex",
            gap:          "10px",
            marginBottom: "4px",
            animation:    "fade-in-line 0.3s ease-out forwards",
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize:   "11px",
              color:      TOKENS.dim,
              whiteSpace: "nowrap",
              paddingTop: "1px",
              minWidth:   "46px",
            }}>
              {log.time}
            </span>
            <span style={{
              fontFamily:    "'JetBrains Mono', monospace",
              fontSize:      "11px",
              color:         colorFor(log.type),
              fontWeight:    "600",
              letterSpacing: "0.06em",
              whiteSpace:    "nowrap",
              paddingTop:    "1px",
              minWidth:      "56px",
              textShadow:    `0 0 8px ${withAlpha(colorFor(log.type), 53)}`,
            }}>
              {prefixFor(log.type)}
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize:   "12px",
              color:      log.type === "system" ? TOKENS.muted : TOKENS.text,
              lineHeight: "1.6",
              opacity:    log.type === "system" ? 0.55 : 0.92,
              wordBreak:  "break-word",
            }}>
              {log.text}
              {i === logs.length - 1 && (
                <span style={{
                  color:      colorFor(log.type),
                  animation:  "cursor-blink 1s step-end infinite",
                  marginLeft: "2px",
                }}>█</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}