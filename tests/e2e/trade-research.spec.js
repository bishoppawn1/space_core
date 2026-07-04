const { test, expect } = require("@playwright/test");
const { api, openGame, snapshot } = require("./helpers/game");

test("trader exchange and research tree actions run without manual setup", async ({ page }) => {
  const browser = await openGame(page);

  await api(page, "loadFixture", "trade");
  await api(page, "enterWorld");
  await api(page, "moveTraderIntoRange");
  await expect(page.locator("#trade-button")).toBeVisible();

  const beforeTrade = await snapshot(page);
  await page.locator("#trade-button").click();
  await expect(page.locator("#trade-overlay")).toBeVisible();
  await expect(page.locator(".trade-slot")).toHaveCount(5);

  await api(page, "buyTradeSlot", 0);
  const afterBuy = await snapshot(page);
  expect(afterBuy.inventory.engine).toBe(beforeTrade.inventory.engine + 1);
  expect(afterBuy.scrap).toBe(beforeTrade.scrap - 25);

  await api(page, "sellTradeItem", "engine");
  const afterSell = await snapshot(page);
  expect(afterSell.inventory.engine).toBe(afterBuy.inventory.engine - 1);
  expect(afterSell.scrap).toBeGreaterThan(afterBuy.scrap);

  await page.locator("#close-trade-button").click();
  await api(page, "reset");
  await expect(page.locator("#construction-view")).toBeVisible();

  await api(page, "setScrap", 500);
  await api(page, "setInventory", { laser: 2, "electric-cable": 8 });
  await page.locator("#research-button").click();
  await expect(page.locator("#tech-tree-overlay")).toBeVisible();
  await page.locator(".tech-node[data-project-id='targeting-computer']").click();
  await page.locator(".tech-detail-research[data-project-id='targeting-computer']").click();

  const researched = await snapshot(page);
  expect(researched.unlockedTechIds).toContain("targeting-computer");
  expect(researched.scrap).toBe(435);

  await browser.expectNoBrowserErrors();
});
