import type { DraftCueInputBody } from "./api";

/** Name of the server-seeded `college-demo-v1` scenario. Must match the committed fixture. */
export const FIXTURE_EVENT_NAME =
  "Sahyadri Institute TechFest 2026 — Inaugural Session";

export const FIXTURE_CUES: DraftCueInputBody[] = [
  {
    id: "opening",
    order: 0,
    title: "Opening remarks",
    speakerId: null,
    preferredDurationMin: 5,
    minDurationMin: 5,
    compressionPenalty: 1,
    bufferBeforeMin: 0,
    notBeforeMin: null,
    fixedStartMin: null,
  },
  {
    id: "keynote",
    order: 1,
    title: "Keynote",
    speakerId: "spk-mehta",
    preferredDurationMin: 20,
    minDurationMin: 20,
    compressionPenalty: 1,
    bufferBeforeMin: 0,
    notBeforeMin: null,
    fixedStartMin: null,
  },
  {
    id: "qa",
    order: 2,
    title: "Audience Q&A",
    speakerId: "spk-mehta",
    preferredDurationMin: 10,
    minDurationMin: 4,
    compressionPenalty: 3,
    bufferBeforeMin: 0,
    notBeforeMin: null,
    fixedStartMin: null,
  },
  {
    id: "community",
    order: 3,
    title: "Community interaction",
    speakerId: "spk-rao",
    preferredDurationMin: 10,
    minDurationMin: 4,
    compressionPenalty: 1,
    bufferBeforeMin: 0,
    notBeforeMin: null,
    fixedStartMin: null,
  },
  {
    id: "sponsor",
    order: 4,
    title: "Sponsor address",
    speakerId: "spk-fernandes",
    preferredDurationMin: 10,
    minDurationMin: 10,
    compressionPenalty: 1,
    bufferBeforeMin: 0,
    notBeforeMin: null,
    fixedStartMin: 45,
  },
  {
    id: "closing",
    order: 5,
    title: "Closing and vote of thanks",
    speakerId: null,
    preferredDurationMin: 5,
    minDurationMin: 5,
    compressionPenalty: 1,
    bufferBeforeMin: 0,
    notBeforeMin: null,
    fixedStartMin: null,
  },
];

export const FIXTURE_SPEAKERS = [
  {
    id: "spk-mehta",
    displayName: "Dr. Ananya Mehta",
    pronunciationHint: "uh-NAHN-yuh MEH-tah",
    factText:
      "Fictional: heads the Applied Systems Lab at a fictional institute.",
  },
  {
    id: "spk-rao",
    displayName: "Vikram Rao",
    pronunciationHint: "VIK-ram RAO",
    factText: "Fictional: final-year student and TechFest community lead.",
  },
  {
    id: "spk-fernandes",
    displayName: "Priya Fernandes",
    pronunciationHint: "PREE-yah fer-NAN-dez",
    factText: "Fictional: represents the fictional sponsor Northwind Labs.",
  },
];
