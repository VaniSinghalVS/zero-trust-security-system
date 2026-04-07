import React, { useState, useEffect, useRef } from "react";
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

  const [logs, setLogs] = useState([]);
  const [verified, setVerified] = useState(false);
  const [history, setHistory] = useState(() => {
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

  useEffect(() => {
    const fetchTrustScore = async () => {
      try {
        const queryParams = new URLSearchParams();
        if (data?.username) {
          queryParams.set("username", data.username);
        }

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

        setHistory((prev) => [
          ...prev.slice(-9),
          {
            time: Date.now(),
            score: currentScore,
            deviceTrust: trustComponents.deviceTrust,
            behaviorTrust: trustComponents.behaviorTrust,
            networkTrust: trustComponents.networkTrust,
            timeTrust: trustComponents.timeTrust
          }
        ]);
      } catch (error) {
        console.error("Failed to fetch trust score", error);
      }
    };

    fetchTrustScore();
    const interval = setInterval(fetchTrustScore, TRUST_SCORE_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
    };
  }, [token, data?.username]);

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

  if (currentAction === "BLOCK") {
    return (
      <AccessStatus
        mode="blocked"
        action={currentAction}
        trustScore={lockedTrust.score}
        reasons={lockedTrust.reasons || []}
      />
    );
  }

  if (currentAction === "STEP_UP_AUTH" && !verified) {
    return (
      <AccessStatus
        mode="step-up"
        action={currentAction}
        trustScore={lockedTrust.score}
        reasons={lockedTrust.reasons || []}
        onVerify={() => setVerified(true)}
      />
    );
  }

  if (trust.score < 50 && !verified) {
    return (
      <AccessStatus
        mode="denied"
        trustScore={trust.score}
        reasons={trust.reasons || []}
        onVerify={() => setVerified(true)}
      />
    );
  }

  if (verified) {
    return <AccessStatus mode="verified" />;
  }

  if (trust.score < 80) {
    return (
      <AccessStatus mode="limited" trustScore={trust.score} reasons={trust.reasons || []} />
    );
  }

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

          <div className="dimension-grid">
            {trustDimensions.map((dimension) => {
              const rawValue = resolveComponentScore(trust, dimension.key);
              const hasValue = Number.isFinite(rawValue);
              const displayValue = hasValue ? rawValue : "N/A";
              const meterValue = hasValue ? rawValue : 0;

              return (
                <div key={dimension.key} className="dimension-card">
                  <div className="dimension-label">{dimension.label}</div>
                  <div className="dimension-value" style={{ color: dimension.color }}>
                    {displayValue}
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