import React from "react";

function getColor(score) {
  if (score >= 80) return "green";
  if (score >= 50) return "orange";
  return "red";
}

function TrustScoreCard({ score }) {
  const color = getColor(score);
  const fillColor =
    color === "green" ? "#10b981" : color === "orange" ? "#f59e0b" : "#ef4444";

  return (
    <div className="trust-score-card">
      <div className="score-label">Live Trust Score</div>
      <div className={`score-value ${color}`}>{score}</div>
      <div className="score-bar">
        <div
          className="score-bar-fill"
          style={{
            "--fill-width": `${score}%`,
            "--fill-color": fillColor
          }}
        ></div>
      </div>
      <div className="score-label" style={{ marginBottom: 0, fontSize: "0.85rem" }}>
        {color === "green" && "✅ Trusted"}
        {color === "orange" && "⚠️ Caution"}
        {color === "red" && "❌ High Risk"}
      </div>
    </div>
  );
}

export default TrustScoreCard;
