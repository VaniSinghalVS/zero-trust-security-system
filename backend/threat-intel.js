"use strict";

const CONFIG = {
  fanOut: {
    windowMs: 30 * 60 * 1000,
    warnAt: 2,
    maxAt: 6,
  },
  maxPenalty: 55,
  burnedPenalty: 55,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createGlobalIntel() {
  return { deviceIntel: {}, networkIntel: {} };
}

function getOrCreateEntry(bucket, key) {
  if (!bucket[key]) {
    bucket[key] = { accounts: {}, burned: false, burnedReasons: [], firstSeen: Date.now(), lastSeen: Date.now() };
  }
  return bucket[key];
}

function pruneAccounts(entry, now) {
  for (const [username, lastSeen] of Object.entries(entry.accounts)) {
    if (now - lastSeen > CONFIG.fanOut.windowMs) delete entry.accounts[username];
  }
}

function fanOutRisk(entry, now) {
  pruneAccounts(entry, now);
  const distinctAccounts = Object.keys(entry.accounts).length;
  if (distinctAccounts <= CONFIG.fanOut.warnAt) return { risk: 0, distinctAccounts };
  const span = CONFIG.fanOut.maxAt - CONFIG.fanOut.warnAt;
  const risk = clamp((distinctAccounts - CONFIG.fanOut.warnAt) / span, 0, 1);
  return { risk, distinctAccounts };
}

function recordAttempt(intel, { username, device, network }) {
  const now = Date.now();
  if (device) {
    const entry = getOrCreateEntry(intel.deviceIntel, device);
    entry.accounts[username] = now;
    entry.lastSeen = now;
  }
  if (network) {
    const entry = getOrCreateEntry(intel.networkIntel, network);
    entry.accounts[username] = now;
    entry.lastSeen = now;
  }
}

function getGlobalRisk(intel, { device, network }) {
  const now = Date.now();
  const result = { deviceRisk: 0, networkRisk: 0, reasons: [] };

  if (device && intel.deviceIntel[device]) {
    const entry = intel.deviceIntel[device];
    const { risk, distinctAccounts } = fanOutRisk(entry, now);
    let deviceRisk = risk;
    if (entry.burned) {
      deviceRisk = 1;
      result.reasons.push(`crossAccount: device previously failed step-up against another account`);
    } else if (risk > 0) {
      result.reasons.push(`crossAccount: device used against ${distinctAccounts} distinct accounts recently`);
    }
    result.deviceRisk = deviceRisk;
  }

  if (network && intel.networkIntel[network]) {
    const entry = intel.networkIntel[network];
    const { risk, distinctAccounts } = fanOutRisk(entry, now);
    let networkRisk = risk;
    if (entry.burned) {
      networkRisk = 1;
      result.reasons.push(`crossAccount: network previously failed step-up against another account`);
    } else if (risk > 0) {
      result.reasons.push(`crossAccount: network used against ${distinctAccounts} distinct accounts recently`);
    }
    result.networkRisk = networkRisk;
  }

  return result;
}

function recordGlobalOutcome(intel, { device, network, outcome }) {
  if (outcome !== "failure") return;
  if (device) {
    const entry = getOrCreateEntry(intel.deviceIntel, device);
    entry.burned = true;
    entry.burnedReasons.push({ at: Date.now() });
  }
  if (network) {
    const entry = getOrCreateEntry(intel.networkIntel, network);
    entry.burned = true;
    entry.burnedReasons.push({ at: Date.now() });
  }
}

module.exports = {
  CONFIG,
  createGlobalIntel,
  recordAttempt,
  getGlobalRisk,
  recordGlobalOutcome,
};
