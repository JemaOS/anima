// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

/**
 * Load test for the Anima P2P mesh.
 *
 * Spawns N headless Chromium clients (1 host + N-1 participants) that join the
 * same room with fake camera/mic, then samples WebRTC getStats() on each client
 * to report aggregate uplink/downlink bandwidth and per-client CPU usage.
 *
 * The goal (per the project requirements) is to validate that with 8 clients:
 *   - the TURN/coturn + signaling stay under ~70% CPU on the FR server, and
 *   - uplink/downlink bandwidth stays within the hosting plan limits.
 *
 * This script measures the CLIENT side (bandwidth produced/consumed per peer,
 * CPU of each browser). Server CPU must be watched separately on the VPS
 * (e.g. `top`, `htop`, or `docker stats`) while this test runs — the script
 * prints the expected aggregate server relay load to compare against.
 *
 * Usage:
 *   node scripts/load-test.mjs --url https://anima.jemaos.com --clients 8 --duration 60
 *   node scripts/load-test.mjs                       # defaults: prod URL, 8 clients, 60s
 *
 * Options:
 *   --url       Base app URL (default: https://anima.jemaos.com)
 *   --clients   Number of participants including host (default: 8, max 8)
 *   --duration  Test duration in seconds (default: 60)
 *   --headed    Show browser windows (default: headless)
 *   --relay     Force TURN relay only (simulates worst case for server load)
 *
 * Requires Playwright Chromium: `npx playwright install chromium`
 */

import { chromium } from "playwright";

// ---- CLI args ----------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    url: "https://anima.jemaos.com",
    clients: 8,
    duration: 60,
    headed: false,
    relay: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--clients") args.clients = Number.parseInt(argv[++i], 10);
    else if (a === "--duration") args.duration = Number.parseInt(argv[++i], 10);
    else if (a === "--headed") args.headed = true;
    else if (a === "--relay") args.relay = true;
  }
  args.clients = Math.min(Math.max(args.clients, 2), 8);
  return args;
}

const cfg = parseArgs(process.argv);

// Random room code in the app's xxx-xxx-xxx-ish format.
function randomCode() {
  const part = () =>
    Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 3).padEnd(3, "x");
  return `${part()}-${part()}-${part()}`;
}

const ROOM_CODE = randomCode();

// ---- Per-client setup --------------------------------------------------------
async function launchClient(index, isHost) {
  const browser = await chromium.launch({
    headless: !cfg.headed,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-dev-shm-usage",
    ],
  });
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  const page = await context.newPage();

  // Install the PC registry BEFORE navigating so it applies to the room page.
  await installPcRegistry(page);

  const prejoinUrl = `${cfg.url}/prejoin/${ROOM_CODE}?host=${isHost ? "true" : "false"}`;
  await page.goto(prejoinUrl, { waitUntil: "domcontentloaded" });

  // Fill the name and start/join.
  const name = isHost ? "Host" : `User${index}`;
  try {
    await page.fill('input[placeholder="Entrez votre nom"]', name, {
      timeout: 20000,
    });
    // The start button is enabled once a name is set and media is ready.
    const startBtn = page.getByRole("button", { name: /Démarrer|Rejoindre/i });
    await startBtn.waitFor({ state: "visible", timeout: 20000 });
    // Wait until it's no longer disabled.
    await page
      .waitForFunction(
        () => {
          const btns = Array.from(document.querySelectorAll("button"));
          const b = btns.find((x) => /Démarrer|Rejoindre/i.test(x.textContent || ""));
          return b && !b.disabled;
        },
        { timeout: 20000 },
      )
      .catch(() => {});
    await startBtn.click({ timeout: 20000 });
    // Wait for navigation into the room route.
    await page
      .waitForURL(/\/room\//, { timeout: 20000 })
      .catch(() => console.warn(`[client ${index}] did not reach /room/`));
  } catch (e) {
    console.warn(`[client ${index}] could not start: ${e.message}`);
  }

  return { browser, context, page, index, isHost, name };
}

// Collect WebRTC stats from inside the page across all RTCPeerConnections.
// We patch RTCPeerConnection on the page to keep a registry.
async function installPcRegistry(page) {
  await page.addInitScript(() => {
    // @ts-ignore
    window.__pcs = [];
    const Orig = window.RTCPeerConnection;
    if (!Orig || Orig.__patched) return;
    function Patched(...a) {
      const pc = new Orig(...a);
      // @ts-ignore
      window.__pcs.push(pc);
      return pc;
    }
    Patched.prototype = Orig.prototype;
    Patched.__patched = true;
    // @ts-ignore
    window.RTCPeerConnection = Patched;
  });
}

async function sampleClient(page) {
  return page.evaluate(async () => {
    // @ts-ignore
    const pcs = window.__pcs || [];
    let bytesSent = 0;
    let bytesReceived = 0;
    let connections = 0;
    for (const pc of pcs) {
      if (pc.connectionState === "closed") continue;
      connections++;
      try {
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type === "outbound-rtp") bytesSent += r.bytesSent || 0;
          if (r.type === "inbound-rtp") bytesReceived += r.bytesReceived || 0;
        });
      } catch {
        /* ignore */
      }
    }
    return { bytesSent, bytesReceived, connections };
  });
}

