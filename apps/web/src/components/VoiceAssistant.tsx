import { useEffect, useRef, useState } from "react";

import { useI18n } from "../lib/i18n";
import {
  buildVoiceAnswer,
  detectVoiceIntent,
  voiceLanguage,
  type VoiceContext,
} from "../lib/voiceAssistant";

type RecognitionResultEvent = Event & {
  results: {
    readonly [index: number]:
      | {
          readonly [index: number]: { readonly transcript: string } | undefined;
        }
      | undefined;
  };
};

type RecognitionErrorEvent = Event & { error?: string };

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => BrowserRecognition;

const recognitionConstructor = (): RecognitionConstructor | undefined => {
  const browser = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
};

export function VoiceAssistant({
  context,
  enabled,
}: {
  context: VoiceContext;
  enabled: boolean;
}) {
  const { locale, t } = useI18n();
  const recognition = useRef<BrowserRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const supported = recognitionConstructor() !== undefined;

  useEffect(
    () => () => {
      recognition.current?.stop();
    },
    [],
  );

  const speak = (copy: string): void => {
    if (
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    )
      return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(copy);
    utterance.lang = voiceLanguage(locale);
    window.speechSynthesis.speak(utterance);
  };

  const listen = (): void => {
    const Constructor = recognitionConstructor();
    if (Constructor === undefined) return;

    setError("");
    setTranscript("");
    setAnswer("");

    const nextRecognition = new Constructor();
    recognition.current = nextRecognition;
    nextRecognition.lang = voiceLanguage(locale);
    nextRecognition.continuous = false;
    nextRecognition.interimResults = false;
    nextRecognition.onresult = (event) => {
      const heard = event.results[0]?.[0]?.transcript.trim() ?? "";
      if (heard === "") {
        setError(t("I couldn’t hear that. Try again."));
        return;
      }
      const reply = buildVoiceAnswer(detectVoiceIntent(heard), context, t);
      setTranscript(heard);
      setAnswer(reply);
      speak(reply);
    };
    nextRecognition.onerror = (event) => {
      if (event.error !== "aborted")
        setError(t("I couldn’t hear that. Try again."));
    };
    nextRecognition.onend = () => {
      recognition.current = null;
      setListening(false);
    };

    try {
      nextRecognition.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setListening(false);
      setError(t("Voice input could not start. Try again."));
    }
  };

  const unavailableCopy = !enabled
    ? t("Voice answers pause while the runbook is offline or stale.")
    : !supported
      ? t("Voice input is not supported in this browser.")
      : "";

  return (
    <section
      className="anchor-now voice-assistant no-print"
      aria-label={t("Voice assistant")}
    >
      <p className="anchor-label">{t("READ-ONLY VOICE ASSISTANT")}</p>
      <p className="small muted">
        {t(
          "Ask about the current cue, next cue, or time remaining. Voice cannot change the runbook.",
        )}
      </p>
      <button
        type="button"
        className="primary"
        onClick={listen}
        disabled={!enabled || !supported || listening}
      >
        {listening ? t("Listening…") : t("Ask CuePilot")}
      </button>
      {unavailableCopy === "" ? null : (
        <p className="small muted">{unavailableCopy}</p>
      )}
      {transcript === "" ? null : (
        <p className="small">
          <span className="muted">{t("You asked:")}</span> {transcript}
        </p>
      )}
      {answer === "" ? null : (
        <p className="voice-answer" aria-live="polite">
          {answer}
        </p>
      )}
      {error === "" ? null : (
        <p className="small error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
