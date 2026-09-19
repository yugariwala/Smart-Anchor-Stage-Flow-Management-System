/**
 * Agenda CSV import (§8 SHOULD-HAVE: "CSV import with a provided template").
 *
 * Strictly an EDITING aid for the setup screen. It parses a file into draft cue INPUT and
 * hands it to the same `PUT /draft` path as the manual editor - the server still validates
 * and computes every interval, so this module never schedules anything.
 *
 * The provided template (downloadable from the import modal) uses the committed rehearsal
 * scenario as its example so one story runs through the fixture, the template and the demo.
 */

import { draftCueInputSchema, type Speaker } from "@cuepilot/domain";

import type { DraftCueInputBody } from "./api";
import { FIXTURE_CUES, FIXTURE_SPEAKERS } from "./fixture";

export const MAX_CUES = 20;

/** Template columns, in order. Header matching is case-insensitive and trimmed. */
export const AGENDA_CSV_COLUMNS = [
  "title",
  "speaker",
  "preferred_duration_min",
  "min_duration_min",
  "compression_penalty",
  "buffer_before_min",
  "available_from_min",
  "fixed_start_min",
] as const;

const COLUMN_SET = new Set<string>(AGENDA_CSV_COLUMNS);
const REQUIRED_COLUMNS = ["title", "preferred_duration_min", "min_duration_min"];

