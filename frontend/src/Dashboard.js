import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import "./Dashboard.css";
import TrustScoreCard from "./components/TrustScoreCard";
import AccessStatus from "./components/AccessStatus";
import TrustGraph from "./components/TrustGraph";
import ActivityLogs from "./components/ActivityLogs";
import {
  API_BASE_URL,
  ALERT_AUTO_HIDE_MS,
  TRUST_DROP_ALERT_THRESHOLD,
  TRUST_SCORE_POLL_INTERVAL_MS
} from "./config/dashboardConfig";

function Dashboard() {
  const clampScore = (value) => Math.max(0, Math.min(100, value));

  const getTrustComponents = (trustData) => {
    const componentKeys = ["deviceTrust", "behaviorTrust", "networkTrust", "timeTrust"];
    const explicit = componentKeys.reduce((acc, key) => {
      const topLevel = Number(trustData?.[key]);
      if (Number.isFinite(topLevel)) {
        acc[key] = clampScore(topLevel);
        return acc;
      }

      const nested = Number(trustData?.trustComponents?.[key]);
      if (Number.isFinite(nested)) {
        acc[key] = clampScore(nested);
        return acc;
      }

      acc[key] = null;
      return acc;
    }, {});

    const hasMissing = componentKeys.some((key) => explicit[key] === null);
    if (!hasMissing) {
      return explicit;
    }

    const baseScore = Number(trustData?.score);
    if (!Number.isFinite(baseScore)) {
      return explicit;
    }

    const reasonText = Array.isArray(trustData?.reasons)
      ? trustData.reasons.join(" ").toLowerCase()
      : "";

    const derived = {
      deviceTrust: baseScore + 6,
      behaviorTrust: baseScore - 6,
      networkTrust: baseScore - 2,
      timeTrust: baseScore + 2
    };

    if (reasonText.includes("unknown device") || reasonText.includes("fingerprint")) {
      derived.deviceTrust -= 18;
    }
    if (reasonText.includes("suspicious") || reasonText.includes("failed attempts")) {
      derived.behaviorTrust -= 22;
    }
    if (reasonText.includes("new ip") || reasonText.includes("proxy") || reasonText.includes("vpn")) {
      derived.networkTrust -= 20;
    }
    if (reasonText.includes("unusual login time") || reasonText.includes("unusual time")) {
      derived.timeTrust -= 16;
    }

    componentKeys.forEach((key) => {
      derived[key] = clampScore(derived[key]);
    });

    return {
      deviceTrust: explicit.deviceTrust ?? derived.deviceTrust,
      behaviorTrust: explicit.behaviorTrust ?? derived.behaviorTrust,
      networkTrust: explicit.networkTrust ?? derived.networkTrust,
      timeTrust: explicit.timeTrust ?? derived.timeTrust
    };
  };

  const resolveComponentScore = (trustData, key) => getTrustComponents(trustData)[key];

  const generateStatusFactors = (mode, trustData) => {
    const components = getTrustComponents(trustData);
    const factorMeta = [
      { key: "deviceTrust", label: "Device Trust" },
      { key: "behaviorTrust", label: "Behavior Trust" },
      { key: "networkTrust", label: "Network Trust" },
      { key: "timeTrust", label: "Time Trust" }
    ];

    return factorMeta.map(({ key, label }) => {
      const rawScore = Number(components[key]);
      const score = Number.isFinite(rawScore) ? clampScore(rawScore) : 0;

      let status = "Stable";
      if (score < 60) {
        status = "High Risk";
      } else if (score < 80) {
        status = "Watch";
      }

      let modeHint = "Normal operation";
      if (mode === "STEP_UP_AUTH") {
        modeHint = "Step-up required";
      } else if (mode === "BLOCK") {
        modeHint = "Blocked";
      } else if (mode === "LIMITED") {
        modeHint = "Restricted access";
      } else if (mode === "DENIED") {
        modeHint = "Access denied";
      }

      return `${label}: ${score} (${status}) - ${modeHint}`;
    });
  };

  const trustDimensions = [
    { key: "deviceTrust", label: "Device Trust", color: "#8b5cf6" },
    { key: "behaviorTrust", label: "Behavior Trust", color: "#f97316" },
    { key: "networkTrust", label: "Network Trust", color: "#0ea5e9" },
    { key: "timeTrust", label: "Time Trust", color: "#22c55e" }
  ];

  const location = useLocation();
  const data = location.state;

  const initialScore = clampScore(Number(data?.trustScore) || 100);
  const initialTrust = {
    score: initialScore,
    reasons: data?.reasons || [],
    level: data?.accessLevel || "FULL",
    action: data?.action || "NORMAL",
    anomalyDetected: Boolean(data?.anomaly || data?.anomalyDetected)
  };

  const initialRiskContext = data?.riskContext || null;

  const [trust, setTrust] = useState(() => initialTrust);
  const [simulatedDevice, setSimulatedDevice] = useState("");
  const [deviceInputValue, setDeviceInputValue] = useState("");

  const [logs, setLogs] = useState([]);
  const [verified, setVerified] = useState(false);
  const [history, setHistory] = useState(() => {
    // Seed from server-persisted trustHistory if present; fall back to single login point.
    const serverHistory = data?.userProfile?.trustHistory;
    if (Array.isArray(serverHistory) && serverHistory.length > 0) {
      const now = Date.now();
      return serverHistory.map((score, i) => ({
        time: now - (serverHistory.length - 1 - i) * 30000,
        score: Math.max(0, Math.min(100, Number(score)))
      }));
    }
    const initialComponents = getTrustComponents(initialTrust);
    return [
      {
        time: Date.now(),
        score: initialScore,
        deviceTrust: initialComponents.deviceTrust,
        behaviorTrust: initialComponents.behaviorTrust,
        networkTrust: initialComponents.networkTrust,
        timeTrust: initialComponents.timeTrust
      }
    ];
  });
  const [showDropAlert, setShowDropAlert] = useState(false);
  const [isAnomalyDetected, setIsAnomalyDetected] = useState(false);
  const [statusFactors, setStatusFactors] = useState(() =>
    generateStatusFactors(initialTrust.action || initialTrust.level || "NORMAL", initialTrust)
  );

  const previousScoreRef = useRef(null);
  const alertTimeoutRef = useRef(null);

  const token = data?.token || localStorage.getItem("token");
  const authHeaders = token
    ? {
      Authorization: `Bearer ${token}`
    }
    : {};

  const fetchTrustScore = useCallback(async (overrideDevice) => {
    try {
      const queryParams = new URLSearchParams();
      if (data?.username) {
        queryParams.set("username", data.username);
      }

      const effectiveDevice = overrideDevice || simulatedDevice || navigator.userAgent;
      queryParams.set("device", effectiveDevice);

      if (initialRiskContext) {
        const booleanKeys = [
          "newIP",
          "unknownDevice",
          "oddTime",
          "suspiciousBehavior",
          "anomalyDetected",
          "proxyOrVpn",
          "deviceMismatch"
        ];

        booleanKeys.forEach((key) => {
          if (typeof initialRiskContext[key] === "boolean") {
            queryParams.set(key, String(initialRiskContext[key]));
          }
        });

        if (Number.isFinite(Number(initialRiskContext.failedAttempts))) {
          queryParams.set("failedAttempts", String(Number(initialRiskContext.failedAttempts)));
        }
      }

      queryParams.set("_ts", String(Date.now()));

      const querySuffix = queryParams.toString() ? `?${queryParams.toString()}` : "";
      const response = await fetch(`${API_BASE_URL}/api/trust-score${querySuffix}`, {
        headers: {
          ...authHeaders,
          "Cache-Control": "no-cache"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Trust API failed with status ${response.status}`);
      }

      const trustData = await response.json();
      const trustComponents = getTrustComponents(trustData);
      const previousScore = previousScoreRef.current;
      const currentScore = clampScore(Number(trustData?.score) || 0);

      if (previousScore !== null && previousScore - currentScore > TRUST_DROP_ALERT_THRESHOLD) {
        setShowDropAlert(true);

        if (alertTimeoutRef.current) {
          clearTimeout(alertTimeoutRef.current);
        }

        alertTimeoutRef.current = setTimeout(() => {
          setShowDropAlert(false);
        }, ALERT_AUTO_HIDE_MS);
      }

      const anomalyFlag = Boolean(trustData?.anomaly || trustData?.anomalyDetected);
      setIsAnomalyDetected(anomalyFlag);

      previousScoreRef.current = currentScore;
      setTrust((prev) => {
        const incomingReasons = Array.isArray(trustData?.reasons) ? trustData.reasons : [];
        const reasons = incomingReasons.length > 0 ? incomingReasons : prev.reasons || [];

        return {
          ...trustData,
          score: currentScore,
          reasons,
          level: trustData?.level || "FULL",
          action: trustData?.action || "NORMAL",
          anomalyDetected: anomalyFlag
        };
      });

      // Rebuild history from the server-persisted trustHistory on every poll,
      // so the graph always reflects the full cross-session record.
      const serverHistory = trustData?.userProfile?.trustHistory;
      if (Array.isArray(serverHistory) && serverHistory.length > 0) {
        const now = Date.now();
        setHistory(
          serverHistory.map((s, i) => ({
            time: now - (serverHistory.length - 1 - i) * 30000,
            score: Math.max(0, Math.min(100, Number(s))),
            deviceTrust: trustComponents.deviceTrust,
            behaviorTrust: trustComponents.behaviorTrust,
            networkTrust: trustComponents.networkTrust,
            timeTrust: trustComponents.timeTrust
          }))
        );
      } else {
        setHistory((prev) => [
          ...prev.slice(-49),
          {
            time: Date.now(),
            score: currentScore,
            deviceTrust: trustComponents.deviceTrust,
            behaviorTrust: trustComponents.behaviorTrust,
            networkTrust: trustComponents.networkTrust,
            timeTrust: trustComponents.timeTrust
          }
        ]);
      }
    } catch (error) {
      console.error("Failed to fetch trust score", error);
    }
  }, [token, data?.username, simulatedDevice]);

  useEffect(() => {
    fetchTrustScore();
    const interval = setInterval(() => fetchTrustScore(), TRUST_SCORE_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
    };
  }, [fetchTrustScore]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/logs`, { headers: authHeaders })
      .then((res) => res.json())
      .then((logsData) => setLogs(logsData));
  }, [token]);

  const strictActions = ["BLOCK", "STEP_UP_AUTH"];
  const loginAction = data?.action;
  const shouldLockToLoginAction = !verified && strictActions.includes(loginAction);
  const currentAction = shouldLockToLoginAction
    ? loginAction
    : trust.action || loginAction || "NORMAL";

  const lockedTrust = shouldLockToLoginAction
    ? {
      ...trust,
      score: clampScore(Number(data?.trustScore) || trust.score),
      reasons:
        Array.isArray(data?.reasons) && data.reasons.length > 0 ? data.reasons : trust.reasons || [],
      level: data?.accessLevel || trust.level,
      action: loginAction || trust.action
    }
    : trust;

  const uiMode =
    currentAction === "BLOCK" || currentAction === "STEP_UP_AUTH"
      ? currentAction
      : lockedTrust.level || "FULL";

  useEffect(() => {
    setStatusFactors(generateStatusFactors(uiMode, lockedTrust));
  }, [uiMode, lockedTrust.score, lockedTrust.deviceTrust, lockedTrust.behaviorTrust, lockedTrust.networkTrust, lockedTrust.timeTrust]);

  if (!data) return <h2>No Data</h2>;

  const accessBannerMode =
    currentAction === "BLOCK" ? "blocked"
    : currentAction === "STEP_UP_AUTH" && !verified ? "step-up"
    : trust.score < 50 && !verified ? "denied"
    : trust.score < 80 ? "limited"
    : null;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Zero Trust Dashboard</h1>
        <p className="dashboard-subtitle">Real-time Security Monitoring & Access Management</p>
      </div>

      {isAnomalyDetected && (
        <div className="trust-alert-banner trust-alert-banner-anomaly" role="alert" aria-live="assertive">
          <span className="trust-alert-icon">🚨</span>
          <span className="trust-alert-text">Anomalous behavior detected</span>
        </div>
      )}

      {showDropAlert && !isAnomalyDetected && (
        <div className="trust-alert-banner" role="alert" aria-live="assertive">
          <span className="trust-alert-icon">⚠️</span>
          <span className="trust-alert-text">Suspicious activity detected</span>
        </div>
      )}

      {accessBannerMode && (
        <div style={{ marginBottom: "16px" }}>
          <AccessStatus
            mode={accessBannerMode}
            action={currentAction}
            trustScore={lockedTrust.score}
            reasons={lockedTrust.reasons || []}
            onVerify={accessBannerMode === "step-up" || accessBannerMode === "denied" ? () => setVerified(true) : undefined}
          />
        </div>
      )}

      <div className="dashboard-wrapper">
        <div className="card">
          <div className="card-title">
            <span className="card-icon">🛡️</span>
            Trust Score Overview
          </div>

          <div className="trust-score-grid">
            <TrustScoreCard score={trust.score} />
            <AccessStatus mode="full" level={trust.level} />
          </div>

          {statusFactors.length > 0 && (
            <div style={{ marginTop: "20px" }}>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: "#666",
                  marginBottom: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}
              >
                Status Factors
              </div>
              <ul className="reasons-list">
                {statusFactors.map((factor, index) => (
                  <li key={index}>{factor}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <span className="card-icon">🧩</span>
            Multi-Dimensional Trust
          </div>

          {/* Dynamic Weights Row */}
          {trust.dynamicWeights && (
            <div style={{ marginTop: "16px", fontSize: "0.78rem", color: "#888", display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "#555" }}>Adaptive weights:</span>
              <span>Device {Math.round((trust.dynamicWeights.device || 0) * 100)}%</span>
              <span>·</span>
              <span>Behavior {Math.round((trust.dynamicWeights.behavior || 0) * 100)}%</span>
              <span>·</span>
              <span>Network {Math.round((trust.dynamicWeights.network || 0) * 100)}%</span>
              <span>·</span>
              <span>Time {Math.round((trust.dynamicWeights.time || 0) * 100)}%</span>
            </div>
          )}

          {/* Simulate New Device */}
          <div style={{ marginTop: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="simulate-device-input"
              type="text"
              placeholder="Simulate new device string…"
              value={deviceInputValue}
              onChange={(e) => setDeviceInputValue(e.target.value)}
              style={{ flex: 1, minWidth: "180px", padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.85rem" }}
            />
            <button
              id="simulate-device-btn"
              onClick={() => {
                setSimulatedDevice(deviceInputValue.trim() || "");
                fetchTrustScore(deviceInputValue.trim() || undefined);
              }}
              style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: "0.85rem" }}
            >
              Simulate new device
            </button>
            {simulatedDevice && (
              <button
                id="reset-device-btn"
                onClick={() => { setSimulatedDevice(""); setDeviceInputValue(""); }}
                style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", background: "transparent", cursor: "pointer", fontSize: "0.8rem", color: "#888" }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Step-up trigger button — visible whenever any dimension is unverified */}
          {trust.quarantineStatus && (
            trust.quarantineStatus.device === "quarantined" ||
            trust.quarantineStatus.device === "new" ||
            trust.quarantineStatus.network === "quarantined" ||
            trust.quarantineStatus.network === "new"
          ) && (
            <div style={{ marginTop: "12px" }}>
              <button
                id="step-up-btn"
                onClick={async () => {
                  const quarantine = trust.quarantineStatus || {};
                  const dimension =
                    quarantine.device === "quarantined" || quarantine.device === "new"
                      ? "device"
                      : "network";
                  const value =
                    dimension === "device"
                      ? (simulatedDevice || navigator.userAgent)
                      : (trust.userProfile?.networkEvidence
                          ? Object.keys(trust.userProfile.networkEvidence)[0]
                          : "unknown-ip");
                  try {
                    await fetch(`${API_BASE_URL}/api/step-up-confirm`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ username: data?.username, dimension, value, passed: true })
                    });
                    fetchTrustScore(simulatedDevice || undefined);
                  } catch (err) {
                    console.error("Step-up confirm failed", err);
                  }
                }}
                style={{ padding: "8px 18px", borderRadius: "6px", border: "none", background: "#f59e0b", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}
              >
                🔐 Simulate step-up authentication
              </button>
            </div>
          )}

          <div className="dimension-grid">
            {trustDimensions.map((dimension) => {
              const rawValue = resolveComponentScore(trust, dimension.key);
              const hasValue = Number.isFinite(rawValue);
              const displayValue = hasValue ? rawValue : "N/A";
              const meterValue = hasValue ? rawValue : 0;

              return (
                <div key={dimension.key} className="dimension-card">
                  <div className="dimension-label">
                    {dimension.label}
                    {/* Quarantine badge for device and network */}
                    {dimension.key === "deviceTrust" && trust.quarantineStatus && (trust.quarantineStatus.device === "quarantined" || trust.quarantineStatus.device === "new") && (
                      <span id="quarantine-badge-device" style={{ marginLeft: "8px", fontSize: "0.68rem", background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24", borderRadius: "4px", padding: "1px 6px", verticalAlign: "middle" }}>⚠ Unverified — pending step-up</span>
                    )}
                    {dimension.key === "deviceTrust" && trust.quarantineStatus?.device === "trusted" && (
                      <span style={{ marginLeft: "8px", fontSize: "0.68rem", color: "#16a34a" }}>✓ Verified</span>
                    )}
                    {dimension.key === "networkTrust" && trust.quarantineStatus && (trust.quarantineStatus.network === "quarantined" || trust.quarantineStatus.network === "new") && (
                      <span id="quarantine-badge-network" style={{ marginLeft: "8px", fontSize: "0.68rem", background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24", borderRadius: "4px", padding: "1px 6px", verticalAlign: "middle" }}>⚠ Unverified — pending step-up</span>
                    )}
                    {dimension.key === "networkTrust" && trust.quarantineStatus?.network === "trusted" && (
                      <span style={{ marginLeft: "8px", fontSize: "0.68rem", color: "#16a34a" }}>✓ Verified</span>
                    )}
                  </div>
                  <div className="dimension-value" style={{ color: dimension.color }}>
                    {displayValue}
                    {/* Confidence sub-label */}
                    {trust.confidence && (() => {
                      const confKey = dimension.key.replace("Trust", "");
                      const confVal = trust.confidence[confKey];
                      return Number.isFinite(confVal) ? (
                        <span style={{ fontSize: "0.72rem", color: "#999", marginLeft: "6px", fontWeight: 400 }}>
                          (confidence: {confVal.toFixed(2)})
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="dimension-meter">
                    <div
                      className="dimension-meter-fill"
                      style={{ width: `${meterValue}%`, backgroundColor: dimension.color }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span className="card-icon">📈</span>
            Trust Score Trend
          </div>
          <TrustGraph history={history} />
        </div>

        <div className="card">
          <div className="card-title">
            <span className="card-icon">📋</span>
            Activity Logs
          </div>
          <ActivityLogs logs={logs} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;