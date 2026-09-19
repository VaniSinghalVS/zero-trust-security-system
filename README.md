# 🔐 Zero Trust Security System

## 🚀 Live Demo

- Frontend: https://zero-trust-security-system.vercel.app
- Backend: https://zero-trust-security-system.onrender.com

---

## 📌 Project Overview

This project demonstrates a **Zero Trust Security Model**, where no user or request is trusted by default.
Every access request is verified through authentication and continuous trust evaluation before granting access.

Rather than treating device, network, and time familiarity as simple known/unknown flags, the system computes a **confidence-adaptive trust score** — trust factor weights shift dynamically based on how much evidence backs each signal, and multiple moderately risky signals occurring together are detected even when no single signal alone would trigger a response.

The system is built as a full-stack application and deployed on cloud platforms to simulate a real-world security environment.

---

## 🧠 Zero Trust Concept

- **Never Trust, Always Verify**
- Continuous authentication and validation of users
- Least privilege access control
- Monitoring of user activity and trust levels

---

## 🧬 Confidence-Adaptive Trust Scoring Engine

The core trust engine evaluates four dimensions — Device, Behavior, Network, and Time — and combines them through a mechanism built on four ideas:

- **Dynamic Weight Adjustment** — each dimension's influence on the final score scales with how much evidence backs it (`confidence`) and its recent reliability, rather than using fixed weights. A well-established account's behavior looks different from a brand-new one, and the weighting reflects that automatically.
- **Continuous Familiarity Modelling** — device, network, and time familiarity are graded (0–1) based on historical evidence rather than a binary known/unknown check, so partially-familiar situations aren't treated the same as either extreme.
- **Cross-Dimensional Risk Correlation** — when two or more dimensions simultaneously fall into a moderate-risk band, a compounding penalty is applied, catching correlated risk patterns (e.g. a new IP *and* an unusual login hour together) that a simple additive score would miss.
- **Cold-Start Protection with Quarantine & Promotion** — a new device or network starts *quarantined* and contributes zero familiarity until it passes step-up authentication twice, preventing an attacker using stolen credentials from being silently "learned" as a trusted device. Genuinely new-but-legitimate users are protected from being outright denied (capped at `LIMITED`/`STEP_UP_AUTH` rather than `DENIED`/`BLOCK`) when the low trust is purely due to unfamiliarity rather than active risk signals.

---

## 🛠 Tech Stack

- **Frontend:** React.js
- **Backend:** Node.js, Express.js
- **Deployment:** Vercel (Frontend), Render (Backend)

---

## ✨ Features

- 🔑 Secure login system
- 🔐 Zero Trust-based authentication
- 📊 Live, confidence-adaptive trust score monitoring
- 🧩 Multi-dimensional trust breakdown (device, behavior, network, time) with per-dimension confidence
- ⚠️ Quarantine badges for unverified devices/networks, with step-up promotion flow
- 📈 Trust score trend visualization
- 📜 Activity logging dashboard
- ⚡ Real-time backend communication

---

## ⚙️ How It Works

1. User enters login credentials
2. Backend verifies credentials
3. System evaluates trust across four dimensions, weighted by confidence and adjusted for cross-dimensional risk correlation
4. Access is granted, limited, or denied based on the resulting trust score and action
5. Unfamiliar devices/networks are quarantined until they pass step-up authentication
6. User activity and trust history are monitored and displayed

---

## 📂 Project Structure

​```
zero-trust-security-system/
├── frontend/   # React application
└── backend/    # Node.js + Express server
​```

---

## 🧪 Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/VaniSinghalVS/zero-trust-security-system.git
cd zero-trust-security-system
```

### 2. Backend Setup

```bash
cd backend
npm install
node server.js
```

Backend will run on: `http://localhost:5000`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm start
```

Frontend will run on: `http://localhost:3000`

---

## 🔐 Environment Variables

- Frontend (`.env`):
  - `REACT_APP_API_BASE_URL=http://localhost:5000`
- Production (Vercel):
  - `REACT_APP_API_BASE_URL=https://zero-trust-security-system.onrender.com`

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/login` | POST | Authenticates credentials and returns a JWT plus trust evaluation |
| `/api/trust-score` | GET | Computes and returns the current confidence-adaptive trust score |
| `/api/step-up-confirm` | POST | Confirms a step-up authentication outcome for a quarantined device/network, promoting it to trusted after repeated success |
| `/api/secure-data` | GET | Returns protected data, gated by trust action |
| `/api/admin` | GET | Admin-only route, gated by trust level |
| `/api/logs` | GET | Returns recent access logs |

---

## 🚀 Future Improvements

- Multi-Factor Authentication (MFA)
- Real device fingerprinting (current implementation uses browser User-Agent as a proxy)
- Privacy-preserving behavioral profiling
- Trust-bound token lifetimes (shortening JWT validity as trust drops)
- Role-based access control

---

## 🎯 Conclusion

This project showcases how Zero Trust principles can be implemented in a modern web application, going beyond static rule-based checks toward a confidence-adaptive, continuously-learning trust evaluation model. It provides a practical demonstration of secure authentication, continuous verification, cross-dimensional risk correlation, and cloud deployment.

---

## 👩‍💻 Author

**Vani Singhal**