/** RFC-4180-ish: quoted fields may contain commas, quotes ("") and line breaks. */
export const parseCsv = (text: string): string[][] => {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // A trailing newline must not fabricate a final row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const escapeCsv = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** The downloadable template, generated from the shared fixture so it cannot drift. */
export const agendaCsvTemplate = (): string => {
  const speakerName = (id: string | null): string =>
    FIXTURE_SPEAKERS.find((s) => s.id === id)?.displayName ?? "";
  const lines = [
    AGENDA_CSV_COLUMNS.join(","),
    ...FIXTURE_CUES.map((cue) =>
      [
        cue.title,
        speakerName(cue.speakerId),
        String(cue.preferredDurationMin),
        String(cue.minDurationMin),
        String(cue.compressionPenalty),
        String(cue.bufferBeforeMin),
        cue.notBeforeMin === null ? "" : String(cue.notBeforeMin),
        cue.fixedStartMin === null ? "" : String(cue.fixedStartMin),
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
};

export type AgendaImport =
  | {
      ok: true;
      cues: DraftCueInputBody[];
      /** Speakers named in the CSV that were not already in the draft. */
      newSpeakers: Speaker[];
      warnings: string[];
    }
  | { ok: false; errors: string[] };

const parseInteger = (raw: string): number | null =>
  /^-?\d+$/.test(raw) ? Number(raw) : null;

const columnIndex = (header: readonly string[]): Map<string, number> => {
  const index = new Map<string, number>();
  header.forEach((name, position) => {
    const key = name.toLowerCase();
    if (key.length > 0 && !index.has(key)) index.set(key, position);
  });
  return index;
};

/**
 * Maps a CSV file onto draft cues. Every row is checked with the SAME schema the manual
 * editor uses, so an import can never smuggle a value the editor would refuse.
 */
export const importAgendaCsv = (
  text: string,
  existingSpeakers: readonly Speaker[],
  existingCueCount: number,
): AgendaImport => {
  const rows = parseCsv(text).map((cells) => cells.map((cell) => cell.trim()));
  const header = rows[0];
  if (header === undefined || header.every((cell) => cell.length === 0)) {
    return { ok: false, errors: ["The file is empty. Download the template and add rows."] };
  }
  const index = columnIndex(header);
  const duplicate = header
    .map((name) => name.toLowerCase())
    .filter((name, position, all) => name.length > 0 && all.indexOf(name) !== position);
  if (duplicate.length > 0) {
    return { ok: false, errors: [`Duplicate column: ${duplicate[0]}.`] };
  }
  const missing = REQUIRED_COLUMNS.filter((column) => !index.has(column));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [`Missing required columns: ${missing.join(", ")}. Download the template.`],
    };
  }

  // The aggregate limit is checked BEFORE row validation, so an over-long file gets the
  // clear limit message instead of a per-row schema error about the order column.
  const dataRows = rows
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.length > 0));
  if (existingCueCount + dataRows.length > MAX_CUES) {
    return {
      ok: false,
      errors: [
        `Importing ${dataRows.length} cues would make ${existingCueCount + dataRows.length}; the limit is ${MAX_CUES}.`,
      ],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const cues: DraftCueInputBody[] = [];
  const speakerIds = new Map<string, string>(
    existingSpeakers.map((speaker) => [speaker.displayName.toLowerCase(), speaker.id]),
  );
  const newSpeakers: Speaker[] = [];

  rows.slice(1).forEach((cells, position) => {
    const rowNumber = position + 1;
    if (cells.every((cell) => cell.length === 0)) return;
    const cell = (column: string): string => cells[index.get(column) ?? -1] ?? "";
    const title = cell("title");
    if (title.length === 0) {
      errors.push(`Row ${rowNumber}: title is required.`);
      return;
    }

    const preferred = parseInteger(cell("preferred_duration_min"));
    const minimum = parseInteger(cell("min_duration_min"));
    if (preferred === null || minimum === null) {
      errors.push(`Row ${rowNumber} (${title}): durations must be whole minutes.`);
      return;
    }

    const optionalInteger = (
      column: string,
      fallback: number | null,
    ): { value: number | null; valid: boolean } => {
      const raw = cell(column);
      if (raw.length === 0) return { value: fallback, valid: true };
      const parsed = parseInteger(raw);
      if (parsed === null) {
        errors.push(`Row ${rowNumber} (${title}): ${column} must be a whole minute or empty.`);
        return { value: null, valid: false };
      }
      return { value: parsed, valid: true };
    };
    const penalty = optionalInteger("compression_penalty", 1);
    const buffer = optionalInteger("buffer_before_min", 0);
    const availableFrom = optionalInteger("available_from_min", null);
    const fixedStart = optionalInteger("fixed_start_min", null);
    if (
      !penalty.valid ||
      !buffer.valid ||
      !availableFrom.valid ||
      !fixedStart.valid
    ) {
      return;
    }

    const speakerName = cell("speaker");
    let speakerId: string | null = null;
    if (speakerName.length > 0) {
      const found = speakerIds.get(speakerName.toLowerCase());
      if (found !== undefined) {
        speakerId = found;
      } else {
        speakerId = crypto.randomUUID();
        speakerIds.set(speakerName.toLowerCase(), speakerId);
        // No facts are invented here: the organizer adds approved facts in the Speakers tab.
        newSpeakers.push({
          id: speakerId,
          displayName: speakerName,
          pronunciationHint: "",
          facts: [],
        });
      }
    }

    const candidate: DraftCueInputBody = {
      id: crypto.randomUUID(),
      order: existingCueCount + cues.length,
      title,
      speakerId,
      preferredDurationMin: preferred,
      minDurationMin: minimum,
      compressionPenalty: penalty.value ?? 1,
      bufferBeforeMin: buffer.value ?? 0,
      notBeforeMin: availableFrom.value,
      fixedStartMin: fixedStart.value,
    };
    const check = draftCueInputSchema.safeParse(candidate);
    if (!check.success) {
      errors.push(
        `Row ${rowNumber} (${title}): ${check.error.issues[0]?.message ?? "invalid values"}.`,
      );
      return;
    }
    cues.push(candidate);
  });

  if (errors.length > 0) return { ok: false, errors };
  if (cues.length === 0) {
    return { ok: false, errors: ["No data rows found after the header."] };
  }
  const unknownColumns = header.filter(
    (name) => name.length > 0 && !COLUMN_SET.has(name.toLowerCase()),
  );
  if (unknownColumns.length > 0) {
    warnings.push(`Ignored unknown columns: ${unknownColumns.join(", ")}.`);
  }
  if (newSpeakers.length > 0) {
    warnings.push(
      `${newSpeakers.length} new speaker${newSpeakers.length === 1 ? "" : "s"} added without approved facts. Add them before generating scripts.`,
    );
  }
  return { ok: true, cues, newSpeakers, warnings };
};
