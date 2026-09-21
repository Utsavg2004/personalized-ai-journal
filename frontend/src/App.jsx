import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [backendStatus, setBackendStatus] = useState({
    status: 'checking',
    uptime: null,
    environment: null,
  });

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setBackendStatus({
          status: 'online',
          uptime: data.uptimeSeconds,
          environment: data.environment,
        });
      } catch (err) {
        setBackendStatus({
          status: 'offline',
          uptime: null,
          environment: null,
          error: err.message,
        });
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="journal-app">
      <header className="app-header">
        <div className="brand">
          <span className="logo-icon">📓</span>
          <h1>Personalized AI Journal</h1>
        </div>
        <div className="badge-wrapper">
          <span className={`status-pill ${backendStatus.status}`}>
            Backend: {backendStatus.status}
            {backendStatus.status === 'online' && ` (${backendStatus.environment})`}
          </span>
        </div>
      </header>

      <main className="main-content">
        <div className="welcome-banner">
          <h2>RAG-Powered Historical AI Journal</h2>
          <p>
            Clean architecture, strict multi-tenant data isolation, hosted pgvector storage,
            and provider-agnostic LLM integration (OpenRouter / Ollama).
          </p>
        </div>

        <div className="status-grid">
          <div className="status-card">
            <span className="card-tag">Core Architecture</span>
            <h3>Layered Monolith</h3>
            <p>Routes → Controllers → Services → Repositories → Supabase pgvector</p>
          </div>
          <div className="status-card">
            <span className="card-tag">Security Boundary</span>
            <h3>Strict Multi-Tenancy</h3>
            <p>Every query and vector search scoped strictly to verified <code>user_id</code></p>
          </div>
          <div className="status-card">
            <span className="card-tag">LLM Engine</span>
            <h3>Provider Abstraction</h3>
            <p>Runtime switchable between OpenRouter and local Ollama via configuration</p>
          </div>
        </div>

        <div className="phase-card">
          <div className="phase-header">
            <span className="phase-badge">Phase 1 Complete</span>
            <h3>Project Initialization Verified</h3>
          </div>
          <ul className="phase-checklist">
            <li>✅ Backend Express modular structure initialized & tested</li>
            <li>✅ Structured RAG/AUTH/HTTP logger configured</li>
            <li>✅ Centralized error handling & Zod environment validator</li>
            <li>✅ React + Vite frontend scaffolded and ready</li>
            <li>✅ Root .env.example, .gitignore, and migration paths configured</li>
          </ul>
        </div>
      </main>

      <footer className="app-footer">
        <p>Codeacious Technologies Assignment &bull; Phase 1 Initialization</p>
      </footer>
    </div>
  );
}

export default App;
