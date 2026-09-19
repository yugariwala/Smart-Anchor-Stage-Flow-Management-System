import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { EventState } from "@cuepilot/domain";
import fixture from "../../../fixtures/college-demo-v1.json";
import { ScriptReview } from "../src/components/ScriptReview";
import type { ScriptDraftResponse } from "../src/lib/api";
afterEach(cleanup);
const draft = (): ScriptDraftResponse => ({
  proposalId: "p1",
  baseRevision: 7,
  body: "Welcome to our fictional event.",
  usedFactIds: ["fact1"],
  warnings: [],
  source: "template",
  model: null,
  fallbackReason: "Test scenario",
  approvedFacts: [{ id: "fact1", text: "This is a fictional event." }],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
it("requires human review and resets it when the words change", () => {
  const approve = vi.fn();
  render(
    <ScriptReview
      state={fixture as EventState}
      draft={draft()}
      busy={false}
      message=""
      onApprove={approve}
      onDiscard={vi.fn()}
    />,
  );
  const button = screen.getByRole("button", {
    name: "Approve and publish copy",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(button.disabled).toBe(false);
  fireEvent.change(
    screen.getByLabelText("Draft copy (edit before approving if needed)"),
    { target: { value: "Changed copy" } },
  );
  expect(button.disabled).toBe(true);
  expect(approve).not.toHaveBeenCalled();
});
it.each(["expired", "missing source"])(
  "blocks approval of a draft with %s",
  (reason) => {
    const value = draft();
    if (reason === "expired")
      value.expiresAt = new Date(Date.now() - 1000).toISOString();
    else value.usedFactIds = ["missing"];
    render(
      <ScriptReview
        state={fixture as EventState}
        draft={value}
        busy={false}
        message=""
        onApprove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      (
        screen.getByRole("button", {
          name: "Approve and publish copy",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  },
);
