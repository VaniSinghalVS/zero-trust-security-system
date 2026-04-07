import React from "react";

function AccessStatus({ mode, level, action, trustScore, reasons = [], onVerify }) {
  if (mode === "step-up") {
    return (
      <div className="denial-container">
        <div className="denial-card" style={{ borderTopColor: "#f59e0b", borderTop: "6px solid #f59e0b" }}>
          <div className="denial-icon">🟡</div>
          <h2 style={{ color: "#f59e0b", fontSize: "2rem", fontWeight: 700, marginBottom: "16px" }}>
            Step-Up Authentication Required
          </h2>
          <p className="denial-subtitle">The backend flagged this session for re-authentication.</p>

          <div
            style={{
              background: "#fffbeb",
              borderLeftColor: "#f59e0b",
              borderLeft: "4px solid #f59e0b",
              padding: "16px",
              borderRadius: "8px",
              fontSize: "0.95rem",
              color: "#92400e",
              lineHeight: 1.6,
              marginBottom: "28px"
            }}
          >
            <strong>Current Trust Score: {trustScore}</strong>
            <p style={{ marginBottom: "8px", marginTop: "12px" }}>
              <strong>Reasons:</strong>
            </p>
            {reasons.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                {reasons.map((reason, index) => (
                  <li key={index} style={{ marginBottom: "4px" }}>
                    {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: "8px 0" }}>Re-authentication is required before continuing.</p>
            )}
          </div>

          <button className="danger-btn" onClick={onVerify} style={{ marginTop: "20px" }}>
            Re-authenticate
          </button>
        </div>
      </div>
    );
  }

  if (mode === "blocked") {
    return (
      <div className="denial-container">
        <div className="denial-card" style={{ borderTopColor: "#dc2626", borderTop: "6px solid #dc2626" }}>
          <div className="denial-icon">⛔</div>
          <h2 style={{ color: "#dc2626", fontSize: "2rem", fontWeight: 700, marginBottom: "16px" }}>
            Access Blocked
          </h2>
          <p className="denial-subtitle">Temporary block enforced by the backend.</p>

          <div
            style={{
              background: "#fef2f2",
              borderLeftColor: "#dc2626",
              borderLeft: "4px solid #dc2626",
              padding: "16px",
              borderRadius: "8px",
              fontSize: "0.95rem",
              color: "#991b1b",
              lineHeight: 1.6,
              marginBottom: "28px"
            }}
          >
            <strong>Current Trust Score: {trustScore}</strong>
            <p style={{ marginBottom: "8px", marginTop: "12px" }}>
              <strong>Reasons for Block:</strong>
            </p>
            {reasons.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                {reasons.map((reason, index) => (
                  <li key={index} style={{ marginBottom: "4px" }}>
                    {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: "8px 0" }}>Access is temporarily blocked.</p>
            )}
          </div>

          <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 0 }}>
            Wait for the block to expire or reduce risk signals before trying again.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "denied") {
    return (
      <div className="denial-container">
        <div className="denial-card">
          <div className="denial-icon">🔴</div>
          <h2 className="denial-title">Access Denied</h2>
          <p className="denial-subtitle">Trust Score Too Low</p>

          <div className="denial-details">
            <strong>Current Trust Score: {trustScore}</strong>
            <p style={{ marginBottom: "8px", marginTop: "12px" }}>
              <strong>Reasons for Low Trust:</strong>
            </p>
            {reasons.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                {reasons.map((reason, index) => (
                  <li key={index} style={{ marginBottom: "4px" }}>
                    {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: "8px 0" }}>Unable to verify your identity</p>
            )}
          </div>

          <button className="danger-btn" onClick={onVerify} style={{ marginTop: "20px" }}>
            Verify Identity
          </button>
        </div>
      </div>
    );
  }

  if (mode === "verified") {
    return (
      <div className="success-container">
        <div className="success-card">
          <div className="success-icon">✅</div>
          <h2 className="success-title">Access Granted</h2>
          <p className="success-subtitle">Identity Verified Successfully</p>

          <div className="success-details">
            <p>
              <strong>Updated Trust Score:</strong> 85
            </p>
            <p>
              <strong>Access Level:</strong> FULL
            </p>
            <p style={{ marginBottom: 0 }}>
              You have been verified and can now access all features.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "limited") {
    return (
      <div className="denial-container">
        <div
          className="denial-card"
          style={{ borderTopColor: "#f59e0b", borderTop: "6px solid #f59e0b" }}
        >
          <div className="denial-icon">🟡</div>
          <h2 style={{ color: "#f59e0b", fontSize: "2rem", fontWeight: 700, marginBottom: "16px" }}>
            Limited Access
          </h2>
          <p className="denial-subtitle">Some Features Restricted</p>

          <div
            style={{
              background: "#fffbeb",
              borderLeftColor: "#f59e0b",
              borderLeft: "4px solid #f59e0b",
              padding: "16px",
              borderRadius: "8px",
              fontSize: "0.95rem",
              color: "#92400e",
              lineHeight: 1.6,
              marginBottom: "28px"
            }}
          >
            <strong>Current Trust Score: {trustScore}</strong>
            <p style={{ marginBottom: "8px", marginTop: "12px" }}>
              <strong>Restrictions:</strong>
            </p>
            {reasons.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                {reasons.map((reason, index) => (
                  <li key={index} style={{ marginBottom: "4px" }}>
                    {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: "8px 0" }}>
                Your trust score is below the recommended threshold
              </p>
            )}
          </div>

          <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: 0 }}>
            Increase your trust score to unlock all features
          </p>
        </div>
      </div>
    );
  }

  const statusColor =
    level === "FULL" ? "#10b981" : level === "LIMITED" ? "#f59e0b" : "#ef4444";

  return (
    <div className="trust-score-card">
      <div className="score-label">Access Level</div>
      <div className="score-value" style={{ color: statusColor, fontSize: "2rem" }}>
        {action || level}
      </div>
      <div style={{ fontSize: "0.9rem", color: "#666" }}>
        {level === "FULL" && "🟢 Full Access Granted"}
        {level === "LIMITED" && "🟡 Limited Access"}
        {level === "DENIED" && "🔴 Access Denied"}
      </div>
    </div>
  );
}

export default AccessStatus;
