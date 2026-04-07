const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();

const TRUST_ACTION_THRESHOLDS = {
  block: 30,
  stepUpBase: 50,
  severeRiskMaxTrust: 90,
  moderateRiskMaxTrust: 70,
  severeRiskFailedAttempts: 3
};

const ACCESS_LEVEL_TRUST_THRESHOLDS = {
  full: 80,
  limited: 50
};

const DEFAULT_TRUST_REASON = "No active risk signals detected";

const TRUST_COMPONENT_LABELS = {
  deviceTrust: "Device trust",
  behaviorTrust: "Behavior trust",
  networkTrust: "Network trust",
  timeTrust: "Time trust"
};

const TRUST_DEMO_BASE_RANGE = {
  min: 62,
  max: 92
};

const TRUST_DEMO_COMPONENT_JITTER = 12;

const ANOMALY_SIGNAL_THRESHOLD = parseThreshold(process.env.ANOMALY_SIGNAL_THRESHOLD, 1);

const TRUST_DIMENSION_WEIGHTS = normalizeWeights({
  device: parseWeight(process.env.TRUST_WEIGHT_DEVICE, 0.35),
  behavior: parseWeight(process.env.TRUST_WEIGHT_BEHAVIOR, 0.25),
  network: parseWeight(process.env.TRUST_WEIGHT_NETWORK, 0.25),
  time: parseWeight(process.env.TRUST_WEIGHT_TIME, 0.15)
});

const userProfiles = new Map();
let logs = [];

const DATA_FILE_PATH = path.join(__dirname, "data-store.json");

function createDefaultProfile() {
  return {
    knownDevices: [],
    usualLoginTimes: {},
    typicalTrustScoreRange: { min: 100, max: 100 },
    trustHistory: []
  };
}

function normalizeProfile(profile) {
  const defaultProfile = createDefaultProfile();

  if (!profile || typeof profile !== "object") {
    return defaultProfile;
  }

  return {
    knownDevices: Array.isArray(profile.knownDevices)
      ? profile.knownDevices.filter((device) => typeof device === "string")
      : defaultProfile.knownDevices,
    usualLoginTimes:
      profile.usualLoginTimes && typeof profile.usualLoginTimes === "object"
        ? profile.usualLoginTimes
        : defaultProfile.usualLoginTimes,
    typicalTrustScoreRange:
      profile.typicalTrustScoreRange && typeof profile.typicalTrustScoreRange === "object"
        ? {
            min: Number.isFinite(Number(profile.typicalTrustScoreRange.min))
              ? Number(profile.typicalTrustScoreRange.min)
              : defaultProfile.typicalTrustScoreRange.min,
            max: Number.isFinite(Number(profile.typicalTrustScoreRange.max))
              ? Number(profile.typicalTrustScoreRange.max)
              : defaultProfile.typicalTrustScoreRange.max
          }
        : defaultProfile.typicalTrustScoreRange,
    trustHistory: Array.isArray(profile.trustHistory)
      ? profile.trustHistory
          .map((score) => Number(score))
          .filter((score) => Number.isFinite(score))
      : defaultProfile.trustHistory
  };
}

// Loads persisted logs and user profiles during startup.
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE_PATH)) {
      return;
    }

    const raw = fs.readFileSync(DATA_FILE_PATH, "utf8");
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed.logs)) {
      logs = parsed.logs;
    }

    if (parsed.userProfiles && typeof parsed.userProfiles === "object") {
      for (const [username, profile] of Object.entries(parsed.userProfiles)) {
        userProfiles.set(username, normalizeProfile(profile));
      }
    }
  } catch (error) {
    console.error("Failed to load persisted backend data:", error.message);
  }
}

// Saves logs and user profiles whenever they are updated.
function saveData() {
  try {
    const serializedProfiles = Object.fromEntries(userProfiles.entries());
    const payload = {
      logs,
      userProfiles: serializedProfiles
    };

    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save backend data:", error.message);
  }
}

