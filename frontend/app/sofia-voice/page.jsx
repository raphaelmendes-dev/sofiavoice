"use client";
import "@/styles/sofia-voice.css";
import { TOKENS } from "@/constants/tokens";
import { useSofiaVoice } from "@/hooks/useSofiaVoice";
import VoiceVisualizer from "@/components/SofiaVoice/VoiceVisualizer";
import MicButton       from "@/components/SofiaVoice/MicButton";
import TerminalLog     from "@/components/SofiaVoice/TerminalLog";
import StatusBadge     from "@/components/SofiaVoice/StatusBadge";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SofiaVoicePage — Orquestrador Rs4Machine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function SofiaVoicePage() {
  const { voiceState, logs, audioData, metrics, handleMicToggle } = useSofiaVoice();

  return (
    <>
      {/* ── LAYOUT PRINCIPAL ── */}
      <div style={{
        minHeight:      "100vh",
        background:     "linear-gradient(160deg, #0a0a0a 0%, #0d1117 40%, #080d14 100%)",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "40px 24px",
        position:       "relative",
        overflow:       "hidden",
      }}>

        {/* Grain noise overlay */}
        <div style={{
          position:        "absolute",
          inset:           0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          pointerEvents:   "none",
          zIndex:          0,
        }} />

        {/* Grid lines de fundo */}
        <div style={{
          position:        "absolute",
          inset:           0,
          backgroundImage: `
            linear-gradient(rgba(0,240,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,240,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize:  "48px 48px",
          pointerEvents:   "none",
          zIndex:          0,
        }} />

        {/* ── HEADER ── */}
        <div style={{
          position:      "relative",
          zIndex:        1,
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           "12px",
          marginBottom:  "40px",
          animation:     "stagger-in 0.6s ease-out forwards",
        }}>
          <div style={{
            fontFamily:    "'Space Mono', monospace",
            fontSize:      "11px",
            letterSpacing: "0.4em",
            color:         TOKENS.dim,
            textTransform: "uppercase",
          }}>
            Rs4Machine · CEO Raphael Mendes
          </div>

          <div style={{
            fontFamily:    "'Space Mono', monospace",
            fontSize:      "28px",
            fontWeight:    "700",
            letterSpacing: "0.08em",
            color:         TOKENS.cyan,
            textTransform: "uppercase",
            animation:     "logo-glow 3s ease-in-out infinite",
          }}>
            SOFIA
          </div>

          <div style={{
            fontFamily:    "'JetBrains Mono', monospace",
            fontSize:      "10px",
            letterSpacing: "0.25em",
            color:         TOKENS.muted,
            textTransform: "uppercase",
          }}>
            Voice Intelligence System · v2.0
          </div>

          <StatusBadge state={voiceState} />
        </div>

        {/* ── VISUALIZADOR ── */}
        <div style={{
          position:     "relative",
          zIndex:       1,
          animation:    "stagger-in 0.6s ease-out 0.15s both",
          marginBottom: "36px",
        }}>
          <VoiceVisualizer state={voiceState} audioData={audioData} />
        </div>

        {/* ── MIC BUTTON ── */}
        <div style={{
          position:     "relative",
          zIndex:       1,
          marginBottom: "52px",
          animation:    "stagger-in 0.6s ease-out 0.3s both",
        }}>
          <MicButton state={voiceState} onToggle={handleMicToggle} />
        </div>

        {/* ── TERMINAL LOG ── */}
        <div style={{
          position:  "relative",
          zIndex:    1,
          width:     "100%",
          maxWidth:  "560px",
          animation: "stagger-in 0.6s ease-out 0.45s both",
        }}>
          <TerminalLog logs={logs} metrics={metrics} />
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          position:      "absolute",
          bottom:        "20px",
          fontFamily:    "'JetBrains Mono', monospace",
          fontSize:      "9px",
          letterSpacing: "0.2em",
          color:         TOKENS.dim,
          textTransform: "uppercase",
          zIndex:        1,
          display:       "flex",
          gap:           "24px",
        }}>
          {["FastAPI:8000", "Whisper:active", "gpt-oss-20b:active", "EdgeTTS:active"].map((s, i) => (
            <span key={i} style={{ opacity: 0.5 }}>{s}</span>
          ))}
        </div>

      </div>
    </>
  );
}