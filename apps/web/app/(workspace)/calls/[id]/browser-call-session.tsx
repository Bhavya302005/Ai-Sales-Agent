"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CustomSelect } from "@/app/ui/custom-select";

type Language = "en-IN" | "hi-IN";
type SessionState = "ready" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "completed" | "error";
type VoiceMessage = {
  event?: string;
  state?: SessionState;
  conversation_state?: string;
  text?: string;
  outcome?: string;
  message?: string;
  dialogue_mode?: "anthropic" | "gemini" | "deterministic";
};

type RecognitionEvent = Event & {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type RecognitionError = Event & { error: string };
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

const voiceWebSocketUrl = process.env.NEXT_PUBLIC_VOICE_WS_URL ?? "ws://localhost:8001";
const noSpeechTimeoutMs = 10_000;
const recognitionRetryDelayMs = 650;
const maxRecognitionRetries = 2;

export function participantTurnPauseMs(text: string, conversationState: string): number {
  const normalized = text.toLowerCase().replace(/[,.!?]/g, "").trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const quickReplies = /^(yes|no|okay|ok|sure|continue|go ahead|proceed|that'?s all|nothing else|no more questions)( please)?$/;
  const explicitClosures = /(under review|not decided|i don'?t know|that covers|let'?s move on|no more questions)$/;
  const unfinishedEnding = /\b(and|but|because|although|however|also|including|with|so|then|or|such as)$/;

  if (quickReplies.test(normalized)) return 900;
  if (explicitClosures.test(normalized)) return 1_200;
  if (conversationState === "Permission" || conversationState === "NextStep") return 1_300;
  if (unfinishedEnding.test(normalized) || /[,;:-]$/.test(text.trim())) return 4_200;
  if (conversationState === "FAQ") return words.length <= 5 ? 1_400 : 2_000;
  if (words.length <= 4) return 3_200;
  if (words.length <= 12) return 2_400;
  return 1_800;
}

export function BrowserCallSession({ callId, maxDuration }: { callId: string; maxDuration: number }) {
  const [language, setLanguage] = useState<Language>("en-IN");
  const [state, setState] = useState<SessionState>("ready");
  const [liveText, setLiveText] = useState("Waiting to start…");
  const [agentText, setAgentText] = useState("");
  const [conversationState, setConversationState] = useState("Permission");
  const [latency, setLatency] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [transcriptTurns, setTranscriptTurns] = useState<
    Array<{ id: string; sequence: number; speaker: "agent" | "participant"; text: string }>
  >([]);
  const [dialogueMode, setDialogueMode] = useState<
    "connecting" | "anthropic" | "gemini" | "deterministic"
  >("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const sequenceRef = useRef(1);
  const beganRef = useRef(0);
  const speechStartedRef = useRef(0);
  const speechEndedRef = useRef<number | null>(null);
  const interruptedRef = useRef(false);
  const playbackTimerRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const recognitionRetryTimerRef = useRef<number | null>(null);
  const turnCommitTimerRef = useRef<number | null>(null);
  const recognitionRetryCountRef = useRef(0);
  const startRecognitionRef = useRef<() => void>(() => undefined);
  const terminalRef = useRef(false);
  const conversationStateRef = useRef("Permission");

  const send = useCallback((payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRecognitionRetryTimer = useCallback(() => {
    if (recognitionRetryTimerRef.current !== null) {
      window.clearTimeout(recognitionRetryTimerRef.current);
      recognitionRetryTimerRef.current = null;
    }
  }, []);

  const clearTurnCommitTimer = useCallback(() => {
    if (turnCommitTimerRef.current !== null) {
      window.clearTimeout(turnCommitTimerRef.current);
      turnCommitTimerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    clearSilenceTimer();
    clearTurnCommitTimer();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
  }, [clearSilenceTimer, clearTurnCommitTimer]);

  const clearPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const startRecognition = useCallback(() => {
    const speechWindow = window as unknown as {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const RecognitionApi = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!RecognitionApi || socketRef.current?.readyState !== WebSocket.OPEN) {
      if (!RecognitionApi) setState("error");
      return;
    }
    stopRecognition();
    const recognition = new RecognitionApi();
    recognitionRef.current = recognition;
    let finalTranscriptSent = false;
    let silenceReported = false;
    let turnCommitted = false;
    const finalChunks: string[] = [];
    const reportSilence = () => {
      if (silenceReported || recognitionRef.current !== recognition) return;
      silenceReported = true;
      clearSilenceTimer();
      recognitionRef.current = null;
      recognition.abort();
      setState("thinking");
      setLiveText("No response detected — checking if you are still there…");
      send({ event: "silence" });
    };
    const commitParticipantTurn = () => {
      if (turnCommitted || recognitionRef.current !== recognition) return;
      const text = finalChunks.join(" ").replace(/\s+/g, " ").trim();
      if (!text) return;
      turnCommitted = true;
      finalTranscriptSent = true;
      recognitionRetryCountRef.current = 0;
      clearSilenceTimer();
      clearTurnCommitTimer();
      const ended = Math.max(
        speechStartedRef.current,
        Math.round(performance.now() - beganRef.current),
      );
      speechEndedRef.current = performance.now();
      recognitionRef.current = null;
      recognition.abort();
      setState("thinking");
      setLiveText(text);
      send({ event: "speech.end" });
      send({
        event: "transcript.final",
        text,
        language,
        sequence: sequenceRef.current,
        started_ms: speechStartedRef.current,
        ended_ms: ended,
      });
      sequenceRef.current += 2;
    };
    const scheduleParticipantTurnCommit = () => {
      if (!finalChunks.length || turnCommitted) return;
      clearTurnCommitTimer();
      turnCommitTimerRef.current = window.setTimeout(
        commitParticipantTurn,
        participantTurnPauseMs(finalChunks.join(" "), conversationStateRef.current),
      );
    };
    recognition.lang = language;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = () => {
      setState((current) => current === "speaking" ? current : "listening");
      clearSilenceTimer();
      silenceTimerRef.current = window.setTimeout(reportSilence, noSpeechTimeoutMs);
    };
    recognition.onspeechstart = () => {
      clearSilenceTimer();
      clearTurnCommitTimer();
      if (!finalChunks.length) {
        speechStartedRef.current = Math.max(
          0,
          Math.round(performance.now() - beganRef.current),
        );
      }
      if (window.speechSynthesis.speaking) {
        interruptedRef.current = true;
        window.speechSynthesis.cancel();
        setState("interrupted");
      }
      send({ event: "speech.start" });
    };
    recognition.onspeechend = () => {
      clearSilenceTimer();
      speechEndedRef.current = performance.now();
      setState("listening");
      scheduleParticipantTurnCommit();
    };
    recognition.onresult = (event) => {
      let partial = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        if (result.isFinal && text) {
          clearSilenceTimer();
          finalChunks.push(text);
          setLiveText(finalChunks.join(" "));
          scheduleParticipantTurnCommit();
        } else {
          partial += text;
        }
      }
      if (partial) {
        setLiveText(partial);
        send({ event: "transcript.partial", text: partial });
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "no-speech") reportSilence();
      else if (event.error === "network" && recognitionRetryCountRef.current < maxRecognitionRetries) {
        recognitionRetryCountRef.current += 1;
        clearSilenceTimer();
        recognitionRef.current = null;
        setState("connecting");
        setLiveText(
          `Browser speech service interrupted — retrying (${recognitionRetryCountRef.current}/${maxRecognitionRetries})…`,
        );
        clearRecognitionRetryTimer();
        recognitionRetryTimerRef.current = window.setTimeout(
          () => startRecognitionRef.current(),
          recognitionRetryDelayMs,
        );
      }
      else {
        clearSilenceTimer();
        setState("error");
        const explanation: Record<string, string> = {
          "audio-capture": "No working microphone was detected.",
          "not-allowed": "Microphone or browser speech permission was denied.",
          "service-not-allowed": "Browser speech recognition is blocked by browser policy.",
          "language-not-supported": "The selected speech-recognition language is unavailable.",
          network: "Browser speech recognition could not reach its speech service after two retries.",
        };
        setLiveText(explanation[event.error] ?? `Browser speech recognition failed (${event.error}).`);
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      if (!finalTranscriptSent && !finalChunks.length) {
        reportSilence();
        return;
      }
      if (!turnCommitted) {
        window.setTimeout(() => {
          if (recognitionRef.current !== recognition || turnCommitted) return;
          try {
            recognition.start();
          } catch {
            scheduleParticipantTurnCommit();
          }
        }, 100);
      }
    };
    recognition.start();
  }, [
    clearRecognitionRetryTimer,
    clearSilenceTimer,
    clearTurnCommitTimer,
    language,
    send,
    stopRecognition,
  ]);
  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const speak = useCallback((text: string) => {
    clearPlaybackTimer();
    window.speechSynthesis.cancel();
    interruptedRef.current = false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = 1.04;
    utterance.pitch = 1.02;
    utterance.onstart = () => {
      // Browser speech recognition can hear speechSynthesis as microphone input and
      // falsely treat the agent's own voice as a barge-in. Keep the no-credit
      // rehearsal half-duplex; ConversationRelay handles real-call barge-in.
      stopRecognition();
      setState("speaking");
      const measuredLatency = speechEndedRef.current === null
        ? null
        : Math.round(performance.now() - speechEndedRef.current);
      send({ event: "playback.started", ...(measuredLatency === null ? {} : { latency_ms: measuredLatency }) });
      if (measuredLatency !== null) setLatency(measuredLatency);
    };
    let playbackFinished = false;
    const finishPlayback = () => {
      if (playbackFinished) return;
      playbackFinished = true;
      clearPlaybackTimer();
      if (terminalRef.current) return;
      send({ event: "playback.ended" });
      setState("listening");
      // Chrome can leave a non-continuous recognizer object present after it has
      // stopped accepting audio. Always replace it when playback finishes so the
      // next qualification answer has a fresh listening turn.
      startRecognition();
    };
    utterance.onend = finishPlayback;
    utterance.onerror = finishPlayback;
    const expectedPlaybackMs = Math.min(15_000, Math.max(2_500, text.length * 85));
    playbackTimerRef.current = window.setTimeout(finishPlayback, expectedPlaybackMs);
    window.speechSynthesis.speak(utterance);
  }, [clearPlaybackTimer, language, send, startRecognition, stopRecognition]);

  const stop = useCallback(() => {
    terminalRef.current = true;
    send({ event: "end" });
    clearPlaybackTimer();
    clearRecognitionRetryTimer();
    stopRecognition();
    window.speechSynthesis.cancel();
    setState("completed");
  }, [clearPlaybackTimer, clearRecognitionRetryTimer, send, stopRecognition]);

  const start = useCallback(() => {
    const speechWindow = window as unknown as {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const RecognitionApi = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!RecognitionApi) {
      setState("error");
      setLiveText("Browser speech recognition is unavailable. Use current Chrome.");
      return;
    }
    beganRef.current = performance.now();
    terminalRef.current = false;
    setState("connecting");
    const socket = new WebSocket(
      `${voiceWebSocketUrl}/api/v1/voice/calls/${encodeURIComponent(callId)}?language_code=${language}`,
    );
    socketRef.current = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as VoiceMessage;
      if (message.event === "session.started" && message.dialogue_mode) {
        setDialogueMode(message.dialogue_mode);
      }
      if (message.event === "state.changed" && message.state) setState(message.state);
      if (message.event === "playback.cancel") {
        interruptedRef.current = true;
        clearPlaybackTimer();
        window.speechSynthesis.cancel();
        setState("interrupted");
        startRecognition();
      }
      if (message.event === "agent.response" && message.text) {
        setAgentText(message.text);
        const incomingAgentText = message.text;
        setTranscriptTurns((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}-${prev.length}`,
            sequence: prev.length + 1,
            speaker: "agent",
            text: incomingAgentText,
          },
        ]);
        if (message.conversation_state) {
          conversationStateRef.current = message.conversation_state;
          setConversationState(message.conversation_state);
        }
        speak(message.text);
      }
      if (message.event === "transcript.final" && message.text) {
        setLiveText(message.text);
        const incomingParticipantText = message.text;
        setTranscriptTurns((prev) => [
          ...prev,
          {
            id: `participant-${Date.now()}-${prev.length}`,
            sequence: prev.length + 1,
            speaker: "participant",
            text: incomingParticipantText,
          },
        ]);
      }
      if (message.event === "session.completed") {
        terminalRef.current = true;
        setOutcome(message.outcome ?? "completed");
        setState("completed");
        clearPlaybackTimer();
        stopRecognition();
        window.speechSynthesis.cancel();
      }
      if (message.event === "error") {
        terminalRef.current = true;
        setState("error");
        setLiveText(message.message ?? "Voice session error");
      }
    };
    socket.onerror = () => setState("error");
    socket.onclose = (event) => {
      if (event.code !== 1000) {
        setState("error");
        setLiveText(event.reason || `Voice connection closed (${event.code})`);
      }
    };
  }, [callId, clearPlaybackTimer, language, speak, startRecognition, stopRecognition]);

  useEffect(() => () => {
    clearPlaybackTimer();
    clearRecognitionRetryTimer();
    clearSilenceTimer();
    stopRecognition();
    window.speechSynthesis.cancel();
    socketRef.current?.close();
  }, [clearPlaybackTimer, clearRecognitionRetryTimer, clearSilenceTimer, stopRecognition]);

  return (
    <div className="voice-grid">
      <section className="voice-console">
        <div className={`voice-pulse ${state === "listening" ? "active" : ""}`} />
        <div><p className="kicker">Live state</p><h2>{state}</h2></div>
        <p className="panel-copy">
          Browser speech · {dialogueMode === "gemini" ? "Gemini Flash-Lite processing" : dialogueMode === "anthropic" ? "Claude Haiku processing" : dialogueMode === "deterministic" ? "deterministic fallback processing" : "checking processing mode"}. Turn-by-turn rehearsal mode; real calls support barge-in.
        </p>
        <label className="voice-language">
          <span>Conversation language</span>
          <CustomSelect
            value={language}
            onChange={(nextLang) => setLanguage(nextLang as Language)}
            options={[
              { value: "en-IN", label: "English (India)" },
              { value: "hi-IN", label: "Hindi" },
            ]}
            disabled={state !== "ready"}
            ariaLabel="Conversation language"
          />
        </label>
        <div className="voice-actions">
          <button className="primary-button" type="button" onClick={start} disabled={state !== "ready"}>Start AI call</button>
          <button className="secondary-button" type="button" onClick={stop} disabled={["ready", "completed"].includes(state)}>Stop immediately</button>
        </div>
        <p className="fine-print">Maximum {maxDuration} seconds · audio is not recorded</p>
      </section>
      <section className="voice-results">
        <div>
          <span>Conversation stage</span><strong>{conversationState}</strong>
          {conversationState === "FAQ" && state !== "completed" ? (
            <p>Ask another question, or say “No more questions” to continue to the recap.</p>
          ) : null}
        </div>
        <div><span>AI response</span><strong>{agentText || "Waiting…"}</strong></div>
        <div><span>Participant transcript</span><strong>{liveText}</strong></div>
        <div><span>Speech end → first audio</span><strong>{latency === null ? "—" : `${latency} ms`}</strong></div>
        <div><span>Outcome</span><strong>{outcome ?? "In progress"}</strong></div>
      </section>
      <section className="detail-panel transcript-panel" style={{ gridColumn: "1 / -1", marginTop: "8px" }}>
        <div className="section-heading">
          <div>
            <p className="kicker">Live dialogue</p>
            <h2>Live transcript</h2>
          </div>
          <span className="verified-pill" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="active-profile-dot" /> {state}
          </span>
        </div>
        <div className="transcript-list">
          {transcriptTurns.length > 0 ? (
            transcriptTurns.map((turn) => (
              <article key={turn.id} className="transcript-row">
                <div><span>{turn.speaker}</span><small>#{turn.sequence}</small></div>
                <p>{turn.speaker === "agent" ? "Alex: " : "You: "}{turn.text}</p>
              </article>
            ))
          ) : (
            <article className="transcript-row" style={{ textAlign: "center", padding: "28px 16px" }}>
              <p style={{ color: "var(--muted)", margin: 0 }}>
                {state === "ready"
                  ? "Click “Start AI call” to begin the voice session."
                  : "Listening for speech… Live conversation turns will appear here as dialogue progresses."}
              </p>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
