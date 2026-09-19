/**
 * Deterministic fallback drafts (§17).
 *
 * These are NOT an AI success and must never be reported as one. The §11 label is fixed:
 * "Template fallback — AI unavailable." The event keeps operating when the provider is down,
 * which is the whole point — but the README, the UI and the measurements all have to say
 * plainly that this path produced the words.
 *
 * Pure and offline: same inputs, same output. No times appear in any template, for the same
 * reason the model is forbidden from writing them.
 */

import type { Language, ScriptKind } from '@cuepilot/domain';

import type { ScriptEnvelope } from './prompt';

export const TEMPLATE_FALLBACK_LABEL = 'Template fallback — AI unavailable.';

type Phrases = {
  welcome: (eventName: string) => string;
  introducing: (speaker: string) => string;
  transition: string;
  closing: (eventName: string) => string;
  announcement: string;
  reviewNeeded: string;
  noSpeaker: string;
};

/**
 * Static labels only, and only in languages a reviewer can check. §20: translated labels are
 * included only where they have been manually reviewed, and Hindi/Gujarati output must be
 * marked "generated; language quality unverified" rather than claimed as reviewed.
 */
const PHRASES: Record<Language, Phrases> = {
  en: {
    welcome: (e) => `Good morning, everyone, and welcome to ${e}.`,
    introducing: (s) => `Please join me in welcoming ${s}.`,
    transition: 'Thank you. We now move to the next part of our programme.',
    closing: (e) => `That brings us to the end of ${e}. Thank you all for joining us.`,
    announcement: 'We have a short announcement for everyone present.',
    reviewNeeded: 'Template draft: review and edit before use.',
    noSpeaker: 'Please welcome our next speaker.',
  },
  hi: {
    welcome: (e) => `सभी का स्वागत है, ${e} में।`,
    introducing: (s) => `कृपया ${s} का स्वागत कीजिए।`,
    transition: 'धन्यवाद। अब हम कार्यक्रम के अगले भाग की ओर बढ़ते हैं।',
    closing: (e) => `यहीं ${e} समाप्त होता है। सभी का धन्यवाद।`,
    announcement: 'उपस्थित सभी के लिए एक सूचना है।',
    reviewNeeded: 'टेम्पलेट ड्राफ्ट: उपयोग से पहले समीक्षा करें।',
    noSpeaker: 'कृपया अगले वक्ता का स्वागत कीजिए।',
  },
  gu: {
    welcome: (e) => `${e} માં આપનું સ્વાગત છે.`,
    introducing: (s) => `કૃપા કરીને ${s} નું સ્વાગત કરો.`,
    transition: 'આભાર. હવે આપણે કાર્યક્રમના આગલા ભાગ તરફ આગળ વધીએ છીએ.',
    closing: (e) => `આ સાથે ${e} પૂર્ણ થાય છે. સૌ કોઈનો આભાર.`,
    announcement: 'હાજર સૌ કોઈ માટે એક જાહેરાત છે.',
    reviewNeeded: 'ટેમ્પલેટ ડ્રાફ્ટ: વપરાશ પહેલાં સમીક્ષા કરો.',
    noSpeaker: 'કૃપા કરીને આગલા વક્તાનું સ્વાગત કરો.',
  },
};

export type TemplateDraft = {
  body: string;
  usedFactIds: string[];
  warnings: string[];
};

const findFact = (envelope: ScriptEnvelope, prefix: string): { id: string; text: string } | null =>
  envelope.approvedFacts.find((f) => f.id.startsWith(prefix)) ?? null;

/**
 * Builds a draft from approved facts only, exactly as the model is required to. Returns the
 * fact ids actually used, so the review panel can show sources for a template just as it does
 * for a generated draft.
 */
export function templateDraft(envelope: ScriptEnvelope): TemplateDraft {
  const phrases = PHRASES[envelope.language];
  const eventFact = findFact(envelope, 'event:name');
  const speakerFact = findFact(envelope, 'speaker:');
  const eventName = eventFact?.text ?? 'this event';
  const usedFactIds: string[] = [];
  if (eventFact !== null) usedFactIds.push(eventFact.id);

  const warnings: string[] = [phrases.reviewNeeded];
  let body: string;

  switch (envelope.kind) {
    case 'opening':
      body = `${phrases.welcome(eventName)}`;
      break;
    case 'introduction':
      if (speakerFact === null) {
        body = phrases.noSpeaker;
        warnings.push('No approved speaker record was available, so no name is used.');
      } else {
        body = phrases.introducing(speakerFact.text);
        usedFactIds.push(speakerFact.id);
      }
      break;
    case 'transition':
      body = phrases.transition;
      break;
    case 'closing':
      body = phrases.closing(eventName);
      break;
    case 'announcement':
      body = phrases.announcement;
      break;
  }

  if (envelope.language !== 'en') {
    // §18: without a qualified reviewer this must not be claimed as quality-checked.
    warnings.push('generated; language quality unverified');
  }

  return { body, usedFactIds, warnings };
}
