# 🔐 Zero Trust Security System

## 🚀 Live Demo

- Frontend: https://zero-trust-security-system.vercel.app
- Backend: https://zero-trust-security-system.onrender.com

---

## 📌 Project Overview

This project demonstrates a **Zero Trust Security Model**, where no user or request is trusted by default.
Every access request is verified through authentication and trust evaluation before granting access.

The system is built as a full-stack application and deployed on cloud platforms to simulate a real-world security environment.

---

## 🧠 Zero Trust Concept

- **Never Trust, Always Verify**
- Continuous authentication and validation of users
- Least privilege access control
- Monitoring of user activity and trust levels

---

## 🛠 Tech Stack

- **Frontend:** React.js
- **Backend:** Node.js, Express.js
- **Deployment:** Vercel (Frontend), Render (Backend)

---

## ✨ Features

- 🔑 Secure login system
- 🔐 Zero Trust-based authentication
- 📊 Trust score monitoring
- 📜 Activity logging dashboard
- ⚡ Real-time backend communication

---

## ⚙️ How It Works

1. User enters login credentials
2. Backend verifies credentials
3. System evaluates trust level
4. Access is granted or denied based on trust
5. User activity is monitored and displayed

---

## 📂 Project Structure

```
zero-trust-security-system/
├── frontend/   # React application
├── backend/    # Node.js + Express server
```

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

## 🚀 Future Improvements

- Multi-Factor Authentication (MFA)
- Device fingerprinting
- AI-based anomaly detection
- Role-based access control

---

## 🎯 Conclusion

This project showcases how Zero Trust principles can be implemented in a modern web application.
It provides a practical demonstration of secure authentication, continuous verification, and cloud deployment.

---

## 👩‍💻 Author

**Vani Singhal**