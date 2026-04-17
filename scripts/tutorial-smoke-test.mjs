import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const rootDir = process.cwd();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function startStaticServer(baseDir) {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
      const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
      const filePath = path.join(baseDir, safePath);
      const file = await readFile(filePath);
      const ext = path.extname(filePath);
      response.writeHead(200, {
        "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
      });
      response.end(file);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function getSnapshot(page) {
  return page.evaluate(() => ({
    tutorialComplete: window.localStorage.getItem("tutorialComplete"),
    mode: window.__footballDebug.game.state.mode,
    team0Roster: window.__footballDebug.game.getTeam(0).rosterIds.length,
    team1Roster: window.__footballDebug.game.getTeam(1).rosterIds.length,
  }));
}

async function main() {
  const { server, url } = await startStaticServer(rootDir);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1520, height: 1100 },
  });

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("[data-tutorial-overlay]").waitFor();

    let snapshot = await getSnapshot(page);
    assert.equal(snapshot.mode, "ai", "Onboarding должен переводить первый запуск в vs ИИ");
    assert.equal(snapshot.team0Roster, 0, "Первый запуск должен стартовать с пустого состава");
    assert.equal(snapshot.team1Roster, 0, "ИИ не должен ходить до закрытия первой подсказки");
    assert.equal(
      await page.locator('[data-mode-set="hotseat"]').isDisabled(),
      true,
      "Во время onboarding hot-seat должен быть заблокирован",
    );

    await page.locator("[data-tutorial-dismiss]").click();
    await page.locator('[data-player-card="gk-denis-barierov"]').click();
    await page.locator("[data-tutorial-overlay]").waitFor();

    snapshot = await getSnapshot(page);
    assert.equal(snapshot.team0Roster, 1, "Покупка первой карточки должна пройти");
    assert.equal(
      snapshot.team1Roster,
      0,
      "ИИ не должен драфтить, пока открыта подсказка о его ходе",
    );

    await page.locator("[data-tutorial-dismiss]").click();
    await page.waitForFunction(
      () => window.__footballDebug.game.getTeam(1).rosterIds.length === 1,
    );

    await page.locator("[data-tutorial-restart]").click();
    await page.locator("[data-tutorial-overlay]").waitFor();

    snapshot = await getSnapshot(page);
    assert.equal(snapshot.team0Roster, 0, "Перезапуск обучения должен сбрасывать матч");
    assert.equal(snapshot.team1Roster, 0, "После перезапуска обе команды снова пустые");

    await page.locator("[data-tutorial-skip]").click();
    await page.waitForSelector("[data-tutorial-overlay]", { state: "detached" });

    snapshot = await getSnapshot(page);
    assert.equal(snapshot.tutorialComplete, "true", "Пропуск должен отмечать onboarding завершённым");
    assert.equal(
      await page.locator('[data-mode-set="hotseat"]').isDisabled(),
      false,
      "После пропуска hot-seat снова должен быть доступен",
    );

    console.log("tutorial-smoke-test: ok");
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