function getUserProfile(username) {
  if (!userProfiles.has(username)) {
    userProfiles.set(username, createDefaultProfile());
    saveData();
  }

  return userProfiles.get(username);
}

function buildUserProfileSnapshot(profile) {
  return {
    knownDevices: [...profile.knownDevices],
    usualLoginTimes: { ...profile.usualLoginTimes },
    typicalTrustScoreRange: { ...profile.typicalTrustScoreRange }
  };
}

function parseLoginHour(time) {
  const parsedDate = time ? new Date(time) : new Date();
  const hour = parsedDate.getHours();

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return new Date().getHours();
  }

  return hour;
}

function updateUserProfile(profile, behavior) {
  const { device, time, trustScore } = behavior;

  if (device && !profile.knownDevices.includes(device)) {
    profile.knownDevices.push(device);
    if (profile.knownDevices.length > 20) {
      profile.knownDevices.shift();
    }
  }

  const hour = parseLoginHour(time);
  profile.usualLoginTimes[hour] = (profile.usualLoginTimes[hour] || 0) + 1;

  const numericTrustScore = Number(trustScore);
  if (Number.isFinite(numericTrustScore)) {
    profile.trustHistory.push(numericTrustScore);
    if (profile.trustHistory.length > 50) {
      profile.trustHistory.shift();
    }

    profile.typicalTrustScoreRange = {
      min: Math.min(...profile.trustHistory),
      max: Math.max(...profile.trustHistory)
    };
  }

  saveData();
}

function clampScore(score) {
  return Math.max(0, Math.min(100, score));
}

