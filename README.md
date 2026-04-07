# Zero Trust Security System

![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/API-Express-000000?logo=express&logoColor=white)
![Architecture](https://img.shields.io/badge/Security-Zero%20Trust-1f6feb)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## Overview
Zero Trust Security System is a full-stack platform that applies Zero Trust Architecture with continuous trust evaluation. It dynamically computes trust, enforces adaptive access policies, and provides real-time monitoring through an interactive dashboard.

## Features
- Dynamic trust score calculation using contextual signals (device posture, login time, behavior context)
- Multi-level access control outcomes: **FULL**, **LIMITED**, **DENIED**
- Step-up authentication for low-trust sessions
- Real-time trust monitoring with graph visualization
- Centralized activity logging for audit and incident analysis
- Dynamic status factors displayed on login

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React (Create React App) |
| Backend | Node.js, Express |
| Security Model | Zero Trust, Continuous Trust Evaluation, Adaptive Access Control |

## Project Structure
```text
capstone/
├── frontend/   # React UI (Dashboard, Graph, Alerts, Components)
└── backend/    # Express API (auth, trust engine, logs, policies)
```

## Installation & Setup
### 1. Clone Repository
```bash
git clone <your-repo-url>
cd capstone
```

### 2. Install Dependencies
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Start Services
```bash
# Terminal 1 - Backend
cd backend
npm start
```

```bash
# Terminal 2 - Frontend
cd frontend
npm start
```

### 4. Open Application
Frontend: `http://localhost:3000`

## Usage
1. User logs in and contextual trust factors are evaluated.
2. Trust engine calculates a dynamic trust score.
3. Policy engine assigns access level: **FULL**, **LIMITED**, or **DENIED**.
4. Low-trust sessions trigger step-up authentication.
5. Dashboard displays trust trends, alerts, and status changes.
6. Activity logs capture access decisions and key security events.

## Screenshots
> Add screenshots for GitHub and resume showcase.

- Login Page  
	`![Login Page](./docs/screenshots/login.png)`
- Dashboard Overview  
	`![Dashboard](./docs/screenshots/dashboard.png)`
- Trust Graph  
	`![Trust Graph](./docs/screenshots/trust-graph.png)`
- Activity Logs  
	`![Activity Logs](./docs/screenshots/activity-logs.png)`

## Future Improvements
- AI-based trust scoring for predictive and adaptive decisions
- Anomaly detection for suspicious behavior patterns
- Risk-aware policy orchestration across distributed services
- SIEM/SOAR integration for automated incident response

## License
Licensed under the MIT License.
