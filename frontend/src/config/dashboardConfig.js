function parseNumber(value, fallback) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
export const TRUST_DROP_ALERT_THRESHOLD = parseNumber(
	process.env.REACT_APP_TRUST_DROP_ALERT_THRESHOLD,
	20
);
export const ALERT_AUTO_HIDE_MS = parseNumber(process.env.REACT_APP_ALERT_AUTO_HIDE_MS, 4000);
export const TRUST_SCORE_POLL_INTERVAL_MS = parseNumber(
	process.env.REACT_APP_TRUST_SCORE_POLL_INTERVAL_MS,
	5000
);
