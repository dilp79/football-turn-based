import http from "node:http";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "artifacts", "layouts");

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

async function saveShot(page, name) {
  const target = path.join(outputDir, name);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function driveDraft(page) {
  const draftSequence = [
    "gk-denis-barierov",
    "mid-yaroslav-dirizher",
    "mid-timur-tempo",
    "fwd-viktor-obvod",
    "def-kirill-polev",
    "def-maksim-zubov",
    "fwd-anton-vyvorot",
    "gk-semyon-shchitov",
    "def-egor-hardov",
    "mid-lev-ritmov",
  ];

  await page.evaluate((sequence) => {
    const { game, render } = window.__footballDebug;
    game.setDebugRollQueue([6, 4, 6, 6, 6]);
    for (const cardId of sequence) {
      game.buyCard(cardId);
    }
    render();
  }, draftSequence);
}

async function drivePlacement(page) {
  const placementSteps = [
    [0, 4],
    [5, 4],
    [3, 2],
    [6, 4],
    [2, 6],
    [9, 4],
    [10, 2],
    [11, 6],
    [14, 4],
    [8, 5],
  ];

  await page.evaluate((steps) => {
    const { game, render } = window.__footballDebug;
    for (const [x, y] of steps) {
      game.clickCell(x, y);
    }
    render();
  }, placementSteps);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const { server, url } = await startStaticServer(rootDir);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1400 },
    deviceScaleFactor: 1,
  });

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator(".screen--draft").waitFor();

    const shots = [];
    shots.push(await saveShot(page, "draft.png"));

    await driveDraft(page);
    await page.locator(".screen--placement").waitFor();
    shots.push(await saveShot(page, "placement.png"));

    await drivePlacement(page);
    await page.locator(".screen--match").waitFor();
    await page.evaluate(() => {
      const { game, render } = window.__footballDebug;
      game.selectPlayer("fwd-anton-vyvorot");
      render();
    });
    shots.push(await saveShot(page, "match.png"));

    await page.evaluate(() => {
      const { game, render } = window.__footballDebug;
      game.setAction("move");
      render();
    });
    shots.push(await saveShot(page, "match-move.png"));

    console.log(
      JSON.stringify(
        {
          url,
          outputDir,
          shots,
        },
        null,
        2,
      ),
    );
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
