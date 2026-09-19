import { test, expect } from "@playwright/test";

// These tests use actual Firebase anonymous authentication and the existing local Worker.
// No API responses are intercepted or replaced. Run both servers before this suite.
test("complete organizer and anchor rehearsal, recovery, history, responsive layouts and deletion", async ({
  page,
  browser,
}) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your events", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "apps/web/test-results/workspace-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create event", exact: true })
    .first()
    .click();
  const create = page.getByRole("dialog", { name: "Create your event" });
  await expect(create).toBeVisible();
  await create.getByLabel("Event name").fill("Fictional frontend verification");
  await create
    .getByRole("button", { name: "Create event", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make room for a great event." }),
  ).toBeVisible();
  const match = page.url().match(/event\/([^/]+)\/setup/);
  expect(match).not.toBeNull();
  const eventId = match![1];
  await page
    .getByRole("button", { name: "Load scenario", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Load scenario", exact: true })
    .click();
  await expect(page.getByLabel("Cue title")).toHaveCount(6);
  await page.getByRole("button", { name: "Save & review" }).click();
  await expect(
    page.getByRole("heading", {
      name: "TechFest 2026 — Inaugural Session",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Validate and publish", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Publish the runbook?" })
    .getByRole("button", { name: "Validate and publish", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start Opening remarks", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Invite an anchor", exact: true })
    .click();
  const inviteDialog = page.getByRole("dialog", { name: "Invite your anchor" });
  const invitation = await inviteDialog.locator("p.mono").innerText();
  const anchorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const anchor = await anchorContext.newPage();
  await anchor.goto(invitation);
  await expect(
    anchor.getByRole("button", { name: /Acknowledge revision/ }),
  ).toBeEnabled();
  expect(anchor.url()).not.toContain("code=");
  await inviteDialog.getByRole("button", { name: "Close dialog" }).click();

  await page
    .getByRole("button", { name: "Start Opening remarks", exact: true })
    .click();
  await page.getByRole("button", { name: "+5 min", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete Opening remarks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start Keynote", exact: true })
    .click();
  await page.getByLabel("Delay in minutes").fill("19");
  await page
    .getByRole("button", { name: "Preview recovery plan", exact: true })
    .click();
  const repair = page.getByRole("dialog", { name: "Review the recovery plan" });
  await expect(repair.getByText(/short by 7 minutes/)).toBeVisible();
  await expect(
    repair.getByRole("button", { name: "Approve and publish" }),
  ).toBeDisabled();
  await repair.getByRole("button", { name: "Discard preview" }).click();
  await page.getByLabel("Delay in minutes").fill("12");
  await page
    .getByRole("button", { name: "Preview recovery plan", exact: true })
    .click();
  await expect(
    repair.getByRole("button", { name: "Approve and publish" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "apps/web/test-results/repair-desktop.png",
    fullPage: true,
  });
  await repair.getByRole("button", { name: "Approve and publish" }).click();
  await expect(repair).not.toBeVisible();
  await expect(anchor.getByText(/until 10:37/)).toBeVisible();
  await anchor.getByRole("button", { name: /Acknowledge revision/ }).click();
  await expect(
    anchor.getByRole("button", { name: /Acknowledged revision/ }),
  ).toBeDisabled();
  await page.screenshot({
    path: "apps/web/test-results/console-desktop.png",
    fullPage: true,
  });
  await anchor.screenshot({
    path: "apps/web/test-results/anchor-mobile.png",
    fullPage: true,
  });
  expect(
    await anchor.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  for (const [route, title] of [
    ["speakers", "The people behind your event"],
    ["scripts", "Give your host the right words."],
    ["announcements", "Keep everyone in the loop."],
    ["history", "Every change, accounted for."],
  ] as const) {
    await page.goto(`/#/event/${eventId}/${route}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: /View revision/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog" })
    .click();

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`/#/event/${eventId}/console`);
  await expect(
    page.getByRole("heading", {
      name: "TechFest 2026 — Inaugural Session",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "apps/web/test-results/console-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your events", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "apps/web/test-results/workspace-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Your workspace" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await anchorContext.setOffline(true);
  await expect(anchor.getByText(/Offline snapshot/)).toBeVisible({
    timeout: 25_000,
  });
  await expect(
    anchor.getByRole("button", { name: /Acknowledged revision/ }),
  ).toBeDisabled();
  await anchorContext.setOffline(false);
  await anchor.getByRole("button", { name: "Refresh runbook" }).click();
  await expect(anchor.getByText(/Offline snapshot/)).not.toBeVisible();
  await anchor.emulateMedia({ media: "print" });
  await expect(
    anchor.getByRole("heading", { name: "All approved host copy" }),
  ).toBeVisible();

  await page.goto(`/#/event/${eventId}/settings`);
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(
    page.getByRole("heading", { name: "Your events", exact: true }),
  ).toBeVisible();
  await anchor.emulateMedia({ media: "screen" });
  await anchor.getByRole("button", { name: "Refresh runbook" }).click();
  await expect(
    anchor.getByText(/This event is not available to you/),
  ).toBeVisible();
  await anchorContext.close();
  expect(consoleErrors).toEqual([]);
});
