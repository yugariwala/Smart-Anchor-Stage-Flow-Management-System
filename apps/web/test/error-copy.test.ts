/**
 * Error copy is the only place a server message reaches a user's eyes, and the server
 * talks to itself in rule identifiers and schema paths. Every string below is a real
 * message produced by the API suite, so this fails if an internal concept starts leaking.
 */
import { describe, expect, it } from "vitest";
import { ApiCallError, errorCopy } from "../src/lib/api";

const fail = (code: string, message: string, currentRevision?: number) =>
  errorCopy(
    new ApiCallError(
      422,
      {
        error: {
          code,
          message,
          retryable: false,
          ...(currentRevision === undefined ? {} : { currentRevision }),
        },
      },
      "",
    ),
  );

/** Anything a person should never read, wherever it appears. */
const INTERNALS =
  /contiguous_order|minimum_durations|fixed_start|hard_end|not_before|candidate_covers_pending|completed_immutable|active_immutable|integer_minutes|active_forecast_after_now|Unrecognized key|Too big|Too small|cues\.\d|eventFacts\.\d|REVISION_CONFLICT|VALIDATION_FAILED/;

describe("no internal concept reaches the user", () => {
  const realMessages: [string, string][] = [
    [
      "VALIDATION_FAILED",
      "Cannot publish, rules violated: contiguous_order(qa)",
    ],
    [
      "VALIDATION_FAILED",
      "Invalid announcement: text Too big: expected string to have <=500 characters",
    ],
    [
      "VALIDATION_FAILED",
      "Invalid announcement: text Too small: expected string to have >=1 characters",
    ],
    ["VALIDATION_FAILED", 'Invalid draft: cues.0 Unrecognized key: "status"'],
    [
      "VALIDATION_FAILED",
      "Cannot publish: publication requires at least one cue",
    ],
    ["VALIDATION_FAILED", "No such cue."],
    ["REVISION_CONFLICT", "Conflict"],
    ["PROPOSAL_INFEASIBLE", "Infeasible"],
    ["WRONG_PHASE", "Repairs apply to a running event."],
  ];

  for (const [code, message] of realMessages) {
    it(`rewrites ${code}: ${message.slice(0, 44)}`, () => {
      const copy = fail(code, message, 8);
      expect(copy).not.toMatch(INTERNALS);
      expect(copy.length).toBeGreaterThan(0);
    });
  }
});

describe("the rewrite says what to do next", () => {
  it("names the broken rule in plain words", () => {
    expect(
      fail(
        "VALIDATION_FAILED",
        "Cannot publish, rules violated: contiguous_order(qa)",
      ),
    ).toBe(
      "This cannot be published because two sessions would overlap. Adjust the agenda and try again.",
    );
  });

  it("joins several broken rules", () => {
    const copy = fail(
      "VALIDATION_FAILED",
      "Cannot publish, rules violated: contiguous_order(qa), hard_end(closing)",
    );
    expect(copy).toContain("two sessions would overlap");
    expect(copy).toContain("run past its finish time");
  });

  it("keeps the real limit when text is too long", () => {
    expect(
      fail(
        "VALIDATION_FAILED",
        "Invalid announcement: text Too big: expected string to have <=500 characters",
      ),
    ).toBe("That text is too long — keep it under 500 characters.");
  });

  it("does not call an out-of-range number too-long text", () => {
    // Zod reuses "Too big" for strings and numbers; a clock field past the horizon hits
    // the numeric branch, and calling that "text is too long" would be nonsense.
    expect(
      fail(
        "VALIDATION_FAILED",
        "Invalid draft: cues.0.fixedStartMin Too big: expected number to be <=240",
      ),
    ).toBe("That number is too large — the maximum is 240.");
  });

  it("does not call an under-range number an empty field", () => {
    expect(
      fail(
        "VALIDATION_FAILED",
        "Invalid draft: cues.0.preferredDurationMin Too small: expected number to be >=1",
      ),
    ).toBe("That number is too small — the minimum is 1.");
  });

  it("tells an empty field what it needs", () => {
    expect(
      fail(
        "VALIDATION_FAILED",
        "Invalid announcement: text Too small: expected string to have >=1 characters",
      ),
    ).toBe("This cannot be left empty.");
  });

  it("turns a bare publication rule into an instruction", () => {
    expect(
      fail(
        "VALIDATION_FAILED",
        "Cannot publish: publication requires at least one cue",
      ),
    ).toBe("Add at least one session before publishing.");
  });

  it("leaves an already-plain server sentence alone", () => {
    const plain = "The scenario clock only moves forward.";
    expect(fail("VALIDATION_FAILED", plain)).toBe(plain);
  });

  it("offers the next action on a revision conflict", () => {
    const copy = fail("REVISION_CONFLICT", "Conflict", 8);
    expect(copy).toContain("version 8");
    expect(copy).toContain("Refresh");
  });
});
