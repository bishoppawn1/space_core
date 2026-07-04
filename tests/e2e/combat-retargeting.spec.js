const { test, expect } = require("@playwright/test");
const { api, openGame } = require("./helpers/game");

test("weapon fire orders can retarget immediately without clearing weapon selection", async ({ page }) => {
  const browser = await openGame(page);

  await api(page, "loadFixture", "combat");
  await api(page, "enterWorld");

  const selected = await api(page, "selectFirstWeapon", "laser");
  expect(selected.selected).toBeTruthy();

  const firstTarget = await api(page, "targetPoint", { localX: 9, localY: -4 });
  const first = await api(page, "fireAt", firstTarget);
  expect(first.selectedWeaponIds).toHaveLength(1);
  expect(first.weaponOrder.target).toEqual(firstTarget);
  await expect(page.locator(".weapon-target-marker")).toHaveCount(1);

  const secondTarget = await api(page, "targetPoint", { localX: 9, localY: 4 });
  const second = await api(page, "fireAt", secondTarget);
  expect(second.selectedWeaponIds).toHaveLength(1);
  expect(second.weaponOrder.target).toEqual(secondTarget);
  expect(second.statuses.world).toMatch(/retargeted|cooling down|fired/i);
  await expect(page.locator(".weapon-target-marker")).toHaveCount(1);

  await browser.expectNoBrowserErrors();
});
