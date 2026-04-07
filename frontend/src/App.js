import React, { useState } from "react";
import axios from "axios";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import Dashboard from "./Dashboard";
import { API_BASE_URL } from "./config/dashboardConfig";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("normal");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const isSuspicious = mode === "suspicious";
      const response = await axios.post(`${API_BASE_URL}/login`, {
        username,
        password,
        device: isSuspicious ? "Unknown" : navigator.userAgent,
        time: new Date().toISOString(),
        suspiciousBehavior: isSuspicious,
        failedAttempts: isSuspicious ? 3 : 0,
        anomalyDetected: isSuspicious,
        oddTime: isSuspicious
      });

      localStorage.setItem("token", response.data.token);

      navigate("/dashboard", { state: response.data });

    } catch (error) {
      alert("Login failed");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>
      <h2>Zero Trust Login</h2>

      <select onChange={(e) => setMode(e.target.value)}>
        <option value="normal">Normal Login</option>
        <option value="suspicious">Suspicious Login</option>
      </select>

      <br /><br />

      <input
        placeholder="Username"
        onChange={(e) => setUsername(e.target.value)}
      /><br /><br />

      <input
        type="password"
        placeholder="Password"
        onChange={(e) => setPassword(e.target.value)}
      /><br /><br />

      <button onClick={handleLogin}>Login</button>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;