// CPU via Chrome DevTools Protocol (Performance.metrics -> TaskDuration delta).
async function makeCpuSampler(context, page) {
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  let last = null;
  return async () => {
    const { metrics } = await session.send("Performance.getMetrics");
    const get = (n) => metrics.find((m) => m.name === n)?.value ?? 0;
    const task = get("TaskDuration"); // cumulative seconds of CPU task time
    const ts = get("Timestamp");
    if (last) {
      const dCpu = task - last.task;
      const dT = ts - last.ts;
      last = { task, ts };
      return dT > 0 ? (dCpu / dT) * 100 : 0; // % of one core
    }
    last = { task, ts };
    return 0;
  };
}

function fmtMbps(bytesPerSec) {
  return ((bytesPerSec * 8) / 1_000_000).toFixed(2);
}

// ---- Main --------------------------------------------------------------------
async function main() {
  console.log("=".repeat(64));
  console.log("Anima P2P load test");
  console.log(`  URL:       ${cfg.url}`);
  console.log(`  Room:      ${ROOM_CODE}`);
  console.log(`  Clients:   ${cfg.clients} (1 host + ${cfg.clients - 1} participants)`);
  console.log(`  Duration:  ${cfg.duration}s`);
  console.log("=".repeat(64));

  const clients = [];

  // Launch host first, give it a head start to open the room.
  const host = await launchClient(0, true);
  clients.push(host);
  await host.page.waitForTimeout(3000);

  // Launch participants with small stagger to avoid a thundering herd.
  for (let i = 1; i < cfg.clients; i++) {
    const c = await launchClient(i, false);
    clients.push(c);
    await c.page.waitForTimeout(1500);
  }

  console.log(`\nAll ${clients.length} clients launched. Connecting...\n`);
  await clients[0].page.waitForTimeout(8000);

  const cpuSamplers = [];
  for (const c of clients) {
    try {
      cpuSamplers.push(await makeCpuSampler(c.context, c.page));
    } catch {
      cpuSamplers.push(async () => 0);
    }
  }

  // Sampling loop.
  const prev = clients.map(() => ({ sent: 0, recv: 0 }));
  const intervalSec = 5;
  const iterations = Math.ceil(cfg.duration / intervalSec);
  let peakUpMbps = 0;
  let peakDownMbps = 0;
  let peakCpu = 0;

  for (let it = 0; it < iterations; it++) {
    await clients[0].page.waitForTimeout(intervalSec * 1000);

    let totSentRate = 0;
    let totRecvRate = 0;
    let totConns = 0;
    let totCpu = 0;

    for (let i = 0; i < clients.length; i++) {
      let s;
      try {
        s = await sampleClient(clients[i].page);
      } catch {
        s = { bytesSent: 0, bytesReceived: 0, connections: 0 };
      }
      const sentRate = (s.bytesSent - prev[i].sent) / intervalSec;
      const recvRate = (s.bytesReceived - prev[i].recv) / intervalSec;
      prev[i] = { sent: s.bytesSent, recv: s.bytesReceived };
      totSentRate += Math.max(0, sentRate);
      totRecvRate += Math.max(0, recvRate);
      totConns += s.connections;
      const cpu = await cpuSamplers[i]();
      totCpu += cpu;
      peakCpu = Math.max(peakCpu, cpu);
    }

    const upMbps = Number(fmtMbps(totSentRate));
    const downMbps = Number(fmtMbps(totRecvRate));
    peakUpMbps = Math.max(peakUpMbps, upMbps);
    peakDownMbps = Math.max(peakDownMbps, downMbps);

    console.log(
      `t=${(it + 1) * intervalSec}s  ` +
        `conns=${totConns}  ` +
        `up=${upMbps}Mbps  down=${downMbps}Mbps  ` +
        `avgCPU=${(totCpu / clients.length).toFixed(0)}%/core`,
    );
  }

  // ---- Report ----------------------------------------------------------------
  console.log("\n" + "=".repeat(64));
  console.log("RESULT");
  console.log("=".repeat(64));
  console.log(`Peak aggregate uplink:   ${peakUpMbps} Mbps`);
  console.log(`Peak aggregate downlink: ${peakDownMbps} Mbps`);
  console.log(`Peak per-client CPU:     ${peakCpu.toFixed(0)} % of one core`);
  console.log("");
  console.log("Server-side (watch on the VPS while this runs):");
  console.log("  - coturn relays traffic only for peers behind symmetric NAT.");
  console.log("    In the worst case (all relayed), server relays ~ the peak");
  console.log(`    aggregate above (~${peakUpMbps} Mbps each direction).`);
  console.log("  - Run `docker stats` / `htop` on the VPS; coturn + signaling");
  console.log("    should stay < 70% CPU. If not, scale up or cap participants.");
  console.log("");
  if (peakCpu > 90) {
    console.log("⚠️  Client CPU is very high (>90%/core) — expected with many");
    console.log("    fake-media Chromium instances on one machine. Run clients");
    console.log("    across several machines for a realistic measurement.");
  }
  console.log("=".repeat(64));

  // Teardown.
  for (const c of clients) {
    await c.browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("Load test failed:", e);
  process.exit(1);
});
