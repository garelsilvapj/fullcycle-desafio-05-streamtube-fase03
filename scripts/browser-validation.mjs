#!/usr/bin/env node
// Validação no navegador contra o backend REAL (sem MSW): registro via API + Mailpit,
// login pela UI, upload do sample pelo /upload, player em /videos/[id] (Range/seek) e exclusão.
//
// Pré-condições (host): stack do backend no ar com a API em start:dev; frontend em `npm run dev`
// SEM MSW_ENABLED; Chromium do Playwright instalado (`npx playwright install chromium` em
// next-frontend); `tmp/smoke/sample.mp4` gerado pelo scripts/smoke-videos.sh.
// Uso: node scripts/browser-validation.mjs   (OUT_DIR=<pasta> para os screenshots)
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import(join(ROOT, "next-frontend/node_modules/playwright/index.mjs"));

const API = "http://localhost:3000";
const FRONT = "http://localhost:3001";
const MAILPIT = "http://localhost:8025";
const SAMPLE = process.env.SAMPLE ?? join(ROOT, "tmp/smoke/sample.mp4");
const OUT = process.env.OUT_DIR ?? ".";
const email = `browser-${Date.now()}@example.com`;
const password = "Browser@12345";
const checks = [];
const ok = (label, cond, extra = "") => { checks.push([cond ? "✔" : "✘", label, extra]); if (!cond) process.exitCode = 1; };

async function json(url, init) { const r = await fetch(url, init); return { status: r.status, body: await r.json().catch(() => null) }; }

// 1) usuário confirmado via API real + Mailpit
const reg = await json(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
ok("registro 201", reg.status === 201);
let id = "";
for (let i = 0; i < 20 && !id; i++) { const s = await json(`${MAILPIT}/api/v1/search?query=to:${email}`); id = s.body?.messages?.[0]?.ID ?? ""; if (!id) await new Promise(r => setTimeout(r, 500)); }
const msg = await json(`${MAILPIT}/api/v1/message/${id}`);
const token = ((msg.body?.Text ?? "") + " " + (msg.body?.HTML ?? "")).match(/token=([A-Za-z0-9._~-]+)/)?.[1];
ok("token de confirmação no Mailpit", !!token);
const conf = await fetch(`${API}/auth/confirm-email?token=${token}`);
ok("confirmação 204", conf.status === 204);

// 2) navegador
const browser = await chromium.launch();
const page = await browser.newPage();
const streamResponses = [];
page.on("response", (r) => { if (r.url().includes("/api/videos/") && r.url().endsWith("/stream")) streamResponses.push({ status: r.status(), range: r.headers()["content-range"] }); });
await page.goto(`${FRONT}/login`);
await page.getByLabel("Email address").fill(email);
await page.getByLabel("Password", { exact: true }).fill(password);
const loginRes = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.getByRole("button", { name: "Sign in" }).click();
const lr = await loginRes;
ok("POST /api/auth/login 200 (API real)", lr.status() === 200, `status=${lr.status()} body=${(await lr.text()).slice(0, 120)}`);
await page.waitForTimeout(500);
await page.goto(`${FRONT}/videos`);
await page.waitForLoadState("networkidle");
ok("login via UI leva a /videos com header autenticado", await page.locator("[data-slot='session-email']").textContent() === email);

// 3) upload real
await page.goto(`${FRONT}/upload`);
await page.getByLabel("Título").fill("Validação no navegador");
await page.getByLabel(/Arquivo de vídeo/).setInputFiles(SAMPLE);
const putReq = page.waitForRequest((r) => r.method() === "PUT" && r.url().startsWith("http://localhost:9000/"), { timeout: 30000 });
await page.getByRole("button", { name: "Enviar vídeo" }).click();
const put = await putReq;
const putRes = await put.response();
ok("PUT direto no MinIO a partir do navegador (CORS ok)", putRes?.status() === 200, `status=${putRes?.status()}`);
await page.locator("[data-slot='upload-status']").waitFor();
await page.waitForFunction(() => document.querySelector("[data-slot='upload-status']")?.getAttribute("data-phase") === "ready", null, { timeout: 180000 });
ok("fase final ready (worker real processou)", true);
await page.screenshot({ path: `${OUT}/browser-upload-ready.png`, fullPage: true });

// 4) player
await page.getByRole("link", { name: "Assistir" }).click();
await page.waitForURL(/\/videos\/[0-9a-f-]{36}$/);
const videoUrl = page.url();
const player = page.locator("[data-slot='video-player']");
await player.waitFor();
await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 1; }, null, { timeout: 60000 });
const duration = await page.evaluate(() => document.querySelector("video")?.duration ?? 0);
ok("player carregou metadados via /api/videos/:id/stream", duration > 0, `duration=${duration.toFixed(1)}s`);
await page.evaluate(() => { const v = document.querySelector("video"); v.currentTime = 5; });
await page.waitForFunction(() => (document.querySelector("video")?.currentTime ?? 0) >= 4.5, null, { timeout: 30000 });
ok("seek para 5s funcionou (Range requests)", true, `stream responses: ${JSON.stringify(streamResponses.slice(0, 3))}`);
ok("BFF respondeu 206 com Content-Range ao player", streamResponses.some((r) => r.status === 206 && r.range));
await page.screenshot({ path: `${OUT}/browser-player.png`, fullPage: true });

// 5) lista + exclusão
await page.goto(`${FRONT}/videos`);
ok("lista mostra 1 card ready", (await page.locator("[data-slot='video-card'][data-status='ready']").count()) === 1);
await page.goto(videoUrl);
page.once("dialog", (d) => d.accept());
await page.locator("[data-slot='delete-video']").click();
await page.waitForURL(/\/videos$/);
ok("exclusão redireciona para /videos vazio", (await page.locator("[data-slot='video-list-empty']").count()) === 1);
await browser.close();

for (const [mark, label, extra] of checks) console.log(`${mark} ${label}${extra ? ` — ${extra}` : ""}`);
console.log(process.exitCode ? "FALHOU" : "TUDO OK");
