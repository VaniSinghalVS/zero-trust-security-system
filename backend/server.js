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
    trustHistory: [],
    deviceEvidence: {},
    networkEvidence: {},
    dimensionReliability: { device: 1.0, behavior: 1.0, network: 1.0, time: 1.0 },
    pendingStepUps: []
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
      : defaultProfile.trustHistory,
    deviceEvidence:
      profile.deviceEvidence && typeof profile.deviceEvidence === "object"
        ? profile.deviceEvidence
        : defaultProfile.deviceEvidence,
    networkEvidence:
      profile.networkEvidence && typeof profile.networkEvidence === "object"
        ? profile.networkEvidence
        : defaultProfile.networkEvidence,
    dimensionReliability:
      profile.dimensionReliability && typeof profile.dimensionReliability === "object"
        ? {
            device: Number.isFinite(Number(profile.dimensionReliability.device)) ? Number(profile.dimensionReliability.device) : defaultProfile.dimensionReliability.device,
            behavior: Number.isFinite(Number(profile.dimensionReliability.behavior)) ? Number(profile.dimensionReliability.behavior) : defaultProfile.dimensionReliability.behavior,
            network: Number.isFinite(Number(profile.dimensionReliability.network)) ? Number(profile.dimensionReliability.network) : defaultProfile.dimensionReliability.network,
            time: Number.isFinite(Number(profile.dimensionReliability.time)) ? Number(profile.dimensionReliability.time) : defaultProfile.dimensionReliability.time
          }
        : defaultProfile.dimensionReliability,
    pendingStepUps: Array.isArray(profile.pendingStepUps)
      ? profile.pendingStepUps
      : defaultProfile.pendingStepUps
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
    typicalTrustScoreRange: { ...profile.typicalTrustScoreRange },
    deviceEvidence: { ...profile.deviceEvidence },
    networkEvidence: { ...profile.networkEvidence },
    dimensionReliability: { ...profile.dimensionReliability },
    pendingStepUps: [...profile.pendingStepUps]
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
  const { device, time, trustScore, ip } = behavior;

  if (device && !profile.knownDevices.includes(device)) {
    profile.knownDevices.push(device);
    if (profile.knownDevices.length > 20) {
      profile.knownDevices.shift();
    }
  }

  if (device) {
    if (!profile.deviceEvidence[device]) {
       profile.deviceEvidence[device] = { seenCount: 0, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), status: "quarantined", stepUpSuccesses: 0 };
    }
    profile.deviceEvidence[device].seenCount += 1;
    profile.deviceEvidence[device].lastSeen = new Date().toISOString();
  }

  if (ip) {
    if (!profile.networkEvidence[ip]) {
       profile.networkEvidence[ip] = { seenCount: 0, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), status: "quarantined", stepUpSuccesses: 0 };
    }
    profile.networkEvidence[ip].seenCount += 1;
    profile.networkEvidence[ip].lastSeen = new Date().toISOString();
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

function computeBaseScore(familiarity, confidence) {
  return Math.round(50 + (familiarity - 0.5) * 2 * 50 * confidence);
}

