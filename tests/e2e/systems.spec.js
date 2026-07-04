const { test, expect } = require("@playwright/test");
const { api, openGame, snapshot } = require("./helpers/game");

test("ammo routing, repair bots, shields, and salvage collectors advance autonomously", async ({ page }) => {
  const browser = await openGame(page);

  await api(page, "loadFixture", "combat");
  await api(page, "enterWorld");

  const cannonCell = (await api(page, "cellsWithBlock", "cannon"))[0];
  expect(cannonCell.block.ammo).toBe(0);

  await api(page, "advanceWorld", 2.5, { simulatePve: false });
  const loadedCannon = (await api(page, "cellsWithBlock", "cannon")).find((cell) => cell.block.ammo > 0);
  expect(loadedCannon).toBeTruthy();

  const laserCell = (await api(page, "cellsWithBlock", "laser"))[0];
  const damagedLaser = await api(page, "damageCell", laserCell.x, laserCell.y, "block", 30);
  expect(damagedLaser.block.hp).toBeLessThan(damagedLaser.block.maxHp);

  await api(page, "advanceWorld", 1, { simulatePve: false });
  const repairedLaser = await api(page, "cellAt", laserCell.x, laserCell.y);
  expect(repairedLaser.block.hp).toBeGreaterThan(damagedLaser.block.hp);

  const shieldCell = (await api(page, "cellsWithBlock", "shield-block"))[0];
  await api(page, "setShieldCharge", shieldCell.x, shieldCell.y, 0);
  await api(page, "advanceWorld", 1, { simulatePve: false });
  const rechargedShield = await api(page, "cellAt", shieldCell.x, shieldCell.y);
  expect(rechargedShield.block.shieldHp).toBeGreaterThan(0);

  const beforeSalvage = await snapshot(page);
  await api(page, "addSalvagePiece", "engine", { id: "test-salvage-engine" });
  await api(page, "advanceWorld", 1.5, { simulatePve: false });
  const afterSalvage = await snapshot(page);
  expect(afterSalvage.inventory.engine).toBe(beforeSalvage.inventory.engine + 1);

  await browser.expectNoBrowserErrors();
});
