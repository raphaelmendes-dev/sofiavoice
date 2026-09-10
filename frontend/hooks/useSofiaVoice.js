"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { API_URL } from "@/constants/tokens";

// Configurações do VAD (Voice Activity Detection)
const SILENCE_THRESHOLD = -45; // Sensibilidade de volume em dB (quanto menor, mais sensível)
const SILENCE_DURATION_MS = 1800; // Janela de silêncio antes de cortar (1.8s - ideal para pausas de reflexão)

const BAND_COUNT        = 32;  // Bandas del perfil visual del orbe
const PROFILE_NORMALIZE = 170; // 255 (pico FFT) ≈ 1.0 del perfil visual

// Cronómetro de latências (ms). performance.now() en navegador; fallback Date.now().
const tNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Extrae el espectro real del micrófono en BAND_COUNT bandas normalizadas [0..1].
// AnalyserJS exige un Uint8Array de exactamente fftSize/2 para getByteFrequencyData.
const extractSpectrum = (analyser) => {
  if (!analyser?.getByteFrequencyData) return null;
  try {
    const binCount = analyser.fftSize / 2;
    const freq     = new Uint8Array(binCount);
    analyser.getByteFrequencyData(freq);

    const bands   = new Array(BAND_COUNT).fill(0);
    const perBand = Math.max(1, Math.floor((binCount - 2) / BAND_COUNT));
    for (let i = 0; i < BAND_COUNT; i++) {
      const start = 1 + i * perBand; // bin 0 = DC, se descarta
      const end   = Math.min(binCount - 1, start + perBand);
      let sum = 0;
      for (let j = start; j < end; j++) sum += freq[j];
      bands[i] = Math.min(1, sum / ((end - start) * PROFILE_NORMALIZE));
    }
    return bands;
  } catch {
    return null;
  }
};