function calculateDeviceTrust(context, familiarity, confidence) {
  let score = computeBaseScore(familiarity, confidence);
  const reasons = [];

  if (context.unknownDevice) {
    const penalty = familiarity > 0.5 ? 15 : 40;
    score -= penalty;
    reasons.push(
      familiarity > 0.5
        ? "Unknown device signal reduced due to device familiarity"
        : "Unknown device"
    );
  }

  if (context.deviceMismatch) {
    const penalty = familiarity > 0.5 ? 10 : 25;
    score -= penalty;
    reasons.push(
      familiarity > 0.5
        ? "Device fingerprint mismatch penalty reduced due to device familiarity"
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

function calculateNetworkTrust(context, familiarity, confidence) {
  let score = computeBaseScore(familiarity, confidence);
  const reasons = [];

  if (context.newIP) {
    const penalty = familiarity > 0.5 ? 10 : 30;
    score -= penalty;
    reasons.push("New IP detected");
  }

  if (context.proxyOrVpn) {
    score -= 20;
    reasons.push("Proxy or VPN usage detected");
  }

  return { score: clampScore(score), reasons };
}

function calculateTimeTrust(context, familiarity, confidence) {
  let score = computeBaseScore(familiarity, confidence);
  const reasons = [];

  if (context.oddTime) {
    const penalty = familiarity > 0.5 ? 6 : 20;
    score -= penalty;
    reasons.push(
      familiarity > 0.5
        ? "Unusual time penalty reduced due to repeated login pattern"
        : "Unusual login time"
    );
  }

  return { score: clampScore(score), reasons };
}

function calculateTrust(user, context, behaviorInput = {}) {
  const profile = getUserProfile(user);

  const totalDeviceEvidence = Object.values(profile.deviceEvidence || {})
    .filter(d => d.status === "trusted")
    .reduce((sum, d) => sum + (d.seenCount || 0), 0) + profile.knownDevices.length;
  const totalNetworkEvidence = Object.values(profile.networkEvidence || {})
    .filter(n => n.status === "trusted")
    .reduce((sum, n) => sum + (n.seenCount || 0), 0);
  const totalTimeEvidence = Object.values(profile.usualLoginTimes || {}).reduce((sum, count) => sum + count, 0);

  const deviceEntry = behaviorInput.device && profile.deviceEvidence && profile.deviceEvidence[behaviorInput.device];
  const deviceCount = deviceEntry && deviceEntry.status === "trusted" 
    ? deviceEntry.seenCount 
    : (behaviorInput.device && profile.knownDevices.includes(behaviorInput.device) ? 1 : 0);
  const deviceFamiliarity = Math.min(1, deviceCount / 10);
  const deviceConfidence = Math.min(1, totalDeviceEvidence / 5);

  const networkEntry = behaviorInput.ip && profile.networkEvidence && profile.networkEvidence[behaviorInput.ip];
  const networkCount = networkEntry && networkEntry.status === "trusted"
    ? networkEntry.seenCount
    : 0;
  const networkFamiliarity = Math.min(1, networkCount / 10);
  const networkConfidence = Math.min(1, totalNetworkEvidence / 5);

  const currentHour = parseLoginHour(behaviorInput.time);
  const timeCount = profile.usualLoginTimes[currentHour] || 0;
  const timeFamiliarity = Math.min(1, timeCount / 10);
  const timeConfidence = Math.min(1, totalTimeEvidence / 5);

  const device = calculateDeviceTrust(context, deviceFamiliarity, deviceConfidence);
  const behaviorTrust = calculateBehaviorTrust(context);
  const network = calculateNetworkTrust(context, networkFamiliarity, networkConfidence);
  const time = calculateTimeTrust(context, timeFamiliarity, timeConfidence);

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

  const unnormalizedWeights = {
    device: TRUST_DIMENSION_WEIGHTS.device * deviceConfidence * profile.dimensionReliability.device,
    behavior: TRUST_DIMENSION_WEIGHTS.behavior * 1.0 * profile.dimensionReliability.behavior,
    network: TRUST_DIMENSION_WEIGHTS.network * networkConfidence * profile.dimensionReliability.network,
    time: TRUST_DIMENSION_WEIGHTS.time * timeConfidence * profile.dimensionReliability.time
  };
  const dynamicWeights = normalizeWeights(unnormalizedWeights);

  let finalTrust = Math.round(
    dynamicWeights.device * device.score +
      dynamicWeights.behavior * behaviorTrust.score +
      dynamicWeights.network * network.score +
      dynamicWeights.time * time.score
  );

  const dims = [
    { score: device.score, confidence: deviceConfidence },
    { score: behaviorTrust.score, confidence: 1.0 },
    { score: network.score, confidence: networkConfidence },
    { score: time.score, confidence: timeConfidence }
  ];

  const moderateDims = dims.filter(d => d.score >= 50 && d.score <= 85);
  let compoundPenaltyReason = null;
  let compoundPenalty = 0;
  if (moderateDims.length >= 2) {
    const avgConfidence = moderateDims.reduce((sum, d) => sum + d.confidence, 0) / moderateDims.length;
    compoundPenalty = Math.round(Math.min(15, 5 * (moderateDims.length - 1)) * avgConfidence);
    if (compoundPenalty > 0) {
      finalTrust -= compoundPenalty;
      compoundPenaltyReason = `Compound risk: multiple moderate risk signals detected (Penalty: -${compoundPenalty})`;
    }
  }

  const { min, max } = profile.typicalTrustScoreRange;
  if (
    !compoundPenaltyReason &&
    hasExplicitRiskSignals &&
    profile.trustHistory.length >= 3 &&
    finalTrust >= min &&
    finalTrust <= max
  ) {
    finalTrust = clampScore(finalTrust + 5);
  }

  const anomalyDetected = isAnomalyDetected(context);
  let action = determineAction(finalTrust, context);

  const reasons = [
    ...device.reasons.map((reason) => `deviceTrust: ${reason}`),
    ...behaviorTrust.reasons.map((reason) => `behaviorTrust: ${reason}`),
    ...network.reasons.map((reason) => `networkTrust: ${reason}`),
    ...time.reasons.map((reason) => `timeTrust: ${reason}`)
  ];

  if (compoundPenaltyReason) {
    reasons.push(compoundPenaltyReason);
  }

  if (
    !compoundPenaltyReason &&
    hasExplicitRiskSignals &&
    profile.trustHistory.length >= 3 &&
    finalTrust >= min &&
    finalTrust <= max
  ) {
    reasons.push("adaptiveLearning: Trust score aligns with typical range");
  }

  let level = "FULL";
  if (finalTrust < ACCESS_LEVEL_TRUST_THRESHOLDS.full) level = "LIMITED";
  if (finalTrust < ACCESS_LEVEL_TRUST_THRESHOLDS.limited) level = "DENIED";

  const overallConfidence = Math.min(
    deviceConfidence,
    networkConfidence,
    timeConfidence
  );

  if (overallConfidence < 0.3) {
    if (level === "FULL") {
      level = "LIMITED";
      reasons.push("Cold start: level capped at LIMITED due to low evidence confidence");
    } else if (level === "DENIED") {
      level = "LIMITED";
      reasons.push("Cold start: level raised to LIMITED due to low evidence confidence");
    }

    if (action === "NORMAL") {
      action = "STEP_UP_AUTH";
      reasons.push("Cold start: action escalated to STEP_UP_AUTH due to low evidence confidence");
    } else if (action === "BLOCK") {
      action = "STEP_UP_AUTH";
      reasons.push("Cold start: action reduced to STEP_UP_AUTH due to low evidence confidence");
    }
  }

  if (reasons.length === 0) {
    reasons.push(DEFAULT_TRUST_REASON);
  }

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
    weights: dynamicWeights,
    dynamicWeights,
    confidence: {
      device: deviceConfidence,
      behavior: 1.0,
      network: networkConfidence,
      time: timeConfidence,
      overall: overallConfidence
    },
    compoundPenalty,
    quarantineStatus: {
      device: deviceEntry ? deviceEntry.status : "new",
      network: networkEntry ? networkEntry.status : "new"
    },
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

    const ip = req.ip || (req.connection && req.connection.remoteAddress) || "unknown-ip";
    const trust = calculateTrust(username, context, { device, time, ip });
    updateUserProfile(profile, { device, time, trustScore: trust.score, ip });

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

  const ip = req.ip || (req.connection && req.connection.remoteAddress) || "unknown-ip";
  const profile = getUserProfile(username);
  const context = buildTrustContext(req);

  const trust = calculateTrust(username, context, { device, time, ip });

  updateUserProfile(profile, {
    device,
    time,
    trustScore: trust.score,
    ip
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

app.post("/api/step-up-confirm", (req, res) => {
  const { username, dimension, value, passed } = req.body;
  if (!username || !dimension || !value) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const profile = getUserProfile(username);
  let evidenceMap;
  if (dimension === "device") {
    evidenceMap = profile.deviceEvidence;
  } else if (dimension === "network") {
    evidenceMap = profile.networkEvidence;
  } else {
    return res.status(400).json({ error: "Invalid dimension" });
  }

  if (evidenceMap && evidenceMap[value]) {
    const entry = evidenceMap[value];
    if (passed === true) {
      entry.stepUpSuccesses = (entry.stepUpSuccesses || 0) + 1;
      if (entry.stepUpSuccesses >= 2) {
        entry.status = "trusted";
      }
    } else if (passed === false) {
      profile.dimensionReliability[dimension] = Math.max(0.5, (profile.dimensionReliability[dimension] || 1.0) - 0.1);
    }
  }

  profile.pendingStepUps.push({
    dimension,
    passed,
    timestamp: new Date().toISOString()
  });

  if (profile.pendingStepUps.length > 30) {
    profile.pendingStepUps.shift();
  }

  saveData();

  res.json({
    userProfile: buildUserProfileSnapshot(profile)
  });
});

app.get("/api/logs", (req, res) => {
  res.json(logs);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
