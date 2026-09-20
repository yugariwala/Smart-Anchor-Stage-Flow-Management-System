import type { UiLocale } from "./i18n";

export type VoiceIntent = "current" | "next" | "remaining" | "help" | "unknown";

export type VoiceContext = {
  currentTitle: string | null;
  nextTitle: string | null;
  remainingMinutes: number | null;
};

type Translate = (
  source: string,
  variables?: Record<string, string | number>,
) => string;

const hasAny = (text: string, phrases: readonly string[]): boolean =>
  phrases.some((phrase) => text.includes(phrase));

export const detectVoiceIntent = (transcript: string): VoiceIntent => {
  const text = transcript.toLocaleLowerCase().normalize("NFKC").trim();

  // Voice is intentionally read-only. Reject action wording before matching phrases such as
  // "next cue", so "start the next cue" can never be mistaken for a status question.
  if (
    hasAny(text, [
      "start",
      "begin",
      "complete",
      "finish",
      "skip",
      "publish",
      "repair",
      "शुरू",
      "प्रारंभ",
      "पूरा",
      "समाप्त",
      "छोड़",
      "प्रकाशित",
      "શરૂ",
      "ચાલુ",
      "પૂર્ણ",
      "સમાપ્ત",
      "છોડ",
      "પ્રકાશિત",
    ])
  )
    return "unknown";

  if (
    hasAny(text, [
      "how long",
      "time remaining",
      "minutes left",
      "remaining time",
      "कितना समय",
      "कितने मिनट",
      "समय बाकी",
      "કેટલી મિનિટ",
      "સમય બાકી",
      "કેટલો સમય",
    ])
  )
    return "remaining";

  if (
    hasAny(text, [
      "up next",
      "what is next",
      "what's next",
      "next cue",
      "अगला",
      "आगे क्या",
      "આગળ શું",
      "આગળનો",
      "પછી શું",
    ])
  )
    return "next";

  if (
    hasAny(text, [
      "current cue",
      "what is current",
      "what's current",
      "on stage",
      "happening now",
      "अभी क्या",
      "वर्तमान",
      "मंच पर",
      "અત્યારે શું",
      "હાલમાં",
      "મંચ પર",
    ])
  )
    return "current";

  if (
    hasAny(text, [
      "help",
      "what can i ask",
      "मदद",
      "क्या पूछ",
      "મદદ",
      "શું પૂછી",
    ])
  )
    return "help";

  return "unknown";
};

export const voiceLanguage = (locale: UiLocale): string =>
  ({ en: "en-IN", hi: "hi-IN", gu: "gu-IN" })[locale];

export const buildVoiceAnswer = (
  intent: VoiceIntent,
  context: VoiceContext,
  t: Translate,
): string => {
  if (intent === "current") {
    return context.currentTitle === null
      ? t("There is no active cue right now.")
      : t("Current cue: {cue}.", { cue: context.currentTitle });
  }

  if (intent === "next") {
    return context.nextTitle === null
      ? t("Nothing further is scheduled.")
      : t("Up next: {cue}.", { cue: context.nextTitle });
  }

  if (intent === "remaining") {
    if (context.currentTitle === null || context.remainingMinutes === null)
      return t("There is no active cue to time.");
    if (context.remainingMinutes > 0)
      return t("{minutes} minutes remain in {cue}.", {
        minutes: context.remainingMinutes,
        cue: context.currentTitle,
      });
    if (context.remainingMinutes === 0)
      return t("{cue} has reached its forecast end.", {
        cue: context.currentTitle,
      });
    return t("{cue} is {minutes} minutes past its forecast end.", {
      cue: context.currentTitle,
      minutes: Math.abs(context.remainingMinutes),
    });
  }

  return intent === "help"
    ? t("Ask what is current, what is next, or how much time remains.")
    : t(
        "I didn’t understand. Ask about the current cue, next cue, or time remaining.",
      );
};
