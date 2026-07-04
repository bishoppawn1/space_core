const { test, expect } = require("@playwright/test");
const { api, openGame, snapshot } = require("./helpers/game");

const TUTORIAL_STORAGE_KEY = "space-core-tutorial-complete-v1";

test("main menu start new server creates a private room", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "true"), TUTORIAL_STORAGE_KEY);
  await page.goto("/");
  await expect(page.locator("#main-menu-view")).toBeVisible();

  await page.locator("#start-new-server-button").click();
  await expect(page.locator("#world-view")).toBeVisible();
  await expect(page.locator("#world-status")).toContainText(/Hosting private room [A-Z0-9]{6}/);
  await expect(page.locator("#multiplayer-status")).toContainText(/Hosting [A-Z0-9]{6}/);
});

test("private multiplayer rooms isolate a host and guest by room code", async ({ page, context }) => {
  const hostBrowser = await openGame(page);
  const guestPage = await context.newPage();
  const guestBrowser = await openGame(guestPage);

  await api(page, "loadFixture", "combat");
  await api(page, "startPrivateServer");
  await page.waitForFunction(() => {
    const multiplayer = window.SpaceCore.testApi.snapshot().multiplayer;
    return multiplayer.connected && multiplayer.isHost && multiplayer.roomId && multiplayer.roomId !== "PUBLIC";
  });

  const roomId = (await snapshot(page)).multiplayer.roomId;
  expect(roomId).toMatch(/^[A-Z0-9]{6}$/);

  await api(guestPage, "joinPrivateRoom", roomId);
  await guestPage.waitForFunction((expectedRoomId) => {
    const multiplayer = window.SpaceCore.testApi.snapshot().multiplayer;
    return multiplayer.connected && !multiplayer.isHost && multiplayer.roomId === expectedRoomId;
  }, roomId);

  await page.waitForFunction(() => window.SpaceCore.testApi.snapshot().multiplayer.peerCount === 2);
  await guestPage.waitForFunction(() => window.SpaceCore.testApi.snapshot().multiplayer.peerCount === 2);

  const hostSnapshot = await snapshot(page);
  const guestSnapshot = await snapshot(guestPage);
  expect(hostSnapshot.multiplayer.roomId).toBe(roomId);
  expect(hostSnapshot.multiplayer.isHost).toBe(true);
  expect(guestSnapshot.multiplayer.roomId).toBe(roomId);
  expect(guestSnapshot.multiplayer.hostId).toBe(hostSnapshot.multiplayer.clientId);
  expect(guestSnapshot.statuses.world).toContain(`private room ${roomId}`);

  await hostBrowser.expectNoBrowserErrors();
  await guestBrowser.expectNoBrowserErrors();
});

test("joining a missing private room reports a clear error", async ({ page }) => {
  const browser = await openGame(page);

  await api(page, "joinPrivateRoom", "NOPE42");
  await page.waitForFunction(() => {
    const snapshot = window.SpaceCore.testApi.snapshot();
    return !snapshot.multiplayer.connected && snapshot.statuses.world.includes("Private room not found");
  });

  const result = await snapshot(page);
  expect(result.multiplayer.connected).toBe(false);
  expect(result.statuses.world).toBe("Private room not found.");

  await browser.expectNoBrowserErrors();
});
