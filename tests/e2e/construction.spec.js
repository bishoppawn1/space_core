const { test, expect } = require("@playwright/test");
const { api, coreConfig, openGame, snapshot } = require("./helpers/game");

test("construction supports placement, rotation, erasing, and power readouts", async ({ page }) => {
  const browser = await openGame(page);
  const { coreX, coreY, columns, rows } = await coreConfig(page);

  await expect(page.locator("#construction-view")).toBeVisible();
  await expect(page.locator("#board .cell")).toHaveCount(columns * rows);
  await expect(page.locator(".tile-button[data-tile-id='ship-scaffold']")).toContainText("Ship Scaffold");

  await api(page, "placeTile", "ship-scaffold", coreX + 1, coreY);
  expect((await api(page, "cellAt", coreX + 1, coreY)).base.id).toBe("ship-scaffold");
  await expect(page.locator("#scaffold-count")).toHaveText("1");

  await page.locator(".tile-button[data-tile-id='power-generator']").click();
  await api(page, "placeTile", "power-generator", coreX + 1, coreY);
  expect((await api(page, "cellAt", coreX + 1, coreY)).block.id).toBe("power-generator");
  await expect(page.locator("#power-value")).toHaveText("8/0");

  await page.locator(".tile-button[data-tile-id='engine']").click();
  await page.locator("#rotate-button").click();
  expect((await snapshot(page)).selectedDirection).toBe("right");

  await api(page, "placeTile", "engine", coreX + 1, coreY + 1, { ensureInventory: true });
  await expect(page.locator("#status-bar")).toContainText("Blocks need ship scaffold.");

  await api(page, "placeTile", "ship-scaffold", coreX + 1, coreY + 1);
  await page.locator("#erase-button").click();
  await api(page, "eraseCell", coreX + 1, coreY + 1);
  expect((await api(page, "cellAt", coreX + 1, coreY + 1)).base).toBeNull();
  await expect(page.locator("#status-bar")).toContainText("Scaffold removed.");

  await api(page, "setInventory", "beam-laser", 1);
  const lockedSelection = await api(page, "selectTile", "beam-laser");
  expect(lockedSelection.selectedTileId).not.toBe("beam-laser");
  expect(lockedSelection.statuses.construction).toContain("Research Beam Laser");

  await browser.expectNoBrowserErrors();
});