function parseThreshold(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function countAnomalySignals(context) {
  const signals = [
    context.anomalyDetected,
    context.suspiciousBehavior,
    context.newIP,
    context.proxyOrVpn,
    context.unknownDevice,
    context.deviceMismatch,
    context.oddTime
  ];

  return signals.filter(Boolean).length;
}

function isAnomalyDetected(context) {
  return countAnomalySignals(context) >= ANOMALY_SIGNAL_THRESHOLD;
}

function determineAction(trustScore, context) {
  if (trustScore < TRUST_ACTION_THRESHOLDS.block) {
    return "BLOCK";
  }

  const failedAttempts = Number(context.failedAttempts) || 0;
  const severeRiskSignal = Boolean(
    context.suspiciousBehavior ||
      context.deviceMismatch ||
      failedAttempts >= TRUST_ACTION_THRESHOLDS.severeRiskFailedAttempts
  );
  const moderateRiskSignal = Boolean(
    context.anomalyDetected ||
      context.newIP ||
      context.proxyOrVpn ||
      context.unknownDevice ||
      context.oddTime
  );

  if (trustScore < TRUST_ACTION_THRESHOLDS.stepUpBase) {
    return "STEP_UP_AUTH";
  }

  // Require both risk and lower confidence before forcing re-authentication.
  if (severeRiskSignal && trustScore < TRUST_ACTION_THRESHOLDS.severeRiskMaxTrust) {
    return "STEP_UP_AUTH";
  }

  if (moderateRiskSignal && trustScore < TRUST_ACTION_THRESHOLDS.moderateRiskMaxTrust) {
    return "STEP_UP_AUTH";
  }

  return "NORMAL";
}

function toBooleanQueryValue(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function buildTrustContext(req) {
  const parsedFailedAttempts =
    req.query.failedAttempts !== undefined ? Number(req.query.failedAttempts) : 0;

  return {
    newIP: toBooleanQueryValue(req.query.newIP, false),
    unknownDevice: toBooleanQueryValue(req.query.unknownDevice, false),
    oddTime: toBooleanQueryValue(req.query.oddTime, false),
    suspiciousBehavior: toBooleanQueryValue(req.query.suspiciousBehavior, false),
    anomalyDetected: toBooleanQueryValue(req.query.anomalyDetected, false),
    failedAttempts: Number.isFinite(parsedFailedAttempts) ? Math.max(0, parsedFailedAttempts) : 0,
    proxyOrVpn: toBooleanQueryValue(req.query.proxyOrVpn, false),
    deviceMismatch: toBooleanQueryValue(req.query.deviceMismatch, false)
  };
}

function parseWeight(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  if (total <= 0) {
    return {
      device: 0.35,
      behavior: 0.25,
      network: 0.25,
      time: 0.15
    };
  }

  return {
    device: weights.device / total,
    behavior: weights.behavior / total,
    network: weights.network / total,
    time: weights.time / total
  };
}

function calculateDeviceTrust(context, adaptive) {
  let score = 100;
  const reasons = [];

  if (context.unknownDevice) {
    const penalty = adaptive.knownDeviceMatch ? 15 : 40;
    score -= penalty;
    reasons.push(
      adaptive.knownDeviceMatch
        ? "Unknown device signal reduced due to known device history"
        : "Unknown device"
    );
  }

  if (context.deviceMismatch) {
    const penalty = adaptive.knownDeviceMatch ? 10 : 25;
    score -= penalty;
    reasons.push(
      adaptive.knownDeviceMatch
        ? "Device fingerprint mismatch penalty reduced for known device"
        : "Device fingerprint mismatch"
    );
  }

  return { score: clampScore(score), reasons };
}

function calculateBehaviorTrust(context) {
  let score = 100;
  const reasons = [];

  if (context.suspiciousBehavior) {
    score -= 45;
    reasons.push("Suspicious activity pattern");
  }

  const failedAttempts = Number(context.failedAttempts) || 0;
  if (failedAttempts >= 3) {
    const deduction = Math.min(30, failedAttempts * 5);
    score -= deduction;
    reasons.push(`Multiple failed attempts (${failedAttempts})`);
  }

  return { score: clampScore(score), reasons };
}

function calculateNetworkTrust(context) {
  let score = 100;
  const reasons = [];

  if (context.newIP) {
    score -= 30;
    reasons.push("New IP detected");
  }

  if (context.proxyOrVpn) {
    score -= 20;
    reasons.push("Proxy or VPN usage detected");
  }

  return { score: clampScore(score), reasons };
}

function calculateTimeTrust(context, adaptive) {
  let score = 100;
  const reasons = [];

  if (context.oddTime) {
    const penalty = adaptive.usualTimeMatch ? 6 : 20;
    score -= penalty;
    reasons.push(
      adaptive.usualTimeMatch
        ? "Unusual time penalty reduced due to repeated login pattern"
        : "Unusual login time"
    );
  }

  return { score: clampScore(score), reasons };
}

function calculateTrust(user, context, behaviorInput = {}) {
  const profile = getUserProfile(user);
  const currentHour = parseLoginHour(behaviorInput.time);
  const knownDeviceMatch = Boolean(
    behaviorInput.device && profile.knownDevices.includes(behaviorInput.device)
  );
  const usualTimeMatch = (profile.usualLoginTimes[currentHour] || 0) >= 2;

  const adaptive = {
    knownDeviceMatch,
    usualTimeMatch
  };

  const device = calculateDeviceTrust(context, adaptive);
  const behaviorTrust = calculateBehaviorTrust(context);
  const network = calculateNetworkTrust(context);
  const time = calculateTimeTrust(context, adaptive);

  const failedAttempts = Number(context.failedAttempts) || 0;
  const hasExplicitRiskSignals =
    context.anomalyDetected ||
    context.suspiciousBehavior ||
    context.newIP ||
    context.proxyOrVpn ||
    context.unknownDevice ||
    context.deviceMismatch ||
    context.oddTime ||
    failedAttempts > 0;

  // Keep demo telemetry moving even when no risk flags are present.
  if (!hasExplicitRiskSignals) {
    const base =
      TRUST_DEMO_BASE_RANGE.min +
      Math.random() * (TRUST_DEMO_BASE_RANGE.max - TRUST_DEMO_BASE_RANGE.min);
    const jitter = () => Math.round((Math.random() * 2 - 1) * TRUST_DEMO_COMPONENT_JITTER);

    device.score = clampScore(Math.round(base) + jitter());
    behaviorTrust.score = clampScore(Math.round(base) + jitter());
    network.score = clampScore(Math.round(base) + jitter());
    time.score = clampScore(Math.round(base) + jitter());
  }

  let finalTrust = Math.round(
    TRUST_DIMENSION_WEIGHTS.device * device.score +
      TRUST_DIMENSION_WEIGHTS.behavior * behaviorTrust.score +
      TRUST_DIMENSION_WEIGHTS.network * network.score +
      TRUST_DIMENSION_WEIGHTS.time * time.score
  );

  const { min, max } = profile.typicalTrustScoreRange;
  if (
    hasExplicitRiskSignals &&
    profile.trustHistory.length >= 3 &&
    finalTrust >= min &&
    finalTrust <= max
  ) {
    finalTrust = clampScore(finalTrust + 5);
  }

  const anomalyDetected = isAnomalyDetected(context);
  const action = determineAction(finalTrust, context);

  const reasons = [
    ...device.reasons.map((reason) => `deviceTrust: ${reason}`),
    ...behaviorTrust.reasons.map((reason) => `behaviorTrust: ${reason}`),
    ...network.reasons.map((reason) => `networkTrust: ${reason}`),
    ...time.reasons.map((reason) => `timeTrust: ${reason}`)
  ];

  if (!hasExplicitRiskSignals) {
    const componentEntries = [
      ["deviceTrust", device.score],
      ["behaviorTrust", behaviorTrust.score],
      ["networkTrust", network.score],
      ["timeTrust", time.score]
    ];

    const [strongestKey, strongestScore] = componentEntries.reduce((maxEntry, currentEntry) =>
      currentEntry[1] > maxEntry[1] ? currentEntry : maxEntry
    );
    const [weakestKey, weakestScore] = componentEntries.reduce((minEntry, currentEntry) =>
      currentEntry[1] < minEntry[1] ? currentEntry : minEntry
    );

    reasons.push(
      `telemetry: ${TRUST_COMPONENT_LABELS[strongestKey]} strongest (${strongestScore})`
    );
    reasons.push(
      `telemetry: ${TRUST_COMPONENT_LABELS[weakestKey]} needs attention (${weakestScore})`
    );
  }

  if (
    hasExplicitRiskSignals &&
    profile.trustHistory.length >= 3 &&
    finalTrust >= min &&
    finalTrust <= max
  ) {
    reasons.push("adaptiveLearning: Trust score aligns with typical range");
  }

  if (reasons.length === 0) {
    reasons.push(DEFAULT_TRUST_REASON);
  }

  let level = "FULL";
  if (finalTrust < ACCESS_LEVEL_TRUST_THRESHOLDS.full) level = "LIMITED";
  if (finalTrust < ACCESS_LEVEL_TRUST_THRESHOLDS.limited) level = "DENIED";

  return {
    score: finalTrust,
    finalTrust,
    level,
    action,
    anomalyDetected,
    reasons,
    deviceTrust: device.score,
    behaviorTrust: behaviorTrust.score,
    networkTrust: network.score,
    timeTrust: time.score,
    trustComponents: {
      deviceTrust: device.score,
      behaviorTrust: behaviorTrust.score,
      networkTrust: network.score,
      timeTrust: time.score
    },
    weights: TRUST_DIMENSION_WEIGHTS,
    userProfile: buildUserProfileSnapshot(profile)
  };
}

function logEvent(user, trust) {
  logs.unshift({
    user,
    score: trust.score,
    level: trust.level,
    time: new Date().toLocaleTimeString()
  });

  if (logs.length > 10) logs.pop(); // keep last 10 only
  saveData();
}

loadData();

function checkAccess(level, resource) {
  const policies = {
    FULL: ["dashboard", "admin", "data"],
    LIMITED: ["dashboard"],
    DENIED: []
  };

  return policies[level].includes(resource);
}

app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
    res.send("Backend is running");
});

