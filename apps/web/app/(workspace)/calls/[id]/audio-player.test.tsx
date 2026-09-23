import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioPlayer } from "./audio-player";

describe("AudioPlayer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders with initial duration formatted properly", () => {
    render(
      <AudioPlayer
        callId="e5f4a8c4-5d62-4b90-8360-e62440d1a367"
        initialDuration={41}
        summaryText="Technova Solutions migration project."
      />
    );

    expect(screen.getByText("Call Recording Playback")).toBeDefined();
    expect(screen.getByText("00:00")).toBeDefined();
    expect(screen.getByText("00:41")).toBeDefined();
    expect(screen.getByText("Listen to Summary")).toBeDefined();
    expect(screen.getByText("Download")).toBeDefined();
    expect(screen.getByRole("button", { name: "Play audio" })).toBeDefined();
  });

  it("cycles playback rate when speed button is clicked", () => {
    render(
      <AudioPlayer
        callId="e5f4a8c4-5d62-4b90-8360-e62440d1a367"
        initialDuration={41}
      />
    );

    const speedBtn = screen.getByTitle("Toggle playback speed");
    expect(speedBtn.textContent).toBe("1x");

    fireEvent.click(speedBtn);
    expect(speedBtn.textContent).toBe("1.25x");

    fireEvent.click(speedBtn);
    expect(speedBtn.textContent).toBe("1.5x");

    fireEvent.click(speedBtn);
    expect(speedBtn.textContent).toBe("2x");

    fireEvent.click(speedBtn);
    expect(speedBtn.textContent).toBe("1x");
  });

  it("toggles speech summary when speech synthesis is available", () => {
    const mockSpeak = vi.fn();
    const mockCancel = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speak: mockSpeak,
        cancel: mockCancel,
      },
      writable: true,
    });
    class MockUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    // @ts-expect-error Mock class in test
    globalThis.SpeechSynthesisUtterance = MockUtterance;
    // @ts-expect-error Mock class in test
    window.SpeechSynthesisUtterance = MockUtterance;

    render(
      <AudioPlayer
        callId="e5f4a8c4-5d62-4b90-8360-e62440d1a367"
        initialDuration={41}
        summaryText="Technova Solutions migration project."
      />
    );

    const summaryBtn = screen.getByTitle("Read AI Call Summary aloud");
    fireEvent.click(summaryBtn);

    expect(mockSpeak).toHaveBeenCalled();
    expect(summaryBtn.textContent).toContain("Stop Summary");

    fireEvent.click(summaryBtn);
    expect(mockCancel).toHaveBeenCalled();
    expect(summaryBtn.textContent).toContain("Listen to Summary");
  });
});
