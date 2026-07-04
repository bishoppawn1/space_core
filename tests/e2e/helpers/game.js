const { expect } = require("@playwright/test");

async function openGame(page) {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await page.goto("/?test=1");
  await page.waitForFunction(() => window.SpaceCore?.testApi);
  await page.evaluate(() => window.SpaceCore.testApi.reset());
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  return {
    async expectNoBrowserErrors() {
      expect(errors).toEqual([]);
    },
  };
}

async function api(page, method, ...args) {
  return page.evaluate(
    ([methodName, methodArgs]) => window.SpaceCore.testApi[methodName](...methodArgs),
    [method, args],
  );
}

async function snapshot(page) {
  return api(page, "snapshot");
}

async function coreConfig(page) {
  return page.evaluate(() => window.SpaceCore.testApi.config);
}

function cellLocator(page, x, y) {
  return page.locator(`[aria-label="Cell ${x}, ${y}"]`);
}

module.exports = {
  api,
  cellLocator,
  coreConfig,
  openGame,
  snapshot,
};