const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || "mysecretkey";

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = decoded;
    next();
  });
}

// Dummy user (for now)
const user = {
    username: "admin",
    password: "1234"
};

// LOGIN API
app.post("/login", (req, res) => {
    const {
      username,
      password,
      device,
      time,
      suspiciousBehavior,
      failedAttempts,
      anomalyDetected,
      oddTime,
      newIP,
      proxyOrVpn,
      deviceMismatch,
      unknownDevice
    } = req.body;

    // Check credentials
    if (username !== user.username || password !== user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: "1h" });

    const profile = getUserProfile(username);
    const hour = parseLoginHour(time);
    const deviceLooksUnknown = !device || device.length < 10;
    const bodyFailedAttempts = Number(failedAttempts);
    const context = {
      unknownDevice:
        typeof unknownDevice === "boolean" ? unknownDevice : deviceLooksUnknown,
      deviceMismatch: typeof deviceMismatch === "boolean" ? deviceMismatch : false,
      oddTime: typeof oddTime === "boolean" ? oddTime : hour < 6 || hour > 22,
      suspiciousBehavior: typeof suspiciousBehavior === "boolean" ? suspiciousBehavior : false,
      failedAttempts: Number.isFinite(bodyFailedAttempts) ? Math.max(0, bodyFailedAttempts) : 0,
      newIP: typeof newIP === "boolean" ? newIP : false,
      proxyOrVpn: typeof proxyOrVpn === "boolean" ? proxyOrVpn : false,
      anomalyDetected: typeof anomalyDetected === "boolean" ? anomalyDetected : false
    };

    if (device && profile.knownDevices.includes(device)) {
      context.unknownDevice = false;
    }

    const trust = calculateTrust(username, context, { device, time });
    updateUserProfile(profile, { device, time, trustScore: trust.score });

    // Send response
    res.json({
        username,
        token,
        trustScore: trust.score,
        accessLevel: trust.level,
      action: trust.action,
      anomalyDetected: trust.anomalyDetected,
        riskContext: context,
        reasons: trust.reasons,
        userProfile: buildUserProfileSnapshot(profile)
    });
});

