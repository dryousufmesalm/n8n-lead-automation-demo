import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const N8N_BASE = process.env.N8N_URL || "http://localhost:5678";
const WORKFLOW_ID = process.env.WORKFLOW_ID;
const workflowUrl = WORKFLOW_ID
  ? `${N8N_BASE}/workflow/${WORKFLOW_ID}`
  : N8N_BASE;
const OUT_DIR = "/tmp/n8n-demo-video";
const ARTIFACT = "/opt/cursor/artifacts/demo.mp4";

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) {
  fs.unlinkSync(path.join(OUT_DIR, f));
}
fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

async function postLead(payload) {
  await page.evaluate(async (body) => {
    await fetch("http://localhost:5678/webhook/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, payload);
}

await page.goto(workflowUrl, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(8000);

await postLead({
  name: "Hot Lead — Amina",
  email: "amina@global-enterprise.io",
  company: "Global Enterprise Partners",
  budget_usd: 42000,
  phone: "+14155550101",
  source: "referral",
});
await page.waitForTimeout(12000);

const execTab = page.getByRole("link", { name: /Executions/i });
if (await execTab.count()) {
  await execTab.first().click();
  await page.waitForTimeout(10000);
  await page.goBack({ waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(5000);
}

await postLead({
  name: "Warm Lead — Ben",
  email: "ben@bright-smb.com",
  company: "Bright SMB",
  budget_usd: 12000,
  phone: "+14155550102",
  source: "web",
});
await page.waitForTimeout(12000);

await postLead({
  name: "Fallback — Dana",
  email: "dana@startup.io",
  company: "Launchpad Startup",
  budget_usd: 18000,
  phone: "+14155550104",
  simulate_openai_failure: true,
});
await page.waitForTimeout(15000);

await page.waitForTimeout(5000);
await context.close();
await browser.close();

const webms = fs
  .readdirSync(OUT_DIR)
  .filter((f) => f.endsWith(".webm"))
  .map((f) => ({ f, m: fs.statSync(path.join(OUT_DIR, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m);
if (!webms.length) {
  throw new Error("No Playwright webm recording found");
}

const webmPath = path.join(OUT_DIR, webms[0].f);
execSync(
  `ffmpeg -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -t 75 "${ARTIFACT}"`,
  { stdio: "inherit" }
);
console.log(`Saved demo to ${ARTIFACT}`);
