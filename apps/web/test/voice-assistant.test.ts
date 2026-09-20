import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VoiceAssistant } from "../src/components/VoiceAssistant";
import {
  buildVoiceAnswer,
  detectVoiceIntent,
  voiceLanguage,
} from "../src/lib/voiceAssistant";
import { LocaleProvider, translate } from "../src/lib/i18n";

describe("read-only voice assistant", () => {
  it("recognizes supported questions in English, Hindi, and Gujarati", () => {
    expect(detectVoiceIntent("How long is the keynote?")).toBe("remaining");
    expect(detectVoiceIntent("अगला संकेत क्या है?")).toBe("next");
    expect(detectVoiceIntent("અત્યારે શું ચાલી રહ્યું છે? ")).toBe("current");
    expect(detectVoiceIntent("please improvise a joke")).toBe("unknown");
    expect(detectVoiceIntent("start the next cue")).toBe("unknown");
  });

  it("answers only from structured cue context", () => {
    const context = {
      currentTitle: "Keynote",
      nextTitle: "Panel",
      remainingMinutes: 7,
    };

    expect(
      buildVoiceAnswer("current", context, translate.bind(null, "en")),
    ).toBe("Current cue: Keynote.");
    expect(buildVoiceAnswer("next", context, translate.bind(null, "hi"))).toBe(
      "अगला: Panel।",
    );
    expect(
      buildVoiceAnswer("remaining", context, translate.bind(null, "gu")),
    ).toBe("Keynoteમાં 7 મિનિટ બાકી છે.");
  });

  it("handles gaps and overdue cues without inventing timing", () => {
    expect(
      buildVoiceAnswer(
        "remaining",
        { currentTitle: null, nextTitle: "Closing", remainingMinutes: null },
        translate.bind(null, "en"),
      ),
    ).toBe("There is no active cue to time.");
    expect(
      buildVoiceAnswer(
        "remaining",
        { currentTitle: "Keynote", nextTitle: null, remainingMinutes: -3 },
        translate.bind(null, "en"),
      ),
    ).toBe("Keynote is 3 minutes past its forecast end.");
  });

  it("uses regional browser speech locales", () => {
    expect(voiceLanguage("en")).toBe("en-IN");
    expect(voiceLanguage("hi")).toBe("hi-IN");
    expect(voiceLanguage("gu")).toBe("gu-IN");
  });

  it("keeps the visual runbook usable when speech recognition is unavailable", () => {
    localStorage.clear();
    render(
      createElement(
        LocaleProvider,
        null,
        createElement(VoiceAssistant, {
          context: {
            currentTitle: "Keynote",
            nextTitle: "Panel",
            remainingMinutes: 7,
          },
          enabled: true,
        }),
      ),
    );

    expect(screen.getByRole("button", { name: "Ask CuePilot" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByText("Voice input is not supported in this browser."),
    ).toBeTruthy();
  });
});
