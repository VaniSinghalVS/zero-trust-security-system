/**
 * eval-script.js
 *
 * Exercises http://localhost:5000 to generate quantitative evidence that:
 *   (A) A legitimate-but-irregular user is not unnecessarily punished.
 *   (B) A credential-theft attacker's device is never silently promoted to trusted.
 *
 * Run with: node eval-script.js
 * Requires Node 18+ (native fetch).
 */

const BASE_URL = "http://localhost:5000";
const USERNAME = "eval_legit_user";
const LAPTOP  = "eval-laptop";
const PHONE   = "eval-phone";
const ATTACKER_DEVICE = "eval-attacker-device";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── helpers ────────────────────────────────────────────────────────────────

async function getTrustScore({ username, device, flags = {} }) {
  const params = new URLSearchParams({ username, device, _ts: Date.now(), ...flags });
  const res = await fetch(`${BASE_URL}/api/trust-score?${params}`);
  if (!res.ok) throw new Error(`trust-score HTTP ${res.status}`);
  return res.json();
}

async function stepUpConfirm({ username, dimension, value, passed }) {
  const res = await fetch(`${BASE_URL}/api/step-up-confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, dimension, value, passed })
  });
  if (!res.ok) throw new Error(`step-up-confirm HTTP ${res.status}`);
  return res.json();
}

function pad(str, width) {
  return String(str).padEnd(width);
}

function printTableHeader() {
  console.log(
    pad("Round", 7) +
    pad("Device", 22) +
    pad("Score", 7) +
    pad("Level", 10) +
    pad("Action", 16) +
    pad("DeviceQStatus", 16) +
    "Flags"
  );
  console.log("─".repeat(88));
}

function printRow(round, device, data, flags) {
  const qStatus = data?.quarantineStatus?.device ?? "—";
  const flagStr = Object.entries(flags)
    .filter(([, v]) => v !== false && v !== 0 && v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ") || "—";

  console.log(
    pad(round, 7) +
    pad(device, 22) +
    pad(data?.score ?? "?", 7) +
    pad(data?.level ?? "?", 10) +
    pad(data?.action ?? "?", 16) +
    pad(qStatus, 16) +
    flagStr
  );
}

// ─── Scenario A ─────────────────────────────────────────────────────────────

async function runScenarioA() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  SCENARIO A — Legitimate irregular user");
  console.log("═══════════════════════════════════════════════════════════════\n");

  printTableHeader();

  const results = [];

  // Rounds 1-5: eval-laptop, no flags
  for (let r = 1; r <= 5; r++) {
    const data = await getTrustScore({ username: USERNAME, device: LAPTOP });
    printRow(r, LAPTOP, data, {});
    results.push({ round: r, device: LAPTOP, action: data.action, level: data.level, data });
    await sleep(1000);
  }

  // Rounds 6-8: eval-phone
  // Round 6 — fetch, then step-up passed:true
  {
    const data = await getTrustScore({ username: USERNAME, device: PHONE });
    printRow(6, PHONE, data, {});
    results.push({ round: 6, device: PHONE, action: data.action, level: data.level, data });
    await sleep(1000);
    await stepUpConfirm({ username: USERNAME, dimension: "device", value: PHONE, passed: true });
    console.log("  ↳ step-up #1 for eval-phone passed");
  }

  // Round 7 — fetch, then step-up passed:true (second confirmation → should promote)
  {
    const data = await getTrustScore({ username: USERNAME, device: PHONE });
    printRow(7, PHONE, data, {});
    results.push({ round: 7, device: PHONE, action: data.action, level: data.level, data });
    await sleep(1000);
    await stepUpConfirm({ username: USERNAME, dimension: "device", value: PHONE, passed: true });
    console.log("  ↳ step-up #2 for eval-phone passed → should be trusted now");
  }

  // Round 8 — fetch phone, should show trusted
  {
    const data = await getTrustScore({ username: USERNAME, device: PHONE });
    printRow(8, PHONE, data, {});
    results.push({ round: 8, device: PHONE, action: data.action, level: data.level, data });
    await sleep(1000);
  }

  // Rounds 9-12: alternate devices, oddTime on rounds 10 and 12
  const r9to12 = [
    { round: 9,  device: LAPTOP, flags: {} },
    { round: 10, device: PHONE,  flags: { oddTime: true } },
    { round: 11, device: LAPTOP, flags: {} },
    { round: 12, device: PHONE,  flags: { oddTime: true } }
  ];

  for (const { round, device, flags } of r9to12) {
    const data = await getTrustScore({ username: USERNAME, device, flags });
    printRow(round, device, data, flags);
    results.push({ round, device, action: data.action, level: data.level, data });
    await sleep(1000);
  }

  // Rounds 13-15: back to eval-laptop, no flags
  for (let r = 13; r <= 15; r++) {
    const data = await getTrustScore({ username: USERNAME, device: LAPTOP });
    printRow(r, LAPTOP, data, {});
    results.push({ round: r, device: LAPTOP, action: data.action, level: data.level, data });
    await sleep(1000);
  }

  // Summary
  const strictRounds = results.filter(
    (r) => r.action === "STEP_UP_AUTH" || r.action === "BLOCK" || r.level === "DENIED"
  );
  const lastPhoneResult = [...results].reverse().find((r) => r.device === PHONE);
  const phoneFinalStatus = lastPhoneResult?.data?.quarantineStatus?.device ?? "unknown";

  console.log("\n─── Scenario A Summary ──────────────────────────────────────");
  console.log(`  Rounds with STEP_UP_AUTH / BLOCK / DENIED : ${strictRounds.length} / ${results.length}`);
  console.log(`  eval-phone final quarantineStatus         : ${phoneFinalStatus}`);
  const phonePromoted = phoneFinalStatus === "trusted";
  console.log(`  eval-phone promoted to trusted?           : ${phonePromoted ? "✅ YES" : "❌ NO"}`);
  if (strictRounds.length > 0) {
    console.log(`  Strict-action rounds                      : ${strictRounds.map((r) => r.round).join(", ")}`);
  }

  return { strictRounds: strictRounds.length, total: results.length, phoneFinalStatus };
}

// ─── Scenario B ─────────────────────────────────────────────────────────────

async function runScenarioB() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  SCENARIO B — Credential-theft attacker (same account, new device)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  printTableHeader();

  const results = [];

  // Rounds 1-5: attacker's first exploratory logins, no flags beyond new device
  for (let r = 1; r <= 5; r++) {
    const data = await getTrustScore({ username: USERNAME, device: ATTACKER_DEVICE });
    printRow(r, ATTACKER_DEVICE, data, {});
    results.push({ round: r, device: ATTACKER_DEVICE, action: data.action, level: data.level, data });
    await sleep(1000);
  }

  // Rounds 6-15: alternating suspicious flags, never confirming step-up
  for (let r = 6; r <= 15; r++) {
    const flags = r % 2 === 0
      ? { suspiciousBehavior: true, failedAttempts: 3 }
      : {};
    const data = await getTrustScore({ username: USERNAME, device: ATTACKER_DEVICE, flags });
    printRow(r, ATTACKER_DEVICE, data, flags);
    results.push({ round: r, device: ATTACKER_DEVICE, action: data.action, level: data.level, data });
    await sleep(1000);
  }

  // Summary
  const strictRounds = results.filter(
    (r) => r.action === "STEP_UP_AUTH" || r.action === "BLOCK" || r.level === "DENIED"
  );
  const lastResult = results[results.length - 1];
  const attackerFinalStatus = lastResult?.data?.quarantineStatus?.device ?? "unknown";

  console.log("\n─── Scenario B Summary ──────────────────────────────────────");
  console.log(`  Rounds with STEP_UP_AUTH / BLOCK / DENIED : ${strictRounds.length} / ${results.length}`);
  console.log(`  eval-attacker-device final quarantineStatus: ${attackerFinalStatus}`);
  const neverPromoted = attackerFinalStatus !== "trusted";
  console.log(`  Attacker device stayed non-trusted?        : ${neverPromoted ? "✅ YES" : "❌ NO — SECURITY FAILURE"}`);
  if (strictRounds.length > 0) {
    console.log(`  Strict-action rounds                      : ${strictRounds.map((r) => r.round).join(", ")}`);
  }

  return { strictRounds: strictRounds.length, total: results.length, attackerFinalStatus };
}

// ─── Scenario C ─────────────────────────────────────────────────────────────

async function runScenarioC() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  SCENARIO C — Cross-account Threat Intelligence");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const attackerDevice = "eval-shared-attacker-device";

  console.log(
    pad("Account", 18) +
    pad("Without Intel", 16) +
    pad("With Intel", 16) +
    "Reason"
  );
  console.log("─".repeat(88));

  let blockedCountWithIntel = 0;

  for (let i = 1; i <= 8; i++) {
    const targetAccount = `eval_victim_${i}`;

    // 1. Check without intel (ignoreIntel=true)
    const dataWithout = await getTrustScore({ username: targetAccount, device: attackerDevice, flags: { ignoreIntel: true } });
    
    // 2. Check with intel (normal)
    const dataWith = await getTrustScore({ username: targetAccount, device: attackerDevice });

    // 3. For account 1, the attacker fails the step-up (simulated by explicitly failing it)
    if (i === 1) {
      await stepUpConfirm({ username: targetAccount, dimension: "device", value: attackerDevice, passed: false });
    }

    if (dataWith.action === "BLOCK") blockedCountWithIntel++;

    console.log(
      pad(`Account ${i}`, 18) +
      pad(dataWithout.action, 16) +
      pad(dataWith.action, 16) +
      (dataWith.reasons.find(r => r.includes("crossAccount")) || "—")
    );

    await sleep(500);
  }

  console.log("\n─── Scenario C Summary ──────────────────────────────────────");
  const pass = blockedCountWithIntel >= 7; // Account 2 to 8 should be blocked
  console.log(`  Expected cross-account blocks : 7`);
  console.log(`  Actual cross-account blocks   : ${blockedCountWithIntel}`);
  console.log(`  Cross-account intel working?  : ${pass ? "✅ YES" : "❌ NO"}`);
  
  return { blockedCountWithIntel, total: 8, pass };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Zero-Trust Evaluation Script");
  console.log(`Target : ${BASE_URL}`);
  console.log(`Account: ${USERNAME}`);
  console.log(`Started: ${new Date().toISOString()}`);

  let summaryA, summaryB;

  try {
    summaryA = await runScenarioA();
  } catch (err) {
    console.error("\n❌ Scenario A failed:", err.message);
    process.exit(1);
  }

  try {
    summaryB = await runScenarioB();
  } catch (err) {
    console.error("\n❌ Scenario B failed:", err.message);
    process.exit(1);
  }

  let summaryC;
  try {
    summaryC = await runScenarioC();
  } catch (err) {
    console.error("\n❌ Scenario C failed:", err.message);
    process.exit(1);
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  OVERALL RESULTS");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(
    `  A — Legit user restricted rounds : ${summaryA.strictRounds}/${summaryA.total}` +
    `  (eval-phone: ${summaryA.phoneFinalStatus})`
  );
  console.log(
    `  B — Attacker restricted rounds   : ${summaryB.strictRounds}/${summaryB.total}` +
    `  (attacker device: ${summaryB.attackerFinalStatus})`
  );

  console.log(
    `  C — Cross-account blocks         : ${summaryC.blockedCountWithIntel}/7  ` +
    `(expected 7)`
  );

  const pass =
    summaryA.phoneFinalStatus === "trusted" &&
    summaryB.attackerFinalStatus !== "trusted" &&
    summaryB.strictRounds >= Math.floor(summaryB.total * 0.5) &&
    summaryC.pass;

  console.log(`\n  Verdict: ${pass ? "✅ PASS — system behaves correctly" : "❌ FAIL — review above"}`);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
