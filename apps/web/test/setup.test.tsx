import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { afterEach, expect, it, vi } from "vitest";
import type { EventState } from "@cuepilot/domain";
import fixture from "../../../fixtures/college-demo-v1.json";
vi.mock("../src/lib/auth", () => ({ idToken: vi.fn() }));
vi.mock("../src/lib/api", async (original) => ({
  ...(await original<typeof import("../src/lib/api")>()),
  getEvent: vi.fn(),
  saveDraft: vi.fn(),
}));
import { getEvent, saveDraft } from "../src/lib/api";
import { SetupScreen } from "../src/screens/SetupScreen";
afterEach(cleanup);
it("preserves every existing speaker fact, fact ID and event fact when saving a draft", async () => {
  const state = { ...fixture, phase: "draft" } as EventState;
  vi.mocked(getEvent).mockResolvedValue({
    state,
    publishedRevision: null,
    serverNow: new Date().toISOString(),
    acknowledgments: [],
  });
  vi.mocked(saveDraft).mockResolvedValue(null);
  render(
    <Theme>
      <SetupScreen eventId={state.id} />
    </Theme>,
  );
  await screen.findByRole("heading", { name: "Event setup" });
  fireEvent.click(screen.getByRole("button", { name: "Save & review" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
  const body = vi.mocked(saveDraft).mock.calls[0]![1];
  expect(body.speakers).toEqual(state.speakers);
  expect(body.eventFacts).toEqual(state.eventFacts);
  expect(body.expectedRevision).toBe(state.revision);
});
