import React, { useState, useEffect } from "react";
import { useUserAppState, useSetUserAppState } from "@dynatrace-sdk/react-hooks";
import appConfig from "../../../app.config.json";
import type { PersonaDef } from "./PersonaPickerModal";

const WIZARD_KEY = `uj-wizard-v${appConfig.app.version}`;
const PERSONA_EVER_KEY = "uj-persona-ever";
const COMMUNITY_WARN_KEY = "uj-community-warn-dismissed";

const A  = "#F59E0B";
const AL = "#FBBF24";
const AD = "#D97706";
const AG = "rgba(245,158,11,0.12)";
const AB = "rgba(245,158,11,0.35)";
const TOTAL_STEPS = 3;

const KEYFRAMES = `
  @keyframes ow-fadein  { from{opacity:0}to{opacity:1} }
  @keyframes ow-fadeout { from{opacity:1}to{opacity:0;pointer-events:none} }
  @keyframes ow-card-in { from{opacity:0;transform:translateY(-20px) scale(0.97)}to{opacity:1;transform:none} }
  @keyframes ow-fwd     { from{opacity:0;transform:translateX(22px)}to{opacity:1;transform:none} }
  @keyframes ow-back    { from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:none} }
  @keyframes ow-granted { 0%{transform:scale(0) rotate(-15deg);opacity:0}70%{transform:scale(1.15) rotate(2deg)}100%{transform:scale(1) rotate(0);opacity:1} }
  @keyframes ow-glow    { 0%,100%{box-shadow:0 0 16px rgba(245,158,11,0.3)}50%{box-shadow:0 0 32px rgba(245,158,11,0.6)} }
  .ow-back-btn:hover { border-color:rgba(255,255,255,0.35) !important; color:rgba(255,255,255,0.8) !important; }
  .ow-next-btn:hover { background:linear-gradient(135deg,${A} 0%,#E8920A 100%) !important; border-color:${AL} !important; box-shadow:0 4px 24px rgba(245,158,11,0.5) !important; }
  .ow-persona:hover  { border-color:rgba(245,158,11,0.5) !important; background:rgba(245,158,11,0.07) !important; }
`;

// ─── GitHub icon ───────────────────────────────────────────────────────────

function GithubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  );
}

// ─── Divider label ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <div style={{ height: 1, flex: 1, background: `linear-gradient(90deg, ${AB}, transparent)` }} />
      <span style={{
        fontSize: 8.5, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
        color: A, padding: "3px 9px", border: `1px solid ${AB}`, borderRadius: 3, background: AG,
      }}>
        {children}
      </span>
      <div style={{ height: 1, flex: 1, background: `linear-gradient(90deg, transparent, ${AB})` }} />
    </div>
  );
}

// ─── Step 0: Mission Brief ─────────────────────────────────────────────────

