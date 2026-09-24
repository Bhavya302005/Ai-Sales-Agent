import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoiceLab } from "./voice-lab";

describe("VoiceLab browser fallback", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("completes a one-turn browser speech round trip without Sarvam", () => {
    const recognitionInstances: FakeRecognition[] = [];
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onspeechend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn(() => this.onstart?.());
      stop = vi.fn();
      abort = vi.fn();

      constructor() {
        recognitionInstances.push(this);
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: FakeRecognition,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
          utterance.onstart?.({} as SpeechSynthesisEvent);
          utterance.onend?.({} as SpeechSynthesisEvent);
        }),
      },
    });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        text: string;
        onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
        onend: ((event: SpeechSynthesisEvent) => void) | null = null;
        onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

        constructor(text: string) {
          this.text = text;
        }
      },
    );

    render(<VoiceLab />);
    expect(screen.getByText("Browser fallback — no Sarvam credits")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start one-turn test" }));
    expect(screen.getByText("Listening in English — speak now")).toBeInTheDocument();

    const recognition = recognitionInstances[0];
    act(() => {
      if (!recognition) throw new Error("recognition was not created");
      recognition.onspeechend?.();
      recognition.onresult?.({
        resultIndex: 0,
        results: [{ 0: { transcript: "I need a sales assistant" }, isFinal: true }],
      });
    });

    expect(screen.getByText("I need a sales assistant")).toBeInTheDocument();
    expect(screen.getByText("Browser round trip complete")).toBeInTheDocument();
    expect(window.speechSynthesis.speak).toHaveBeenCalledOnce();
  });
});
