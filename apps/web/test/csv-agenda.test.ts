import { describe, expect, it } from "vitest";
import type { Speaker } from "@cuepilot/domain";
import {
  agendaCsvTemplate,
  importAgendaCsv,
  parseCsv,
} from "../src/lib/csvAgenda";
import { FIXTURE_CUES, FIXTURE_SPEAKERS } from "../src/lib/fixture";

const speakers: Speaker[] = FIXTURE_SPEAKERS.map((speaker) => ({
  id: speaker.id,
  displayName: speaker.displayName,
  pronunciationHint: speaker.pronunciationHint,
  facts: [],
}));

const HEADER =
  "title,speaker,preferred_duration_min,min_duration_min,compression_penalty,buffer_before_min,available_from_min,fixed_start_min";

describe("CSV parsing", () => {
  it("handles quotes, commas, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv(
      '\uFEFFtitle,note\r\n"Panel, part 2","He said ""hello"""\r\nClosing,quiet\r\n',
    );
    expect(rows).toEqual([
      ["title", "note"],
      ["Panel, part 2", 'He said "hello"'],
      ["Closing", "quiet"],
    ]);
  });

  it("keeps line breaks inside quoted fields and ignores a trailing newline", () => {
    const rows = parseCsv('a,b\n"line one\nline two",x\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["line one\nline two", "x"],
    ]);
  });
});

describe("agenda template", () => {
  it("round-trips the committed rehearsal scenario", () => {
    const result = importAgendaCsv(agendaCsvTemplate(), speakers, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cues.map((cue) => cue.title)).toEqual(
      FIXTURE_CUES.map((cue) => cue.title),
    );
    expect(result.cues.map((cue) => cue.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(result.cues.map((cue) => cue.id)).size).toBe(6);
    // Names resolve to the fixture speakers, so no speaker is invented.
    expect(result.newSpeakers).toEqual([]);
    const keynote = result.cues.find((cue) => cue.title === "Keynote");
    expect(keynote?.speakerId).toBe("spk-mehta");
    const sponsor = result.cues.find((cue) => cue.title === "Sponsor address");
    expect(sponsor?.fixedStartMin).toBe(45);
    expect(sponsor?.notBeforeMin).toBeNull();
  });
});

describe("agenda import validation", () => {
  it("matches existing speakers case-insensitively", () => {
    const result = importAgendaCsv(
      `${HEADER}\nWelcome,"  dr. ananya MEHTA  ",5,5,1,0,,\n`,
      speakers,
      0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cues[0]?.speakerId).toBe("spk-mehta");
    expect(result.newSpeakers).toEqual([]);
  });

  it("creates a speaker named in the CSV without inventing facts", () => {
    const result = importAgendaCsv(
      `${HEADER}\nGuest talk,New Person,10,5,1,0,,\n`,
      speakers,
      3,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cues[0]?.order).toBe(3);
    expect(result.newSpeakers).toHaveLength(1);
    expect(result.newSpeakers[0]?.displayName).toBe("New Person");
    expect(result.newSpeakers[0]?.facts).toEqual([]);
    expect(result.warnings.join(" ")).toContain("without approved facts");
  });

  it("reports missing columns, duplicate columns and unknown columns", () => {
    const missing = importAgendaCsv("title,speaker\nOpening,\n", speakers, 0);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors[0]).toContain("preferred_duration_min");

    const duplicate = importAgendaCsv(`${HEADER},TITLE\n`, speakers, 0);
    expect(duplicate.ok).toBe(false);

    const extra = importAgendaCsv(
      `${HEADER},extra_note\nOpening,,5,5,1,0,,,hello\n`,
      speakers,
      0,
    );
    expect(extra.ok).toBe(true);
    if (extra.ok) expect(extra.warnings.join(" ")).toContain("extra_note");
  });

  it("fails the whole import on a bad row and says which row and why", () => {
    const result = importAgendaCsv(
      `${HEADER}\nOpening,,5,5,1,0,,\nKeynote,,twenty,20,1,0,,\n`,
      speakers,
      0,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("Row 2");
    expect(result.errors[0]).toContain("whole minutes");
  });

  it("refuses minimum greater than preferred and out-of-range values", () => {
    const inverted = importAgendaCsv(
      `${HEADER}\nOpening,,5,10,1,0,,\n`,
      speakers,
      0,
    );
    expect(inverted.ok).toBe(false);
    if (!inverted.ok) expect(inverted.errors[0]).toContain("minDurationMin");

    const huge = importAgendaCsv(
      `${HEADER}\nOpening,,90,5,1,0,,\n`,
      speakers,
      0,
    );
    expect(huge.ok).toBe(false);
  });

  it("refuses an import that would exceed the 20-cue limit", () => {
    const rows = Array.from(
      { length: 5 },
      (_, index) => `Cue ${index},,5,5,1,0,,`,
    ).join("\n");
    const result = importAgendaCsv(`${HEADER}\n${rows}\n`, speakers, 18);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("limit is 20");
  });

  it("rejects an empty file and a header with no data rows", () => {
    expect(importAgendaCsv("", speakers, 0).ok).toBe(false);
    const headerOnly = importAgendaCsv(`${HEADER}\n`, speakers, 0);
    expect(headerOnly.ok).toBe(false);
    if (!headerOnly.ok) expect(headerOnly.errors[0]).toContain("No data rows");
  });
});
