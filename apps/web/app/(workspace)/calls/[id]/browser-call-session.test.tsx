import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserCallSession, participantTurnPauseMs } from "./browser-call-session";

describe("participantTurnPauseMs", () => {
  it("commits direct confirmations quickly", () => {
    expect(participantTurnPauseMs("Yes, please", "Permission")).toBe(900);
    expect(participantTurnPauseMs("No more questions", "FAQ")).toBe(900);
  });

  it("allows longer pauses for short or visibly unfinished qualification answers", () => {
    expect(participantTurnPauseMs("Finance and inventory", "Qualification")).toBe(3_200);
    expect(participantTurnPauseMs("We use SharePoint, but", "Qualification")).toBe(4_200);
  });

  it("commits substantial complete answers without a fixed five-second delay", () => {
    expect(
      participantTurnPauseMs(
        "We have 230 users across Mumbai and Pune with Teams and Outlook integrations",
        "Qualification",
      ),
    ).toBe(1_800);
  });
});

describe("BrowserCallSession", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("re-arms speech recognition after every agent response", () => {
    vi.useFakeTimers();
    const recognitions: FakeRecognition[] = [];
    const sockets: FakeWebSocket[] = [];

    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onstart: (() => void) | null = null;
      onspeechstart: (() => void) | null = null;
      onspeechend: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn(() => this.onstart?.());
      stop = vi.fn();
      abort = vi.fn();

      constructor() {
        recognitions.push(this);
      }
    }

    class FakeWebSocket {
      static OPEN = 1;
      readyState = FakeWebSocket.OPEN;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      send = vi.fn();
      close = vi.fn();

      constructor() {
        sockets.push(this);
      }
    }

    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: FakeRecognition,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speaking: false,
        cancel: vi.fn(),
        speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
          utterance.onstart?.({} as SpeechSynthesisEvent);
          utterance.onend?.({} as SpeechSynthesisEvent);
        }),
      },
    });
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        pitch = 1;
        onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
        onend: ((event: SpeechSynthesisEvent) => void) | null = null;
        onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

        constructor(public text: string) {}
      },
    );

    render(<BrowserCallSession callId="call-1" maxDuration={300} />);
    fireEvent.click(screen.getByRole("button", { name: "Start AI call" }));

    act(() => {
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          event: "agent.response",
          text: "Which ERP workloads are in scope?",
          conversation_state: "Qualification",
        }),
      } as MessageEvent);
    });

    expect(screen.getByText("Which ERP workloads are in scope?")).toBeInTheDocument();
    expect(recognitions).toHaveLength(1);
    expect(recognitions[0]?.continuous).toBe(true);

    act(() => {
      recognitions[0]?.onspeechstart?.();
      recognitions[0]?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "Finance and inventory" } }],
      });
      recognitions[0]?.onspeechend?.();
      vi.advanceTimersByTime(3_000);
    });

    expect(sockets[0]?.send).not.toHaveBeenCalledWith(
      expect.stringContaining('"event":"transcript.final"'),
    );

    act(() => {
      recognitions[0]?.onspeechstart?.();
      recognitions[0]?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "across three locations" } }],
      });
      recognitions[0]?.onspeechend?.();
      vi.advanceTimersByTime(2_400);
    });

    expect(sockets[0]?.send).toHaveBeenCalledWith(
      expect.stringContaining(
        '"text":"Finance and inventory across three locations"',
      ),
    );

    act(() => {
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          event: "agent.response",
          text: "What deadline is driving the migration?",
          conversation_state: "Qualification",
        }),
      } as MessageEvent);
    });

    expect(screen.getByText("What deadline is driving the migration?")).toBeInTheDocument();
    expect(recognitions).toHaveLength(2);
    expect(recognitions[0]?.abort).toHaveBeenCalledOnce();
    expect(recognitions[1]?.start).toHaveBeenCalledOnce();

    act(() => {
      recognitions[1]?.onerror?.({ error: "network" });
      vi.advanceTimersByTime(650);
    });

    expect(recognitions).toHaveLength(3);
    expect(screen.getByText("Browser speech service interrupted — retrying (1/2)…")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10_000));

    expect(sockets[0]?.send).toHaveBeenCalledWith(JSON.stringify({ event: "silence" }));
    expect(screen.getByText("No response detected — checking if you are still there…")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "thinking" })).toBeInTheDocument();
  });
});
