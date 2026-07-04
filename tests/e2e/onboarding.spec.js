const { test, expect } = require("@playwright/test");

const TUTORIAL_STORAGE_KEY = "space-core-tutorial-complete-v1";

test("tutorial can be skipped or completed before starting single player from the main menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#tutorial-view")).toBeVisible();
  await expect(page.locator("#construction-view")).toBeHidden();
  await expect(page.locator("#tutorial-title")).toHaveText("Build Around The Core");

  await page.locator("#tutorial-next-button").click();
  await expect(page.locator("#tutorial-title")).toHaveText("Power The Ship");
  await page.locator("#tutorial-back-button").click();
  await expect(page.locator("#tutorial-title")).toHaveText("Build Around The Core");

  await page.locator("#skip-tutorial-button").click();
  await expect(page.locator("#main-menu-view")).toBeVisible();
  await expect(page.locator("#main-menu-status")).toContainText("Tutorial skipped");
  await expect(page.locator("#start-single-player-button")).toBeVisible();

  await page.locator("#join-public-server-button").click();
  await expect(page.locator("#main-menu-status")).toContainText("Public multiplayer is coming soon");
  await page.locator("#join-private-server-button").click();
  await expect(page.locator("#main-menu-status")).toContainText("Private multiplayer is coming soon");
  await page.locator("#start-new-server-button").click();
  await expect(page.locator("#main-menu-status")).toContainText("Server hosting is coming soon");

  await page.locator("#start-single-player-button").click();
  await expect(page.locator("#construction-view")).toBeVisible();
  await expect(page.locator("#main-menu-view")).toBeHidden();

  await page.reload();
  await expect(page.locator("#main-menu-view")).toBeVisible();
  await expect(page.locator("#tutorial-view")).toBeHidden();

  await page.evaluate((key) => localStorage.removeItem(key), TUTORIAL_STORAGE_KEY);
  await page.reload();
  await expect(page.locator("#tutorial-view")).toBeVisible();

  for (let index = 0; index < 4; index += 1) {
    await page.locator("#tutorial-next-button").click();
  }

  await expect(page.locator("#tutorial-title")).toHaveText("Salvage, Trade, Research");
  await expect(page.locator("#tutorial-next-button")).toHaveText("Open Main Menu");
  await page.locator("#tutorial-next-button").click();
  await expect(page.locator("#main-menu-view")).toBeVisible();
  await expect(page.locator("#main-menu-status")).toContainText("Tutorial complete");
});
