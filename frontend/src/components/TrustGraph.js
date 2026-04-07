import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot
} from "recharts";

function formatTickTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTooltipTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function CustomTrustTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const scoreEntry = payload.find((entry) => entry.dataKey === "score") || payload[0];
  const score = scoreEntry?.value;
  const level = score >= 80 ? "Trusted" : score >= 50 ? "Caution" : "High Risk";

  const lineLabelMap = {
    score: "Trust Score",
    deviceTrust: "Device Trust",
    behaviorTrust: "Behavior Trust",
    networkTrust: "Network Trust",
    timeTrust: "Time Trust"
  };

  return (
    <div className="trust-tooltip">
      <div className="trust-tooltip-time">{formatTooltipTime(label)}</div>
      <div className="trust-tooltip-score">
        Trust Score: <strong>{score}</strong>
      </div>
      <div className="trust-tooltip-level">{level}</div>
      {payload.length > 1 && (
        <div className="trust-tooltip-lines">
          {payload
            .filter((entry) => entry.dataKey !== "score")
            .map((entry) => (
              <div key={entry.dataKey} className="trust-tooltip-line-item">
                <span>{lineLabelMap[entry.dataKey] || entry.dataKey}:</span>
                <strong>{entry.value}</strong>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function TrustGraph({ history }) {
  const [showDimensionLines, setShowDimensionLines] = useState(false);

  const dimensionLines = [
    { key: "deviceTrust", color: "#8b5cf6" },
    { key: "behaviorTrust", color: "#f97316" },
    { key: "networkTrust", color: "#0ea5e9" },
    { key: "timeTrust", color: "#22c55e" }
  ];

  const lowestPoint = history.length
    ? history.reduce((min, point) => (point.score < min.score ? point : min), history[0])
    : null;

  return (
    <>
      <div className="chart-controls">
        <button
          type="button"
          className="chart-toggle-btn"
          onClick={() => setShowDimensionLines((prev) => !prev)}
        >
          {showDimensionLines ? "Hide Component Lines" : "Show Component Lines"}
        </button>
      </div>

      <div className="chart-container">
        {history.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={history} margin={{ top: 16, right: 20, left: 4, bottom: 8 }}>
            <defs>
              <linearGradient id="trustLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="trustAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="4 4" stroke="#dbe3ef" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatTickTime}
              tickCount={6}
              minTickGap={20}
              stroke="#6b7280"
              style={{ fontSize: "0.82rem" }}
            />
            <YAxis
              domain={[0, 100]}
              tickCount={6}
              stroke="#6b7280"
              style={{ fontSize: "0.82rem" }}
            />
            <Tooltip content={<CustomTrustTooltip />} />

            <Area
              type="monotone"
              dataKey="score"
              stroke="none"
              fill="url(#trustAreaGradient)"
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            />

              <Line
                type="monotone"
                dataKey="score"
                stroke="url(#trustLineGradient)"
                strokeWidth={4}
                dot={false}
                activeDot={{ r: 6, stroke: "#1d4ed8", strokeWidth: 2, fill: "#ffffff" }}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              />

              {showDimensionLines &&
                dimensionLines.map((dimension) => (
                  <Line
                    key={dimension.key}
                    type="monotone"
                    dataKey={dimension.key}
                    stroke={dimension.color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive
                    animationDuration={500}
                    animationEasing="ease-out"
                  />
                ))}

            {lowestPoint && (
              <ReferenceDot
                x={lowestPoint.time}
                y={lowestPoint.score}
                r={5}
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth={2}
                label={{ value: "Lowest", position: "top", fill: "#b91c1c", fontSize: 11 }}
              />
            )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>
            <p>Collecting trust score data...</p>
          </div>
        )}
      </div>
    </>
  );
}

export default TrustGraph;