app.get("/api/trust-score", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  const username = req.query.username || "user";
  const device = req.query.device || req.headers["user-agent"] || "unknown-device";
  const time = req.query.time || new Date().toISOString();

  const profile = getUserProfile(username);
  const context = buildTrustContext(req);

  const trust = calculateTrust(username, context, { device, time });

  updateUserProfile(profile, {
    device,
    time,
    trustScore: trust.score
  });

  trust.userProfile = buildUserProfileSnapshot(profile);

  logEvent(username, trust);

  res.json(trust);
});

app.get("/api/admin", authenticateToken, (req, res) => {
  const trust = calculateTrust("user", {});

  if (!checkAccess(trust.level, "admin")) {
    return res.status(403).json({ msg: "Access Denied" });
  }

  res.json({ msg: "Welcome Admin" });
});

app.get("/api/secure-data", authenticateToken, (req, res) => {
  const username = req.user?.username || "user";
  const device = req.query.device || req.headers["user-agent"] || "unknown-device";
  const time = req.query.time || new Date().toISOString();
  const trust = calculateTrust(username, buildTrustContext(req), { device, time });

  if (trust.action === "BLOCK") {
    return res.status(403).json({
      action: trust.action,
      message: "Access temporarily blocked due to low trust"
    });
  }

  if (trust.action === "STEP_UP_AUTH") {
    return res.status(401).json({
      action: trust.action,
      message: "Step-up authentication required"
    });
  }

  res.json({
    action: trust.action,
    data: "Sensitive Data"
  });
});

app.get("/api/logs", (req, res) => {
  res.json(logs);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