function StepBrief({ isNewUser, appName, appVersion, appDesc, repoUrl, whatsNew }: {
  isNewUser: boolean; appName: string; appVersion: string; appDesc: string;
  repoUrl: string; whatsNew: string[];
}) {
  return (
    <div style={{ padding: "28px 28px 20px" }}>
      <SectionLabel>{isNewUser ? "Mission Brief" : `What's New — v${appVersion}`}</SectionLabel>

      <h2 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
        {isNewUser ? appName : `${appName}`}
      </h2>
      <p style={{ margin: "0 0 22px", fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.55 }}>
        {isNewUser ? appDesc : `Version ${appVersion} intelligence update — review before proceeding.`}
      </p>

      {isNewUser ? (
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderLeft: `3px solid ${AB}`,
          borderRadius: 8, padding: "16px 20px",
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: A, marginBottom: 10 }}>
            Operational Notice
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.65, color: "rgba(255,255,255,0.85)" }}>
            This is an <strong style={{ color: "#fff" }}>unofficial community application</strong> — not a supported Dynatrace product.
            Report issues or fork the repo at:
          </p>
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            fontSize: 12.5, fontWeight: 600, color: A, textDecoration: "none",
            background: AG, border: `1px solid ${AB}`, borderRadius: 5, padding: "6px 12px",
          }}>
            <GithubIcon />
            {repoUrl.replace("https://", "")}
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {whatsNew.map((item, i) => {
            const spaceIdx = item.indexOf(" ");
            const emoji = spaceIdx > 0 && spaceIdx <= 3 ? item.slice(0, spaceIdx) : "✦";
            const text  = spaceIdx > 0 && spaceIdx <= 3 ? item.slice(spaceIdx + 1) : item;
            return (
              <div key={i} style={{
                display: "flex", gap: 12, padding: "11px 14px",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8, fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 1.5,
              }}>
                <span style={{ flexShrink: 0, fontSize: 17 }}>{emoji}</span>
                <span>{text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Clearance Level ───────────────────────────────────────────────

function StepClearance({ personas, selectedId, onSelect, selectedDef }: {
  personas: PersonaDef[];
  selectedId: string;
  onSelect: (id: string) => void;
  selectedDef: PersonaDef;
}) {
  return (
    <div style={{ padding: "28px 28px 20px" }}>
      <SectionLabel>Clearance Level</SectionLabel>

      <h2 style={{ margin: "0 0 5px", fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>
        Select Your Role
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
        Your clearance level activates the intel modules relevant to your mission.
      </p>

      {/* 4-column persona grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
        {personas.map(p => {
          const active = p.id === selectedId;
          return (
            <button
              key={p.id}
              className="ow-persona"
              onClick={() => onSelect(p.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start",
                padding: "10px 11px", borderRadius: 8, cursor: "pointer",
                background: active ? AG : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? A : "rgba(255,255,255,0.09)"}`,
                color: "#fff", textAlign: "left",
                boxShadow: active ? `0 0 14px rgba(245,158,11,0.18)` : "none",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 18, marginBottom: 5 }}>{p.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: active ? AL : "rgba(255,255,255,0.85)", lineHeight: 1.25 }}>
                {p.label}
              </span>
              <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.38)", marginTop: 2, lineHeight: 1.35 }}>
                {p.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Authorized modules preview */}
      <div style={{
        background: AG, border: `1px solid ${AB}`,
        borderLeft: `3px solid ${A}`, borderRadius: 8, padding: "12px 16px",
      }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: A, marginBottom: 6 }}>
          Authorized Modules — {selectedDef.label}
        </div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.55 }}>
          {selectedDef.tabSummary}
        </div>
        <div style={{ marginTop: 7, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          Adjust individual tabs later in Settings → Tab Visibility
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Access Granted ────────────────────────────────────────────────

function StepGranted({ persona }: { persona: PersonaDef }) {
  const moduleCount = persona.tabSummary.split("·").filter(Boolean).length;
  return (
    <div style={{ padding: "36px 28px 28px", textAlign: "center" }}>
      {/* Animated checkmark */}
      <div style={{ marginBottom: 22 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 76, height: 76, borderRadius: "50%",
          border: `2px solid ${A}`,
          background: AG,
          animation: "ow-granted 0.5s cubic-bezier(0.34,1.2,0.64,1), ow-glow 2s ease-in-out 0.5s infinite",
        }}>
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
            <path d="M7 17.5L14 24.5L27 10" stroke={A} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: A, marginBottom: 8 }}>
        Access Granted
      </div>
      <h2 style={{ margin: "0 0 10px", fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
        Briefing Complete
      </h2>
      <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "rgba(255,255,255,0.58)", lineHeight: 1.65 }}>
        Operational profile set to{" "}
        <strong style={{ color: AL }}>{persona.icon} {persona.label}</strong>.<br />
        All authorized intel modules are standing by.
      </p>

      {/* Status badges */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <StatusBadge label="Clearance" value={persona.label} />
        <StatusBadge label="Modules" value={`${moduleCount} activated`} />
        <StatusBadge label="Status" value="Mission Ready" accent />
      </div>
    </div>
  );
}

function StatusBadge({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: "6px 14px", borderRadius: 20,
      background: accent ? AG : "rgba(255,255,255,0.04)",
      border: `1px solid ${accent ? AB : "rgba(255,255,255,0.1)"}`,
      textAlign: "left",
    }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: accent ? A : "rgba(255,255,255,0.35)", marginBottom: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent ? AL : "rgba(255,255,255,0.75)" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Community Warning Banner ──────────────────────────────────────────────
// Shown on every load (independent of the wizard) unless permanently suppressed.

export function CommunityWarningBanner({ repoUrl }: { repoUrl: string }) {
  const warnState = useUserAppState({ key: COMMUNITY_WARN_KEY });
  const { execute: saveState } = useSetUserAppState();
  const [visible, setVisible] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (warnState.isLoading) return;
    if (warnState.data?.value === "dismissed") return;
    setVisible(true);
  }, [warnState.isLoading, warnState.data?.value]);

  if (!visible) return null;

  const dismiss = (permanent: boolean) => {
    if (permanent) saveState({ key: COMMUNITY_WARN_KEY, body: { value: "dismissed" } });
    setHiding(true);
    setTimeout(() => setVisible(false), 320);
  };

  return (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 9000,
      maxWidth: 560, width: "calc(100% - 32px)",
      background: "linear-gradient(135deg, #0E1323 0%, #090D18 100%)",
      border: `1px solid ${AB}`,
      borderLeft: `3px solid ${A}`,
      borderRadius: 10,
      padding: "12px 16px",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 20px rgba(245,158,11,0.08)",
      display: "flex", alignItems: "flex-start", gap: 12,
      fontFamily: '"Inter",system-ui,sans-serif',
      opacity: hiding ? 0 : 1,
      transition: "opacity 0.32s ease",
      animation: hiding ? "none" : "ow-fadein 0.3s ease",
    }}>
      <style>{`@keyframes ow-fadein{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: A, marginBottom: 3 }}>
          Community App — Not an Official Dynatrace Product
        </div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: 8 }}>
          This app is community-built and unsupported. Use at your own discretion.{" "}
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" style={{ color: A, textDecoration: "none", fontWeight: 600 }}>
            View on GitHub ↗
          </a>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => dismiss(false)} style={{
            fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.55)",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 5, padding: "4px 10px", cursor: "pointer",
          }}>
            Dismiss
          </button>
          <button onClick={() => dismiss(true)} style={{
            fontSize: 11.5, fontWeight: 600, color: A,
            background: AG, border: `1px solid ${AB}`,
            borderRadius: 5, padding: "4px 10px", cursor: "pointer",
          }}>
            Don't show again
          </button>
        </div>
      </div>
      <button onClick={() => dismiss(false)} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "rgba(255,255,255,0.3)", fontSize: 16, padding: "2px 4px",
        flexShrink: 0, lineHeight: 1,
      }}>✕</button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  appName: string;
  appVersion: string;
  appDesc: string;
  repoUrl: string;
  whatsNew: string[];
  personas: PersonaDef[];
  defaultPersonaId?: string;
  onPersonaApply: (personaId: string) => void;
}

export function OnboardingWizard({
  appName, appVersion, appDesc, repoUrl, whatsNew,
  personas, defaultPersonaId = "all", onPersonaApply,
}: OnboardingWizardProps) {
  const wizState  = useUserAppState({ key: WIZARD_KEY });
  const everState = useUserAppState({ key: PERSONA_EVER_KEY });
  const { execute: saveState } = useSetUserAppState();

  const [visible,   setVisible]   = useState(false);
  const [closing,   setClosing]   = useState(false);
  const [step,      setStep]      = useState(0);
  const [dir,       setDir]       = useState<"fwd" | "back">("fwd");
  const [animKey,   setAnimKey]   = useState(0);
  const [isNewUser, setIsNewUser] = useState(true);
  const [persona,   setPersona]   = useState(defaultPersonaId);

  useEffect(() => {
    if (wizState.isLoading || everState.isLoading) return;
    if (wizState.data?.value === "seen") return;
    const prev = everState.data?.value as string | undefined;
    setIsNewUser(!prev);
    if (prev) setPersona(prev);
    setVisible(true);
  }, [wizState.isLoading, wizState.data?.value, everState.isLoading, everState.data?.value, defaultPersonaId]);

  if (!visible) return null;

  const selectedDef = personas.find(p => p.id === persona) ?? personas[0];

  const go = (newStep: number, newDir: "fwd" | "back") => {
    setDir(newDir);
    setAnimKey(k => k + 1);
    setStep(newStep);
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      go(step + 1, "fwd");
    } else {
      saveState({ key: WIZARD_KEY,       body: { value: "seen" } });
      saveState({ key: PERSONA_EVER_KEY, body: { value: persona } });
      onPersonaApply(persona);
      setClosing(true);
      setTimeout(() => setVisible(false), 380);
    }
  };

  const handleBack = () => { if (step > 0) go(step - 1, "back"); };

  const nextLabel =
    step === 0 ? "Set Clearance Level →" :
    step === 1 ? `Confirm ${selectedDef.label} Access →` :
    "Enter Mission →";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(0,0,0,0.9)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
      opacity: closing ? 0 : 1,
      transition: closing ? "opacity 0.38s ease" : "none",
      animation: closing ? "none" : "ow-fadein 0.25s ease",
    }}>
      <style>{KEYFRAMES}</style>

      {/* Card */}
      <div style={{
        background: "linear-gradient(160deg, #0E1323 0%, #090D18 100%)",
        border: `1px solid ${AB}`,
        borderTop: `3px solid ${A}`,
        borderRadius: 14,
        width: "100%", maxWidth: 660,
        boxShadow: `0 0 80px rgba(0,0,0,0.9), 0 0 50px rgba(245,158,11,0.07), inset 0 1px 0 rgba(245,158,11,0.06)`,
        animation: "ow-card-in 0.32s cubic-bezier(0.34,1.15,0.64,1)",
        overflow: "hidden",
        fontFamily: '"Inter",system-ui,sans-serif',
      }}>

        {/* ── Header ── */}
        <div style={{
          background: "linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0.03) 100%)",
          borderBottom: "1px solid rgba(245,158,11,0.18)",
          padding: "20px 28px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: A, marginBottom: 4 }}>
              Mission Briefing
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>
              {appName}
            </div>
          </div>

          {/* Step indicators (pill dots) */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div key={i} style={{
                  width: i === step ? 22 : 7,
                  height: 7, borderRadius: 4,
                  background: i <= step ? A : "rgba(255,255,255,0.15)",
                  boxShadow: i === step ? `0 0 10px rgba(245,158,11,0.55)` : "none",
                  transition: "all 0.35s cubic-bezier(0.34,1.1,0.64,1)",
                }} />
              ))}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,158,11,0.6)", letterSpacing: "0.08em" }}>
              {step + 1} / {TOTAL_STEPS}
            </span>
          </div>
        </div>

        {/* ── Signal strength bar ── */}
        <div style={{ height: 3, background: "rgba(255,255,255,0.05)", position: "relative" }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: `${((step + 1) / TOTAL_STEPS) * 100}%`,
            background: `linear-gradient(90deg, ${AD} 0%, ${A} 75%, ${AL} 100%)`,
            boxShadow: `0 0 10px rgba(245,158,11,0.6)`,
            transition: "width 0.5s cubic-bezier(0.34,1.1,0.64,1)",
          }} />
        </div>

        {/* ── Step content ── */}
        <div key={animKey} style={{ animation: `${dir === "fwd" ? "ow-fwd" : "ow-back"} 0.28s ease` }}>
          {step === 0 && (
            <StepBrief
              isNewUser={isNewUser}
              appName={appName} appVersion={appVersion}
              appDesc={appDesc} repoUrl={repoUrl} whatsNew={whatsNew}
            />
          )}
          {step === 1 && (
            <StepClearance
              personas={personas} selectedId={persona}
              onSelect={setPersona} selectedDef={selectedDef}
            />
          )}
          {step === 2 && <StepGranted persona={selectedDef} />}
        </div>

        {/* ── Signal strength label ── */}
        <div style={{ padding: "0 28px 4px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,158,11,0.4)" }}>
            Signal
          </span>
          <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${((step + 1) / TOTAL_STEPS) * 100}%`,
              background: `linear-gradient(90deg, ${AD}, ${A})`,
              transition: "width 0.5s cubic-bezier(0.34,1.1,0.64,1)",
              borderRadius: 2,
            }} />
          </div>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", color: A }}>
            {Math.round(((step + 1) / TOTAL_STEPS) * 100)}%
          </span>
        </div>

        {/* ── Nav footer ── */}
        <div style={{ padding: "10px 28px 24px", display: "flex", gap: 10 }}>
          {step > 0 && (
            <button
              onClick={handleBack}
              className="ow-back-btn"
              style={{
                padding: "11px 18px", background: "transparent",
                border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
                color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              ← Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="ow-next-btn"
            style={{
              flex: 1, padding: "13px 24px",
              background: `linear-gradient(135deg, ${AD} 0%, #B45309 100%)`,
              border: `1px solid ${AD}`,
              borderRadius: 8, color: "#0D1018",
              fontSize: 14, fontWeight: 800, cursor: "pointer",
              letterSpacing: "0.03em",
              boxShadow: `0 2px 14px rgba(245,158,11,0.22)`,
              transition: "all 0.15s ease",
            }}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
