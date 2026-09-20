/**
 * Canonical CuePilot domain types — transcribed from PS5-CuePilot-Master-Report.md §12.
 *
 * All timestamps are UTC ISO-8601 strings ending in "Z".
 * Scheduling integers are MINUTES RELATIVE TO `startsAt`, never local clock strings.
 * `hardEndMin: 60` means one hour after event start.
 */

export type UUID = string;
export type ISODate = string;
export type Language = 'en' | 'hi' | 'gu';
export type Role = 'owner' | 'anchor';
export type FactId = string; // organizer UUID or reserved event/speaker fact ID

export type Fact = { id: FactId; text: string };

export type Speaker = {
  id: UUID;
  displayName: string;
  pronunciationHint: string; // optional content represented as ""
  /** Owner-only contact data. Omitted from anchor-facing published snapshots. */
  phoneE164?: string | undefined;
  facts: Fact[]; // only facts the organizer approved
};

export type Cue = {
  id: UUID;
  order: number; // unique, contiguous 0..n-1
  title: string;
  speakerId: UUID | null;
  preferredDurationMin: number;
  minDurationMin: number;
  compressionPenalty: number;
  bufferBeforeMin: number;
  notBeforeMin: number | null;
  fixedStartMin: number | null;
  plannedStartMin: number;
  plannedEndMin: number;
  status: 'pending' | 'active' | 'completed';
  actualStartAt: ISODate | null;
  actualEndAt: ISODate | null;
  /**
   * EXTENSION to §12: which clock produced `actualStartAt` / `actualEndAt`.
   *
   * §12 permits actual times to come from "the server clock or labeled rehearsal clock",
   * and the runbook and audit view must never present a scenario timestamp as a real
   * observation. The source is currently derivable from `EventState.mode`, but recording it
   * per cue keeps a rehearsal timestamp self-describing wherever it travels.
   */
  actualTimeSource: 'rehearsal_clock' | 'server_clock' | null;
};

export type ScriptKind = 'opening' | 'introduction' | 'transition' | 'closing' | 'announcement';

export type ApprovedScript = {
  id: UUID;
  cueId: UUID | null;
  kind: ScriptKind;
  language: Language;
  body: string;
  usedFactIds: FactId[];
  source: 'gemini' | 'template' | 'manual';
  model: string | null;
  promptVersion: string;
  inputHash: string;
  approvedBy: string;
  approvedAt: ISODate;
};

export type Announcement = {
  id: UUID;
  text: string;
  language: Language;
  publishedAt: ISODate;
  dismissedAt: ISODate | null;
};

export type EventState = {
  id: UUID;
  ownerUid: string;
  name: string;
  timezone: 'Asia/Kolkata';
  startsAt: ISODate;
  hardEndMin: number;
  mode: 'rehearsal' | 'live';
  phase: 'draft' | 'running' | 'ended';
  revision: number;
  scenarioNowAt: ISODate | null; // required in rehearsal; forbidden in live
  currentCueId: UUID | null;
  activeForecastEndMin: number | null;
  scheduleHealth: 'valid' | 'needs_repair';
  /**
   * EXTENSION to §12: which seed produced this event, if any.
   *
   * Server-owned metadata, not an organizer fact, so `PUT /draft` can never set it and a
   * draft edit cannot erase it. It is what the labeled "Load rehearsal at keynote" action
   * keys off, so an organizer cannot fake a seeded scenario and a real one survives edits.
   */
  demoSeed: 'college-demo-v1' | null;
  eventFacts: Fact[];
  speakers: Speaker[];
  cues: Cue[];
  approvedScripts: ApprovedScript[];
  announcements: Announcement[];
  createdAt: ISODate;
  updatedAt: ISODate;
  expiresAt: ISODate; // demonstration data: 72 hours
};

export type RepairInput = {
  expectedRevision: number;
  activeForecastEndMin: number | null; // null when there is no active cue
  releaseUpdates: { cueId: UUID; notBeforeMin: number }[];
};

export type RepairResult = {
  feasible: boolean;
  baseRevision: number;
  ruleVersion: 'fixed-order-v1';
  changes: {
    cueId: UUID;
    oldStartMin: number;
    oldEndMin: number;
    newStartMin: number;
    newEndMin: number;
  }[];
  schedule: { cueId: UUID; startMin: number; endMin: number }[];
  recoveredMin: number;
  weightedShorteningCost: number | null;
  projectedFinishMin: number | null;
  constraintChecks: { rule: string; cueId: UUID | null; passed: boolean }[];
  failure: null | {
    rule: 'fixed_start' | 'hard_end';
    cueId: UUID | null;
    earliestMin: number;
    limitMin: number;
    shortageMin: number;
  };
};

/** Convenience aliases over the §12 inline shapes. */
export type ScheduleInterval = RepairResult['schedule'][number];
export type ScheduleChange = RepairResult['changes'][number];
export type ConstraintCheck = RepairResult['constraintChecks'][number];
export type RepairFailure = NonNullable<RepairResult['failure']>;
