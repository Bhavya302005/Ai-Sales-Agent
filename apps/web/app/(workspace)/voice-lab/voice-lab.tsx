"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CustomSelect } from "@/app/ui/custom-select";

type Language = "auto" | "en-IN" | "hi-IN";
type Transport = "browser" | "sarvam";
type VoiceEvent = {
  event?: string;
  text?: string;
  language?: string;
  message?: string;
  audio_duration_s?: number;
};

type BrowserRecognitionEvent = Event & {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type BrowserRecognitionError = Event & { error: string };

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: BrowserRecognitionEvent) => void) | null;
  onspeechend: (() => void) | null;
  onerror: ((event: BrowserRecognitionError) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const voiceBaseUrl = process.env.NEXT_PUBLIC_VOICE_BASE_URL ?? "http://localhost:8001";
const voiceWebSocketUrl = process.env.NEXT_PUBLIC_VOICE_WS_URL ?? "ws://localhost:8001";

function pcm16Base64(input: Float32Array, inputRate: number): string {
  const ratio = inputRate / 16_000;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(input.length, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) sum += input[inputIndex];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[outputIndex] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function responseFor(language: string | undefined): { text: string; language_code: "en-IN" | "hi-IN" } {
  if (language === "hi-IN") {
    return { text: "धन्यवाद। आपकी आवाज़ साफ़ सुनाई दी।", language_code: "hi-IN" };
  }
  return { text: "Thank you. I heard you clearly.", language_code: "en-IN" };
}

export function VoiceLab() {
  const [transport, setTransport] = useState<Transport>("browser");
  const [language, setLanguage] = useState<Language>("en-IN");
  const [status, setStatus] = useState("Ready");
  const [partial, setPartial] = useState("");
  const [finalText, setFinalText] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechEndRef = useRef<number | null>(null);
  const synthesisStartedRef = useRef(false);
  const providerErrorRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const stopCapture = useCallback((closeSocket = true) => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
    if (closeSocket && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ event: "end" }));
      socketRef.current.close(1000, "capture complete");
    }
    if (closeSocket) socketRef.current = null;
    setIsListening(false);
  }, []);

  const stopAll = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    stopCapture();
  }, [stopCapture]);

  const resetAttempt = useCallback(() => {
    setPartial("");
    setFinalText("");
    setDetectedLanguage(null);
    setLatency(null);
    synthesisStartedRef.current = false;
    providerErrorRef.current = false;
    speechEndRef.current = null;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
  }, []);

  const playBrowserResponse = useCallback((spokenLanguage: "en-IN" | "hi-IN") => {
    if (synthesisStartedRef.current) return;
    synthesisStartedRef.current = true;
    setIsListening(false);
    setStatus("Synthesizing with the browser voice…");
    const response = responseFor(spokenLanguage);
    const utterance = new SpeechSynthesisUtterance(response.text);
    utterance.lang = response.language_code;
    utterance.rate = 1;
    utterance.onstart = () => {
      if (speechEndRef.current !== null) {
        setLatency(Math.round(performance.now() - speechEndRef.current));
      }
      setStatus("Playing browser response");
    };
    utterance.onend = () => setStatus("Browser round trip complete");
    utterance.onerror = () => setStatus("Browser speech synthesis failed");
    window.speechSynthesis.speak(utterance);
  }, []);

  const playFixedResponse = useCallback(async (spokenLanguage?: string) => {
    if (synthesisStartedRef.current) return;
    synthesisStartedRef.current = true;
    stopCapture(false);
    setStatus("Synthesizing fixed response…");
    const responseText = responseFor(spokenLanguage);
    try {
      const response = await fetch(`${voiceBaseUrl}/api/v1/voice/tts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseText),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(problem?.detail ?? `TTS failed (${response.status})`);
      }
      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.addEventListener(
        "playing",
        () => {
          if (speechEndRef.current !== null) {
            setLatency(Math.round(performance.now() - speechEndRef.current));
          }
          setStatus("Playing fixed response");
        },
        { once: true },
      );
      audio.addEventListener(
        "ended",
        () => {
          URL.revokeObjectURL(audioUrl);
          setStatus("Round trip complete");
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ event: "end" }));
            socketRef.current.close(1000, "round trip complete");
          }
          socketRef.current = null;
        },
        { once: true },
      );
      await audio.play();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Speech synthesis failed");
      socketRef.current?.close();
      socketRef.current = null;
    }
  }, [stopCapture]);

  const startSarvam = useCallback(async () => {
    resetAttempt();
    setStatus("Requesting microphone permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const socket = new WebSocket(
        `${voiceWebSocketUrl}/api/v1/voice/stream?language_code=${encodeURIComponent(language)}`,
      );
      socketRef.current = socket;
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as VoiceEvent;
        if (message.event === "session.begin") setStatus("Listening — speak now");
        if (message.event === "vad.speech_start") {
          audioRef.current?.pause();
          setStatus("Speech detected");
        }
        if (message.event === "vad.speech_end") {
          speechEndRef.current = performance.now();
          setStatus("Transcribing…");
        }
        if (message.event === "transcript.partial") setPartial(message.text ?? "");
        if (message.event === "transcript.final") {
          setFinalText(message.text ?? "");
          setPartial("");
          setDetectedLanguage(message.language ?? (language === "auto" ? null : language));
          void playFixedResponse(message.language ?? (language === "auto" ? undefined : language));
        }
        if (message.event === "error") {
          providerErrorRef.current = true;
          setStatus(message.message ?? "Voice provider error");
          stopCapture(false);
        }
      });
      socket.addEventListener("close", (event) => {
        if (event.code !== 1000 && !synthesisStartedRef.current && !providerErrorRef.current) {
          setStatus(`Voice connection closed (${event.code})`);
          stopCapture(false);
        }
      });
      socket.addEventListener("error", () => setStatus("Could not connect to voice service"));
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(new Error("Voice service unavailable")), {
          once: true,
        });
      });

      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      contextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      processor.onaudioprocess = (audioEvent) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            event: "audio_input",
            audio: pcm16Base64(audioEvent.inputBuffer.getChannelData(0), context.sampleRate),
          }),
        );
      };
      source.connect(processor);
      processor.connect(context.destination);
      setIsListening(true);
      setStatus("Connected — speak English or Hindi");
    } catch (error) {
      stopCapture();
      setStatus(error instanceof Error ? error.message : "Microphone setup failed");
    }
  }, [language, playFixedResponse, resetAttempt, stopCapture]);

  const startBrowser = useCallback(() => {
    resetAttempt();
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Browser speech recognition is unavailable. Use current Chrome or Sarvam mode.");
      return;
    }
    const spokenLanguage = language === "hi-IN" ? "hi-IN" : "en-IN";
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = spokenLanguage;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      setIsListening(true);
      setStatus(`Listening in ${spokenLanguage === "hi-IN" ? "Hindi" : "English"} — speak now`);
    };
    recognition.onspeechend = () => {
      speechEndRef.current = performance.now();
      setStatus("Transcribing with browser speech service…");
      recognition.stop();
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          const transcript = result[0].transcript.trim();
          speechEndRef.current ??= performance.now();
          setFinalText(transcript);
          setPartial("");
          setDetectedLanguage(spokenLanguage);
          recognitionRef.current = null;
          playBrowserResponse(spokenLanguage);
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) setPartial(interim);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      setIsListening(false);
      const message =
        event.error === "not-allowed"
          ? "Microphone or speech-recognition permission was denied"
          : event.error === "no-speech"
            ? "No speech detected — try again"
            : `Browser speech recognition failed (${event.error})`;
      setStatus(message);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    setStatus("Requesting browser speech permission…");
    recognition.start();
  }, [language, playBrowserResponse, resetAttempt]);

  useEffect(() => () => {
    stopAll();
  }, [stopAll]);

  return (
    <div className="voice-grid">
      <section className="voice-console">
        <div className={`voice-pulse ${isListening ? "active" : ""}`} aria-hidden="true" />
        <div>
          <p className="kicker">Connection status</p>
          <h2>{status}</h2>
          <p className="panel-copy">
            {transport === "browser"
              ? "No Sarvam credits are required. Chrome may use its online speech service; this app does not store audio."
              : "Audio is processed live by Sarvam and is not recorded. Use headphones to avoid speaker echo."}
          </p>
        </div>
        <label className="voice-language">
          <span>Voice engine</span>
          <CustomSelect
            value={transport}
            onChange={(nextTransport) => {
              stopAll();
              setTransport(nextTransport as Transport);
              if (nextTransport === "browser" && language === "auto") setLanguage("en-IN");
              setStatus("Ready");
            }}
            options={[
              { value: "browser", label: "Browser fallback — no Sarvam credits" },
              { value: "sarvam", label: "Sarvam realtime — credits required" },
            ]}
            disabled={isListening}
            ariaLabel="Voice engine"
          />
        </label>
        <label className="voice-language">
          <span>Input language</span>
          <CustomSelect
            value={language}
            onChange={(nextLang) => setLanguage(nextLang as Language)}
            options={[
              ...(transport === "sarvam" ? [{ value: "auto", label: "Auto detect" }] : []),
              { value: "en-IN", label: "English (India)" },
              { value: "hi-IN", label: "Hindi" },
            ]}
            disabled={isListening}
            ariaLabel="Input language"
          />
        </label>
        <div className="voice-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => transport === "browser" ? startBrowser() : void startSarvam()}
            disabled={isListening}
          >
            Start one-turn test
          </button>
          <button className="secondary-button" type="button" onClick={() => { stopAll(); setStatus("Stopped"); }}>
            Stop immediately
          </button>
        </div>
      </section>
      <section className="voice-results">
        <div>
          <span>Live transcript</span>
          <strong>{finalText || partial || "Waiting for speech…"}</strong>
        </div>
        <div>
          <span>Detected language</span>
          <strong>{detectedLanguage ?? "—"}</strong>
        </div>
        <div>
          <span>Speech-end → playback</span>
          <strong>{latency === null ? "—" : `${latency} ms`}</strong>
        </div>
        <p>
          {transport === "browser"
            ? "Browser mode is the working no-credit fallback. Select English or Hindi explicitly; browser recognition cannot auto-detect between them."
            : "Sarvam mode buffers the returned MP3 before playback, so the measurement is a conservative upper bound—not provider time-to-first-byte."}
        </p>
      </section>
    </div>
  );
}
