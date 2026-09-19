# ADR 0003: Browser voice feasibility transport

Status: accepted for V01 feasibility; production hardening pending

Live verification on 2026-09-16 reached Sarvam with the configured credential but returned HTTP 402
`insufficient_quota_error`. The integration is implemented and locally verified, but a bilingual live
round trip is blocked until the Sarvam account has credits. No successful provider latency is claimed.

To keep the MVP usable while that external account is blocked, `/voice-lab` defaults to a clearly
labeled browser fallback. Chrome speech recognition performs the selected English or Hindi
transcription and the Web Speech synthesis engine speaks the fixed response. It requires no Sarvam
credits and does not send audio through the application backend. Chrome may use an online browser-vendor
speech service, so this is a demo fallback rather than a privacy-equivalent production transport.

## Decision

Use browser microphone capture and a dedicated FastAPI voice proxy for the MVP. The browser converts
mono microphone frames to 16 kHz signed PCM and sends base64 chunks to the local voice service. The
voice service authenticates the application session, keeps the Sarvam credential server-side, and
bridges audio to Sarvam realtime STT. A final transcript triggers one fixed English or Hindi response
through Sarvam's HTTP streaming TTS endpoint.

The V01 screen is deliberately one-turn. It proves permission, capture, bilingual transcription,
synthesis, immediate stop, and an observed round-trip upper bound without pretending to be the full
agent conversation.

## Safety and privacy

- Raw audio is relayed in memory and is not stored.
- `RECORD_AUDIO=false` remains the default.
- The browser never receives the provider API key.
- The voice WebSocket and TTS endpoint require the signed application session and active membership.
- Client messages and audio chunk size are allowlisted before forwarding.
- Stop closes microphone tracks, the audio graph, provider socket, and any active playback.

## Known limitations

- The browser currently buffers the returned MP3 before playback. The displayed speech-end-to-playback
  value is therefore a conservative upper bound, not provider time-to-first-byte.
- `ScriptProcessorNode` is sufficient for this short feasibility spike but should be replaced with an
  `AudioWorklet` during V02.
- Acoustic echo can retrigger VAD; headphones are recommended for V01. V02 must add robust barge-in,
  output cancellation, reconnect/backoff, session persistence, and scripted policy turns.
- Chrome microphone permission and live English/Hindi checks require a human browser run.

## Provider contract verified

- Realtime STT: `saaras:v3-realtime`, fast stream, VAD endpointing, 16 kHz mono `linear16`.
- TTS: `bulbul:v3`, `shubh`, MP3 at 64 kbps.