export function useSofiaVoice() {
  const [voiceState, setVoiceState] = useState("idle");
  const [logs, setLogs]             = useState([]);
  const [audioData, setAudioData]   = useState(null);
  const [metrics, setMetrics]       = useState(null); // { stt, llm, tts, total } en segundos

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  
  // Refs para processamento de VAD via Web Audio API
  const audioContextRef  = useRef(null);
  const analyserRef      = useRef(null);
  const silenceTimerRef  = useRef(null);

  const now = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
  };

  const addLog = useCallback((entry) => {
    setLogs(prev => [...prev.slice(-40), { ...entry, time: now() }]);
  }, []);

  // Nota: el visualizador ya no se alimenta con datos sintéticos (Math.random).
  // Durante "listening" se publica el espectro real (FFT del micrófono) en
  // monitorSilence; al pasar a thinking/speaking se limpia con setAudioData(null).

  // Boot logs
  useEffect(() => {
    const bootLogs = [
      { type: "system", text: "Rs4Machine · Sofia v2.0 · inicializando..." },
      { type: "system", text: `Motor-Lite · FastAPI · ${API_URL}` },
      { type: "system", text: "Whisper + LLaMA · Groq · carregados" },
      { type: "system", text: "VAD Dinâmico ativado · Limiar de silêncio: 1800ms" },
      { type: "system", text: "Sistema pronto · aguardando comando de voz" },
    ];
    bootLogs.forEach((log, i) => {
      setTimeout(() => addLog(log), i * 300 + 200);
    });
  }, [addLog]);

  // Monitora o volume em tempo real para detectar quando o usuário para de falar
  const monitorSilence = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(dataArray);

    // Calcula Root Mean Square (RMS) para converter em dB
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const x = (dataArray[i] - 128) / 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;

    // Publica el espectro real para el orbe (→ VoiceVisualizer vía audioData)
    const profile = extractSpectrum(analyserRef.current);
    if (profile) setAudioData(profile);

    // Se o volume estiver abaixo do limiar de silêncio
    if (db < SILENCE_THRESHOLD) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(async () => {
          addLog({ type: "system", text: "Pausa de fala detectada · processando..." });
          const blob = await stopRecording();
          if (blob && blob.size > 0) {
            await runPipeline(blob);
          } else {
            setVoiceState("idle");
          }
        }, SILENCE_DURATION_MS);
      }
    } else {
      // Se houver voz acima do limiar, reseta o timer de corte
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      requestAnimationFrame(monitorSilence);
    }
  }, [addLog]);

  // Iniciar Gravação com VAD
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Conecta Web Audio API para monitoramento de áudio
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;

      // Inicia loop de detecção do VAD
      requestAnimationFrame(monitorSilence);

    } catch (err) {
      addLog({ type: "error", text: `Microfone bloqueado/erro: ${err.message}` });
      setVoiceState("idle");
    }
  };

  // Parar Gravação e Limpar Instâncias
  const stopRecording = () => {
    return new Promise((resolve) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") return resolve(null);

      recorder.onstop = () => {
        setAudioData(null); // el micrófono se cierra: sin espectro en vivo
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (recorder.stream) {
          recorder.stream.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close();
        }
        resolve(blob);
      };

      recorder.stop();
    });
  };

  // Pipeline Completo
  // TODO (v3.0): Este pipeline síncrono (Wait-Then-Play) se reemplazará por
  // un WebSocket /ws/audio. En v3.0: chunks de audio → Whisper streaming →
  // SSE de tokens (Groq stream) → chunks de audio TTS, sin awaits de POST.
  const runPipeline = async (audioBlob) => {
    const t0 = tNow(); // inicio del pipeline (para TOTAL)
    try {
      setVoiceState("thinking");
      setAudioData(null); // el orbe pasa a modo scan-lines, sin espectro residual
      setMetrics({ stt: null, llm: null, tts: null, total: null }); // reinicia HUD del pipeline
      addLog({ type: "system", text: "Transcrevendo áudio..." });

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");

      const sttStart = tNow();
      // TODO (v3.0): Reemplazar este POST /api/transcribe por envío de
      // chunks de audio por WS (binarios) mientras se graba; Whisper
      // transcribirá parcialmente para TTFB menor.
      const sttRes = await fetch(`${API_URL}/api/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!sttRes.ok) throw new Error("Erro na transcrição de áudio");
      const { text: userText } = await sttRes.json();
      setMetrics(prev => ({ ...prev, stt: (tNow() - sttStart) / 1000 }));

      if (!userText || !userText.trim()) {
        addLog({ type: "error", text: "Nenhuma fala clara detectada." });
        setVoiceState("idle");
        return;
      }

      addLog({ type: "user", text: userText });
      addLog({ type: "system", text: "Sofia pensando..." });

      const llmStart = tNow();
      // TODO (v3.0): En WS, la respuesta del LLM llegará vía SSE token a
      // token (stream=true en Groq). Aquí se renderizará progresivamente en
      // el orbe/terminal en vez de esperar el JSON completo.
      const chatRes = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      if (!chatRes.ok) throw new Error("Erro na geração do LLM");
      const { response: aiText } = await chatRes.json();
      setMetrics(prev => ({ ...prev, llm: (tNow() - llmStart) / 1000 }));

      addLog({ type: "ai", text: aiText });
      setVoiceState("speaking");
      addLog({ type: "system", text: "Sintetizando voz com Edge-TTS..." });

      const ttsStart = tNow();
      // TODO (v3.0): En WS, la síntesis TTS se troceará (EdgeTTS ya genera
      // por stream) y cada chunk MP3 llegará por el socket para reproducción
      // inmediata con cola (jitter buffer) en el frontend.
      const ttsRes = await fetch(`${API_URL}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });

      if (!ttsRes.ok) throw new Error("Erro na síntese TTS");
      const { audio_base64 } = await ttsRes.json();
      setMetrics(prev => ({ ...prev, tts: (tNow() - ttsStart) / 1000, total: (tNow() - t0) / 1000 }));

      const audioSrc = `data:audio/mp3;base64,${audio_base64}`;
      const audio = new Audio(audioSrc);
      audio.onended = () => setVoiceState("idle");
      audio.onerror = () => {
        addLog({ type: "error", text: "Falha na reprodução do áudio síntese." });
        setVoiceState("idle");
      };
      await audio.play();

    } catch (err) {
      addLog({ type: "error", text: `Erro no pipeline: ${err.message}` });
      setVoiceState("idle");
    }
  };

  // Botão PTT (Push To Talk / Toggle)
  const handleMicToggle = useCallback(async () => {
    if (voiceState === "idle") {
      setVoiceState("listening");
      addLog({ type: "system", text: "Microfone ativado · Pode falar..." });
      await startRecording();
    } else if (voiceState === "listening") {
      // Se clicar manualmente de novo, força a parada e processa
      const blob = await stopRecording();
      if (blob && blob.size > 0) {
        await runPipeline(blob);
      } else {
        setVoiceState("idle");
        addLog({ type: "system", text: "Entrada interrompida" });
      }
    }
  }, [voiceState, monitorSilence]);

  return { voiceState, logs, audioData, metrics, handleMicToggle };
}