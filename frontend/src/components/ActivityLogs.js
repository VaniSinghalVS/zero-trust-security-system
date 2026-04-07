import React from "react";

function ActivityLogs({ logs }) {
  if (!logs.length) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>
        <p>ℹ️ No activity logs available</p>
      </div>
    );
  }

  return (
    <div className="activity-logs">
      {logs.map((log, index) => (
        <div key={index} className="activity-log-item">
          <div className="log-icon">
            {log.level?.toLowerCase() === "error" && "❌"}
            {log.level?.toLowerCase() === "warning" && "⚠️"}
            {log.level?.toLowerCase() === "info" && "ℹ️"}
            {!log.level && "📝"}
          </div>
          <div style={{ flex: 1 }}>
            <div className="log-user">{log.user || "System"}</div>
            <div className="log-details">
              <span className={`log-level ${log.level?.toLowerCase() || "info"}`}>
                {log.level || "INFO"}
              </span>
              {log.score !== undefined && <span style={{ color: "#666" }}>Score: {log.score}</span>}
            </div>
          </div>
          <div className="log-time">{log.time || "N/A"}</div>
        </div>
      ))}
    </div>
  );
}

export default ActivityLogs;
