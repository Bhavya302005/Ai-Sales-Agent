"use client";

import { useEffect, useRef, useState } from "react";

interface AudioPlayerProps {
  callId: string;
  initialDuration?: number;
  summaryText?: string;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ callId, initialDuration = 0, summaryText }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeakingSummary, setIsSpeakingSummary] = useState(false);

  const audioSrc = `/api/calls/${callId}/recording`;

  // Synchronize audio state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setHasError(false);
      setIsLoading(false);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onPlay = () => {
      setIsPlaying(true);
      // Stop speech synthesis if speaking
      if (typeof window !== "undefined" && window.speechSynthesis && isSpeakingSummary) {
        window.speechSynthesis.cancel();
        setIsSpeakingSummary(false);
      }
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onError = () => {
      console.warn("Audio element encountered an error loading stream");
      setHasError(true);
      setIsLoading(false);
      setIsPlaying(false);
    };

    const onWaiting = () => {
      setIsLoading(true);
    };

    const onCanPlay = () => {
      setIsLoading(false);
      setHasError(false);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [isSpeakingSummary]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (hasError) {
      setHasError(false);
      setIsLoading(true);
      audio.load();
      try {
        await audio.play();
      } catch (err) {
        console.error("Audio playback error:", err);
        setHasError(true);
      }
      return;
    }

    if (isPlaying) {
      audio.pause();
    } else {
      try {
        setIsLoading(true);
        await audio.play();
      } catch (err) {
        console.error("Audio play failed:", err);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleSpeechSummary = () => {
    if (
      typeof window === "undefined" ||
      !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance === "undefined" ||
      !summaryText
    )
      return;

    if (isSpeakingSummary) {
      window.speechSynthesis.cancel();
      setIsSpeakingSummary(false);
    } else {
      // Pause audio if playing
      if (audioRef.current && isPlaying) {
        audioRef.current.pause();
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(summaryText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onend = () => setIsSpeakingSummary(false);
      utterance.onerror = () => setIsSpeakingSummary(false);
      setIsSpeakingSummary(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className="audio-player-container">
      <audio ref={audioRef} preload="metadata" src={audioSrc} />

      <div className="audio-player-card">
        <div className="audio-player-header">
          <div className="audio-player-title">
            <span className="audio-icon-pulse" data-playing={isPlaying}>
              <span className="pulse-dot"></span>
            </span>
            <strong>Call Recording Playback</strong>
          </div>
          <div className="audio-player-actions">
            {summaryText && (
              <button
                type="button"
                className={`audio-summary-btn ${isSpeakingSummary ? "active" : ""}`}
                onClick={toggleSpeechSummary}
                title="Read AI Call Summary aloud"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
                <span>{isSpeakingSummary ? "Stop Summary" : "Listen to Summary"}</span>
              </button>
            )}
            <a
              href={audioSrc}
              download={`call-recording-${callId}.mp3`}
              className="audio-download-btn"
              title="Download call audio file"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download</span>
            </a>
          </div>
        </div>

        {hasError ? (
          <div className="audio-error-banner">
            <span>Audio stream encountered an issue.</span>
            <button type="button" onClick={togglePlay} className="audio-retry-btn">
              Retry Playback
            </button>
          </div>
        ) : null}

        <div className="audio-controls-row">
          <button
            type="button"
            className="audio-play-btn"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause audio" : "Play audio"}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="audio-spinner" />
            ) : isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                <rect x="14" y="4" width="4" height="16" rx="1"></rect>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: "2px" }}>
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>

          <div className="audio-timeline-wrap">
            <div className="audio-timeline-track">
              <div className="audio-timeline-progress" style={{ width: `${progressPercent}%` }}></div>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="audio-timeline-slider"
                aria-label="Audio scrub timeline"
              />
            </div>
            <div className="audio-time-row">
              <span className="audio-time-current">{formatTime(currentTime)}</span>
              <div className="audio-waveform-bars" data-playing={isPlaying}>
                <span style={{ height: "40%" }} />
                <span style={{ height: "70%" }} />
                <span style={{ height: "100%" }} />
                <span style={{ height: "60%" }} />
                <span style={{ height: "85%" }} />
                <span style={{ height: "45%" }} />
                <span style={{ height: "90%" }} />
                <span style={{ height: "65%" }} />
                <span style={{ height: "35%" }} />
                <span style={{ height: "75%" }} />
              </div>
              <span className="audio-time-total">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="audio-extra-controls">
            <button
              type="button"
              className="audio-speed-btn"
              onClick={cyclePlaybackRate}
              title="Toggle playback speed"
            >
              {playbackRate}x
            </button>

            <button
              type="button"
              className="audio-mute-btn"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute" : "Mute"}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
