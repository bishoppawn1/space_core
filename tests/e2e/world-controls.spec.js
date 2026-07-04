const { test, expect } = require("@playwright/test");
const { api, openGame, snapshot } = require("./helpers/game");

test("launching a powered ship enables engine controls and deterministic movement", async ({ page }) => {
  const browser = await openGame(page);

  await api(page, "loadFixture", "combat");
  const fixture = await snapshot(page);
  expect(fixture.stats.powerGenerated).toBeGreaterThanOrEqual(fixture.stats.powerRequired);
  expect(fixture.stats.poweredBlocks).toBeGreaterThanOrEqual(8);

  await page.locator("#done-button").click();
  await page.evaluate(() => window.SpaceCore.testApi.stopWorld());
  await expect(page.locator("#world-view")).toBeVisible();
  await expect(page.locator(".player-ship .world-ship-part.engine.selectable")).toHaveCount(2);
  await expect(page.locator(".player-ship .world-ship-part.laser.selectable")).toHaveCount(1);

  const selected = await api(page, "selectFirstEngine");
  expect(selected.selected).toBeTruthy();
  await expect(page.locator("#selected-engines-count")).toHaveText("1");

  await page.locator("#engine-on-button").click();
  await page.evaluate(() => window.SpaceCore.testApi.stopWorld());
  await expect(page.locator("#active-engines-count")).toHaveText("1");

  const before = (await snapshot(page)).world.ship;
  await api(page, "advanceWorld", 0.5, { simulatePve: false });
  const after = (await snapshot(page)).world.ship;
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.1);

  await page.locator("#engine-off-button").click();
  await expect(page.locator("#active-engines-count")).toHaveText("0");

  await browser.expectNoBrowserErrors();
});
