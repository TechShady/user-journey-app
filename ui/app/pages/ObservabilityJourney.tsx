import React from "react";
import "./ObservabilityJourney.css";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const LEVELS = [
  {
    num: 5,
    name: "Visionary",
    tagline: "Observability as the control plane for autonomous operations",
    desc: "AI continuously understands and optimizes digital journeys, delivering autonomous operations and maximum business impact.",
    color: "#34d399",
  },
  {
    num: 4,
    name: "Strategic",
    tagline: "AI-driven, preventive operations",
    desc: "Continuous, contextual insights enable proactive remediation, intelligent automation, and governed decision support.",
    color: "#60a5fa",
  },
  {
    num: 3,
    name: "Proficient",
    tagline: "Unified observability for faster decisions",
    desc: "Standardized tooling delivers real-time insights across teams, improving MTTR while humans remain the control point.",
    color: "#a78bfa",
  },
  {
    num: 2,
    name: "Foundational",
    tagline: "Visibility without consistency",
    desc: "Basic observability is established, but data remains siloed and insights are largely descriptive and manual.",
    color: "#fbbf24",
  },
  {
    num: 1,
    name: "Reactive",
    tagline: "Monitoring without understanding",
    desc: "Fragmented tools surface issues late, driving manual investigation and reactive, war-room based resolution.",
    color: "#9ca3af",
  },
];

const CAPABILITIES = [
  { text: "Advance Business & AI Observability", icon: "🧠", tier: 5 },
  { text: "Optimize Infrastructure & FinOps", icon: "💰", tier: 5 },
  { text: "Enhance Security & Trust", icon: "🛡️", tier: 4 },
  { text: "Deliver Superior Digital Experiences", icon: "✨", tier: 4 },
  { text: "Accelerate Modernization & Transformation", icon: "🚀", tier: 3 },
  { text: "Increase Efficiency with AI & Automation", icon: "⚡", tier: 3 },
  { text: "Strengthen Compliance", icon: "📋", tier: 2 },
  { text: "Rationalize Observability Tooling Spend", icon: "📊", tier: 2 },
  { text: "Improve Operational Resilience", icon: "🔧", tier: 1 },
];

// ---------------------------------------------------------------------------
// SVG Curve
// ---------------------------------------------------------------------------
function MaturityCurve() {
  // Exponential-style curve from bottom-left to top-right
  const w = 900;
  const h = 620;
  const path = `M 40 ${h - 40} C 120 ${h - 60}, 200 ${h - 100}, 300 ${h - 160} S 500 ${h - 340}, 600 ${h - 420} S 760 ${h - 560}, ${w - 40} 50`;

  return (
    <svg className="otj-curve-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="curveGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6b7280" stopOpacity="0.15" />
          <stop offset="25%" stopColor="#fbbf24" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.25" />
          <stop offset="75%" stopColor="#4589ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="curveGradStroke" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6b7280" stopOpacity="0.4" />
          <stop offset="25%" stopColor="#fbbf24" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.7" />
          <stop offset="75%" stopColor="#4589ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Area fill under curve */}
        <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4589ff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#4589ff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Subtle grid lines */}
      {[0.2, 0.4, 0.6, 0.8].map((p, i) => (
        <line key={`h${i}`} x1={40} y1={h * p} x2={w - 40} y2={h * p}
          stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
      ))}
      {[0.2, 0.4, 0.6, 0.8].map((p, i) => (
        <line key={`v${i}`} x1={w * p} y1={40} x2={w * p} y2={h - 40}
          stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
      ))}

      {/* Area fill */}
      <path d={path + ` L ${w - 40} ${h - 40} L 40 ${h - 40} Z`} fill="url(#areaGrad)" />

      {/* Glow path */}
      <path d={path} fill="none" stroke="url(#curveGradStroke)" strokeWidth="4" filter="url(#glow)"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* Crisp path on top */}
      <path d={path} fill="none" stroke="url(#curveGradStroke)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ObservabilityJourney: React.FC = () => {
  return (
    <div className="otj-page">
      <div className="otj-content">
        {/* Header */}
        <header className="otj-header">
          <div className="otj-badge">
            <span className="otj-badge-dot" />
            Value Practice
          </div>
          <h1 className="otj-title">
            Unlocking Outcomes Through The<br />
            Observability Transformation Journey
          </h1>
          <p className="otj-subtitle">
            From Reactive Monitoring to Intelligent Control Plane for Autonomous Operations
          </p>
        </header>

        {/* Achievable Value axis */}
        <div className="otj-axes">
          <span className="otj-axis-label">Achievable Value</span>
          <div className="otj-axis-value-bar">
            <span className="otj-axis-dollar">$</span>
            <div className="otj-axis-line" />
            <span className="otj-axis-dollar active">$$$$$</span>
          </div>
        </div>

        {/* Main layout */}
        <div className="otj-main">
          {/* Capabilities */}
          <div className="otj-capabilities">
            {CAPABILITIES.map((cap, i) => (
              <div className="otj-capability" key={i}>
                <div className={`otj-cap-icon tier-${cap.tier}`}>{cap.icon}</div>
                <span className="otj-cap-text">{cap.text}</span>
              </div>
            ))}
          </div>

          {/* Curve + Levels */}
          <div className="otj-curve-area">
            <MaturityCurve />
            <div className="otj-levels">
              {LEVELS.map((lvl) => (
                <div className={`otj-level otj-level-${lvl.num}`} key={lvl.num}>
                  <div className={`otj-level-num level-${lvl.num}`}>
                    {String(lvl.num).padStart(2, "0")}
                  </div>
                  <div className="otj-level-info">
                    <h3 className={`otj-level-name level-${lvl.num}`}>{lvl.name}</h3>
                    <p className="otj-level-tagline">{lvl.tagline}</p>
                    <p className="otj-level-desc">{lvl.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Effort axis at bottom */}
        <div className="otj-effort-axis">
          <div className="otj-effort-indicator">
            <div className="otj-effort-icons">
              <span>👤</span><span>👤</span><span>👤</span><span>👤</span>
            </div>
            <span className="otj-effort-text">High Manual Effort</span>
          </div>

          <div className="otj-gradient-arrow" />

          <div className="otj-effort-indicator">
            <span className="otj-effort-text">Autonomous</span>
            <div className="otj-effort-icons">
              <span>🤖</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="otj-footer">
          <span className="otj-footer-text">CONFIDENTIAL</span>
        </footer>
      </div>
    </div>
  );
};
