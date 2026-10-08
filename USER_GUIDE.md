# User Journey & Experience — User Guide

> **Note:** This is a community-built Dynatrace Platform App, not an official Dynatrace product. See [README.md](README.md) for the disclaimer.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Interface Overview](#3-interface-overview)
4. [Configuring Funnels](#4-configuring-funnels)
5. [Time-Lapse Playback](#5-time-lapse-playback)
6. [AI Insights](#6-ai-insights)
7. [Tab Reference](#7-tab-reference)
   - [Funnel & Conversion](#71-funnel--conversion)
   - [Executive Summary](#72-executive-summary)
   - [User Experience](#73-user-experience)
   - [Navigation & Flows](#74-navigation--flows)
   - [Intelligence & AI](#75-intelligence--ai)
   - [Engagement & Revenue](#76-engagement--revenue)
   - [Errors & Reliability](#77-errors--reliability)
   - [FinOps](#78-finops)
8. [Export & Sharing](#8-export--sharing)
9. [Glossary](#9-glossary)

---

## 1. Overview

**User Journey & Experience** is a 43-tab frontend observability suite deployed as a Dynatrace Platform App. It sits on top of your Dynatrace Real User Monitoring (RUM) data and provides:

- **Conversion funnel tracking** — Define multi-step user journeys and measure session-level conversion rates, drop-off points, and revenue impact.
- **Performance diagnostics** — Core Web Vitals, Apdex scoring, error analysis, and resource waterfalls per funnel step.
- **Business impact quantification** — Revenue lost to performance degradation, cost-per-conversion, and Performance Tax breakdowns.
- **Predictive intelligence** — 7-day forecasting for Apdex, conversion rate, error rate, and CWV metrics.
- **Operational monitoring** — SLO tracking, anomaly detection, change intelligence around deployments, and root cause correlation all the way to backend services.

All data is queried live from your Dynatrace environment via DQL. No data is stored in the app itself.

---

## 2. Getting Started

### Prerequisites

- Node.js ≥ 16.13
- A Dynatrace environment with RUM (Real User Monitoring) enabled and session data flowing
- `dt-app` CLI (`npx dt-app`)

### Installation

1. Fork the repository and clone it locally.
2. Edit `app.config.json` — set `environmentUrl` to your Dynatrace tenant URL.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run in development mode:
   ```bash
   npx dt-app dev
   ```
5. Deploy to your Dynatrace environment:
   ```bash
   npx dt-app deploy
   ```

### First-Time Setup in the App

After launching the app for the first time:

1. Open **Settings** (gear icon, top-right).
2. Set **Default Frontend Application** to your Dynatrace RUM application name (e.g., `www.mysite.com`).
3. Configure at least one **Funnel** — give it a name, then add 2–10 steps. Each step needs a label and one or more page URL patterns.
4. Optionally set **Average Order Value (AOV)** if you want revenue tracking.
5. Save settings. All tabs will now query data scoped to your funnel and application.

---

## 3. Interface Overview

### Header Controls

The persistent header (always visible at the top) contains these controls, from left to right:

| Control | Description |
|---|---|
| **App title / logo** | Click to return to the default tab |
| **Funnel Selector** | Dropdown to switch between saved funnels |
| **Timeframe Selector** | Choose a preset window (2h → 90d) or an absolute range |
| **AI Insights button** (✦✦✦) | Opens a contextual analysis panel for the current sub-tab |
| **Help icon** | Opens a slide-out panel with a What's New changelog |
| **Settings gear** | Opens the full Settings configuration sheet |

### Time-Lapse Strip

Below the app title is a collapsible **Time-Lapse strip** for historical playback (see [Section 5](#5-time-lapse-playback)).

### Tab Navigation

Tabs are arranged in two levels:

- **Parent tab groups** (e.g., "Funnel & Conversion", "User Experience") — shown as the primary navigation row.
- **Sub-tabs** — shown as pill buttons below the parent when the parent is selected.

Both levels can be **reordered by dragging** and **hidden per user** via the Tab Settings panel inside Settings. Your ordering and visibility preferences are saved per user.

---

## 4. Configuring Funnels

The funnel is the core configuration that drives nearly every tab in the app. Open **Settings** to manage funnels.

### Creating a Funnel

1. Click **Add Funnel**.
2. Give it a meaningful name (e.g., "Checkout Flow", "Booking Journey").
3. Add **2–10 steps**. Each step requires:
   - **Label** — a human-readable name shown in charts (e.g., "Home", "Search", "Confirm").
   - **Page Identifier(s)** — one or more URL path patterns that identify a step. Supports wildcards:
     - `/search*` — starts with `/search`
     - `*book` — ends with `book`
     - `*journey*` — contains `journey` anywhere
     - `/journeys/*/book` — mid-string wildcard
   - Multiple identifiers per step are combined with **OR** logic (session just needs to match any one).
   - **Step Type** — `view` (a page view) or `request` (an XHR/fetch action).
   - **App Override** (optional) — assign a specific Dynatrace frontend application to this step if it differs from the global default. This enables cross-app funnels.
4. Optionally set **Average Order Value (AOV)** for this funnel to unlock revenue tracking.

### Switching Funnels

Use the **Funnel Selector** dropdown in the header to switch between saved funnels at any time.

### Funnel Discovery

Don't know your funnel steps? Click **Discover Funnels** in Settings to auto-detect candidate journeys from 7 days of session data. Candidates are ranked by session volume and show the detected page sequence. Click **Apply** to pre-populate a new funnel from a candidate.

### Settings Reference

| Setting | Description |
|---|---|
| Default Frontend Application | RUM application name used as the global scope filter |
| Funnels (up to 10) | Named funnel configurations |
| Average Order Value (AOV) | Revenue per conversion — unlocks all revenue features |
| Monthly Infrastructure Cost | Used by FinOps tabs (default $100,000) |
| CDN Monthly Cost | Used by CDN ROI tab (default $100) |
| Compute Cost Per Hour | Used by Idle Capacity (default $100) |
| Cost Per GB | Used by Cost Anomalies (default $100) |
| Engineer Hourly Rate | Used by Performance Tax ROI (default $100) |
| Industry Vertical | 8 verticals — controls AI Insights benchmarks |
| Default Funnel Style | Persisted visualization style for Funnel Overview |
| Default Sankey Style | Persisted chart style for Sankey |
| Default Map View | World / United States / Globe |
| Tab visibility and order | Per parent group and per sub-tab |
| Time-Lapse Hotness Mode | Shared (cross-tab) vs. Tab-specific (per-tab formula) |

### Industry Verticals

The **Industry Vertical** setting calibrates all AI Insights benchmarks to your sector. Available options and their primary effect on benchmarks:

| Vertical | Typical Conv Rate Target | Apdex Target |
|---|---|---|
| E-Commerce | 2–3% | ≥ 0.85 |
| SaaS | 5–8% | ≥ 0.90 |
| Media | 8–12% | ≥ 0.80 |
| Financial Services | 3–5% | ≥ 0.92 |
| Travel | 1–2% | ≥ 0.85 |
| Healthcare | 2–4% | ≥ 0.90 |
| Gaming | 10–15% | ≥ 0.88 |
| General | Moderate | ≥ 0.85 |

---

## 5. Time-Lapse Playback

Time-Lapse lets you replay your selected timeframe bucket-by-bucket to see how metrics evolved over time.

### Controls

The Time-Lapse strip in the header provides:

| Control | Description |
|---|---|
| **Enable checkbox** | Master on/off toggle |
| **Bucket Size** | 1m / 5m / 10m / 30m / 1h — granularity of each playback step |
| **Speed** | 0.5× / 1× / 2× / 4× playback rate |
| **Play / Pause / Restart** | Playback controls |
| **Scrubber slider** | Jump to any bucket manually |
| **Status readout** | Shows current bucket index and time key |

### Hotness Strip

The Hotness Strip is a color-coded timeline below the scrubber. Each bucket is colored based on a Z-score composite of key metrics:

| Color | Meaning |
|---|---|
| Green | Healthy — metrics within normal range |
| Yellow | Elevated — minor anomaly detected |
| Pink | Warm — meaningful deviation |
| Red | High — significant anomaly |

### Hotness Mode (in Settings)

- **Shared mode** — Uses a canonical formula across all tabs: sessions, conversion, Apdex, error rate, latency, and active Davis Problems.
- **Tab-specific mode** — Each tab uses its own formula (e.g., the Funnel tab weighs drop-off spikes more heavily).

### Tab Indicators During Playback

When Time-Lapse is active, each tab shows a colored dot:

| Dot Color | Meaning |
|---|---|
| Blue | This tab is animating with the playback |
| Gray | This tab is showing aggregate (not time-bucketed) data |
| Orange | Time-Lapse does not apply to this tab |

---

## 6. AI Insights

Click the **✦✦✦ button** (three sparkles) in the header to open the AI Insights panel. This panel is context-aware — its content changes based on which sub-tab you are viewing.

The panel provides:

- **Summary card** — One-paragraph narrative of the current state.
- **Insight chips** — Color-coded findings:
  - 🟢 Good — metric meets benchmark
  - 🟡 Warning — metric approaching threshold
  - 🔴 Critical — metric below benchmark
  - 🔵 Info — neutral context or observation
- **Recommendations** — Prioritized action items (High / Medium / Low) with specific guidance tied to the current data.

All analysis is computed client-side using heuristic functions and industry benchmark thresholds from your configured vertical. No data is sent to an external AI API.

---

## 7. Tab Reference

### 7.1 Funnel & Conversion

#### Funnel Overview

The main conversion funnel visualization. Shows the full funnel from Step 1 through your final step.

**KPI Cards (top row):**
- Total Sessions, Conversions, Conversion Rate
- Apdex (overall), Error Rate, Avg Duration

Each KPI card has:
- A **sparkline** in the corner — click it to open a **Forecast Modal** with a 7-day projection and 6 selectable statistical models (Holt-Winters, Triple Exponential Smoothing, Prophet, ARIMA, SARIMA, Linear Regression).
- A **⟷ Correlations button** — opens a full-screen overlay ranking all metrics by their statistical correlation strength with this KPI, with mini sparklines and business narrative descriptions.

**Funnel Visualization:**
Use the **Style selector** to switch between 19 presentation modes:

*Analytical Styles:*
| Style | Description |
|---|---|
| Classic Funnel | Tapered SVG with cascade animation and count-up numbers |
| Horizontal Bar | Waterfall bars with drop-off extensions |
| Stacked Cohort | Marimekko columns split into converted vs. dropped |
| Elapsed-Time Curve | Survival curve: % of sessions remaining vs. cumulative response time |
| Comparison Split | Mirror funnel — current vs. previous period, side-by-side with delta indicators |

*Themed Skins:*
Elevator, MRI Tunnel, Auto Finance, Rocket Launch, Airport, Retail, Cyber, Stadium, Homebuying, Truck Rental, Eye Exam Room, Spectacle Frames, Grocery Aisles, Curbside Pickup — all display the same underlying data in a themed SVG layout.

**Per-Step Data:**
- Session count at each step
- Drop-off count and percentage to next step
- Apdex gauge (per step)
- Revenue at risk annotation (when AOV is configured) — calculated as `drop-off sessions × AOV`

**Period-Over-Period Comparison:**
Toggle the comparison overlay to see current vs. previous period deltas on each step.

---

#### Funnel Analysis

Weekly change intelligence that compares the current 7 days against the prior 7 days.

- **Funnel Candidates** — Ranks all discovered funnels by their conversion impact change. Shows rank movement (↑↓), structural step diffs, session volume, and confidence gating.
- **Managed Watchlist** — Pin specific funnels to the watchlist for persistent monitoring.
- **Action Buckets** — Findings are sorted into:
  - 🔴 **Critical** — requires immediate attention
  - 🟡 **This Week** — should be addressed this sprint
  - 🟢 **Monitor** — no action needed now, but worth watching
- **App Scope Filter** — Narrow candidates to a single app, multiple apps, or all apps.
- **Top-N Slider** — Show the top 1–20 candidates.

---

#### Step Details

Per-step drill-down with full performance breakdowns.

- **Apdex gauge** with satisfaction breakdown (Satisfied / Tolerating / Frustrated percentages and counts)
- **Duration percentiles** — P50, P90, P99 response times
- **Error rate** for the step
- **Revenue at risk** (when AOV is configured)
- **Page Drop-off Contributors** — bar chart showing which pages within a multi-page step have the highest abandonment
- **Compare Pages button** — side-by-side comparison when a step maps to multiple pages
- **Web Vitals toggle** — overlay LCP, CLS, INP, TTFB data for the step's pages

---

#### Trends

Period-over-period comparison chart across 10 metrics:

Sessions, Actions, Conversion Rate, Apdex, Avg Duration, P50, P90, Error Rate, Total Errors, Frustrated %

Each metric shows:
- Current period line
- Previous period line (dashed)
- **Anomaly badge** — applied when the Z-score deviation is statistically significant

---

#### Conversion Attribution

Analyzes which dimensions most influence conversion.

**Attribution Dimensions:** Device type, Browser, Network speed bucket

**Multi-Touch Attribution Models:**
| Model | Description |
|---|---|
| First Touch | 100% credit to the first interaction |
| Last Touch | 100% credit to the final interaction before conversion |
| Linear | Equal credit to all steps |
| Position-Based | 40% to first, 40% to last, 20% spread across middle |
| Time-Decay | More recent interactions get exponentially more credit |
| Influence-Based | Credit weighted by each step's actual conversion influence score |

**Step Influence Cards:**
Each card shows the conditional conversion probability for that dimension × step combination, the projected drop-off cost, and the revenue credit assigned by the selected model.

---

#### Errors & Drop-offs

Correlates errors with funnel abandonment at each step transition.

- **Per-transition error-to-abandonment correlation** — does having an error at step N significantly increase the probability of not reaching step N+1?
- **Predictive drop-off scoring** — linear regression projecting drop-off rates 2 hours forward from the current data.

---

### 7.2 Executive Summary

A single-page leadership dashboard.

**Weighted Letter Grade:**
An overall A–F grade computed from four components:
- Apdex (weighted)
- Conversion Rate vs. vertical benchmark
- Error Rate
- Core Web Vitals composite

**Highlight Cards:** Key metrics at a glance with trend indicators.

**Funnel Bottleneck:** Automatically identifies the step with the worst drop-off rate.

**CWV Snapshot:** Current LCP, CLS, INP, TTFB values with good/poor status.

**Performance Snapshot Table:** All steps with Apdex, error rate, and avg duration.

**Export Options:**
- **Export to PDF** — Generates a print-ready HTML page in a new tab. Click "Print / Save PDF" on that page to save as PDF (A4 format).
- **Copy to Clipboard** — Copies a plain-text version of the summary for pasting into Slack, email, or tickets.

---

### 7.3 User Experience

#### Web Vitals

Core Web Vitals monitoring with Google-standard thresholds.

**Gauges (top row):**
| Metric | Good | Needs Improvement | Poor |
|---|---|---|---|
| LCP (Largest Contentful Paint) | ≤ 2.5s | 2.5–4.0s | > 4.0s |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | 0.1–0.25 | > 0.25 |
| INP (Interaction to Next Paint) | ≤ 200ms | 200–500ms | > 500ms |
| TTFB (Time to First Byte) | ≤ 800ms | 800ms–1.8s | > 1.8s |

**Performance Health Score:** Weighted composite — LCP 35%, CLS 25%, INP 25%, TTFB 15%.

**Daily CWV Trend Chart:** Time-series with Google threshold reference lines.

**Remediation Cards:** Automated recommendations per failing vital with specific fix guidance.

**Page-Level Breakdown Table:** Per-page CWV values sortable by metric.

---

#### Worst Sessions

Surfaces the top 25 most-impactful sessions using a composite **AI Impact Score** (0–100).

**Score Formula:** Z-score normalized across errors, frustrated actions, avg latency, and max latency — multiplied by a systemic factor based on how widely the session's error patterns appear across the user population.

**Key Features:**
- **SYSTEMIC badge** — Sessions where the error/performance pattern appears in > 40% of the overall session population. These represent broad issues affecting many users, not isolated incidents.
- **Behavioral Fingerprint Clusters** — Sessions are grouped by error type + performance bucket + frustration bucket. The "Sessions Like This" count shows how many other sessions share the same fingerprint.
- **Session Replay links** — Direct deep-link into Dynatrace Session Replay for each session.

---

#### Click Issues

Detects rage clicks and dead clicks across your funnel pages.

- **Rage clicks** — Rapid repeated clicks on the same element (user frustration signal).
- **Dead clicks** — Clicks on non-interactive elements (UX/accessibility issue).
- **Frustration Clusters by Page** — Groups click issues by page for prioritization.
- **View Sessions links** — Opens Dynatrace gen3 User Sessions filtered by the specific page and "frustrated experience" attribute.

---

#### Perf Budgets

Define performance budgets for 6 configurable metrics and monitor compliance.

- **Inline-editable thresholds** — Click a threshold value to edit it in place. Changes are persisted per user.
- **NEAR badge** — Applied when a metric is approaching its threshold (within ~15%).
- **Projected time-to-breach** — Linear regression estimate of when the budget will be exceeded if the current trend continues.
- **Workflow Trigger Suggestion** — Generates a Dynatrace Workflow template you can use to automate alerting when a budget is breached.
- **Hourly Apdex Distribution Chart** — Shows Apdex distribution across the day.

---

#### Resource Waterfall

Visualizes resource loading performance per funnel step.

- **P50 and P90 waterfall bars** — Per resource type (document, script, stylesheet, image, XHR, font, other) per step.
- **Top 10 Slowest Resources** — Ranked table with session links for each slow resource.
- **Session Drill-Down panel** — Select a session to see all its resource loads with individual timings. Includes a "View Full Session" link to Dynatrace Session Replay.

---

#### Third-Party Impact

Compares first-party vs. third-party resource loading.

- **Summary cards** — Request count, total payload, and total duration split by first-party vs. third-party.
- **Domain Classification** — Each domain is classified as first-party or third-party based on your configured application domain.
- **Top Domains chart** — Bar chart of the highest-impact third-party domains.
- **CWV Correlation per page** — Does a high third-party load correlate with poor CWV on that page?

---

#### Hyperlyzer

A multidimensional radial performance explorer. Useful for discovering which combination of OS, geography, user action, or browser produces the worst outcomes.

**Radial Chart:**
- 4 quadrants: OS, Geolocation, User Action, Browser.
- Each slice represents a dimension value; bar length is log-scaled to the selected metric.
- A reference line marks the application-wide median.

**Metric Selector:** 8 metrics available (Apdex, Error Rate, Avg Duration, Frustrated %, LCP, CLS, INP, TTFB).

**Cross-Dimensional Filtering:**
- Click a quadrant slice to add it as a filter chip.
- Stack multiple filters across different dimensions (e.g., "iOS + United States + /checkout") to isolate a specific user segment.
- Remove individual chips or clear all filters.

**Finding Cards:** Automatically generated outlier cards highlighting dimension values significantly above or below the application median.

**Side Table:** Paginated breakdown of all dimension values with color-coded ratings and deep-links to Dynatrace Sessions or Web Vitals filtered by that dimension.

---

### 7.4 Navigation & Flows

#### Navigation Paths

Analyzes actual user navigation flows through your site.

**Session Picker:**
- Impact-ranked session list — sessions sorted by how much they deviate from the ideal funnel path.
- Quick filter presets: All / Issues-First / Converted-Only / Low-Apdex-Only.
- User tag filter.
- **Compare Overlay** — Select two sessions side-by-side to compare their paths, timings, and outcomes.

**Navigation Flow Diagram:**
A Sankey-like SVG showing flows between pages. Funnel step nodes are displayed in green with step labels. Non-funnel pages appear in neutral colors. Links are Bézier curves scaled by session volume. The diagram is horizontally scrollable.

**Conversion Probability by Page:**
A ranked table showing each page's estimated conversion probability, computed via iterative graph relaxation using incoming vs. outgoing traffic ratios.

**Session Timeline Scrubber:**
For a selected session, scrub through the timeline to see the sequence of pages visited, actions taken, errors encountered, and their timings.

**AI Path Optimization Card:**
Heuristic recommendations for which pages have the highest potential for conversion improvement based on their position in the navigation graph and their current conversion probability.

---

#### Sankey

A rich flow visualization suite with 9 sub-tabs and 7 chart rendering styles.

**Sub-tabs:**
| Sub-tab | Description |
|---|---|
| **Flow Chart** | Main Sankey flow — who went where after each page |
| **Conversion Paths** | Paths taken by sessions that ultimately converted |
| **Loop Analysis** | Sessions that revisited the same page multiple times (self-loops) |
| **Page Timing** | Median load time per page node, colored by performance |
| **Session Endpoints** | Where sessions ended (exit pages) with counts |
| **Revenue Paths** | Paths weighted by estimated revenue (requires AOV) |
| **Path Trends** | How path popularity changed vs. previous period |
| **Funnel Leakage** | Sessions that left the funnel and their recovery rate |
| **Funnel Velocity** | Time between step transitions per path |

**Chart Styles:**
| Style | Description |
|---|---|
| Classic Sankey | Left-to-right flow with node boxes and proportional-width links |
| Gradient Sankey | Same as Classic but with color gradients on links |
| Directed Flow Graph | Force-directed node layout |
| Alluvial / Columnar | Pages arranged in columns by position in paths |
| State Machine | Nodes and directed edges representing page states |
| Chord Diagram | Circular arc layout; click arcs to highlight a path; Focus Mode available |
| Transition Heatmap | N×N grid of page-to-page transition counts; click rows/columns to highlight |

**Shared Sankey Features:**
- **Funnel page highlighting** — Funnel steps are marked with gold borders and a ★.
- **Exit detection** — Nodes where ≥ 30% of traffic leaves the funnel are marked in red with ⛔.
- **Self-reload detection** — Nodes with page reloads are marked with ⟲.
- **CWV overlay** — Click a node to see its Core Web Vitals.
- **Error overlay** — Click a node to see its error rate.
- **Hover tooltips** — Show top 3 inbound and outbound connections, session counts, and transition percentages.
- **Focus Mode** — Dim all nodes except the selected one and its direct connections.

**Funnel Leakage Sub-tab Details:**

Sessions that leave the funnel are classified as:
- **Straight-Through** — Completed the funnel without leaving.
- **Recoverers** — Left the funnel but returned and completed it.
- **Lost** — Left the funnel and never returned.

Also shows: exit step distribution, off-funnel destination analysis, CWV and error signals for leaking sessions, and revenue impact estimate.

---

#### Geo Heatmap

Country and city-level performance cards showing the top 20 locations by session volume.

- Each card shows: session count, Apdex, error rate, avg duration.
- Apdex is color-coded using a green → yellow → red scale.
- Clicking a location card opens Dynatrace gen3 User Sessions filtered by that country.

---

#### Maps

Interactive choropleth map with three views.

**World Map:**
- SVG choropleth using the Natural Earth projection.
- Countries colored by the selected metric (9 options: Sessions, Apdex, Error Rate, Avg Duration, LCP, CLS, INP, TTFB, Frustrated %).
- Click a country to open User Sessions filtered by that location.
- **Time-Lapse animation** — available on World view. Plays through time buckets to show how geographic performance patterns evolved.

**US State Map:**
- SVG choropleth using the Albers USA projection.
- Same 9 colorize-by metrics as World view.
- Click a state to open User Sessions filtered to that state.

**Globe View:**
- 3D orthographic sphere with data spikes per country.
- Atmospheric glow ring.
- Continuous auto-rotation (double-click the arrow icon to lock rotation).
- Click a data spike to open User Sessions filtered by that country.

---

#### Session Replay Spotlight

Top 50 sessions ranked by composite impact score.

**Score formula:** `errors × 10 + crash × 50 + bounce × 20 + interactions > 10 × 5`

- **Crash badge** — Session ended in a crash.
- **Bounce badge** — Single-page session (user left immediately).
- Each row includes a direct **Session Replay link** into Dynatrace.

---

### 7.5 Intelligence & AI

#### Anomaly Detection

Computes a **Stability Score** (0–100) and monitors 7 metrics for deviations.

- **Stability Score** — Composite score: 100 = fully stable, 0 = severe instability. Computed from per-metric Z-scores vs. historical baselines.
- **Per-step traffic anomaly detection** — Flags unexpected session volume drops at specific steps.
- **Duration Distribution Histogram** — Bar chart of session duration buckets to reveal bimodal or skewed distributions.
- **Automated Diagnosis** — Plain-language description of what the anomaly pattern suggests.
- **Revenue at Risk** — When AOV is set, estimates the revenue impact of the current anomaly.
- **Davis Problems integration** — Surfaces active Dynatrace AI-detected problems that may explain the anomaly.

---

#### Root Cause Correlation

Correlates frontend degradation with backend problems.

**Hourly Timeline Chart:**
SVG line chart showing conversion rate drops alongside latency spikes and error rate spikes in the same time window — visually correlating frontend UX with system events.

**Full-Stack Correlation Topology:**
BFS traversal of the Dynatrace entity relationship graph, walking upstream from your frontend application through up to 7 service tiers. Each service node shows its health status. Clicking a node opens it in the Dynatrace Services app.

**Davis AI Backend Problems Table:**
Lists active or recent Dynatrace AI problems affecting services in your topology. Clickable links to the Dynatrace Problem Inspector.

**Impact Banner:**
When a frontend performance degradation event and a backend Davis problem overlap in time, an Impact Banner highlights the causal relationship.

**Service Flow Topology SVG:**
A left-to-right multi-tier graph with Bézier edges showing call relationships. Problem indicators appear on affected nodes.

---

#### Predictive Forecasting

Projects 7 days forward for 5 metrics: Apdex, Conversion Rate, Error Rate, Avg Duration, and CWV.

- **Days-to-breach estimates** — If the current trend continues, how many days until the metric crosses a threshold?
- **Forecast Modal** — Click any KPI card sparkline to open a full-screen interactive chart with:
  - Historical data line
  - 7-day projection line
  - Confidence band (shaded)
  - Hover crosshair with exact values
  - 6 switchable statistical models: Holt-Winters, Triple Exponential Smoothing, Prophet, ARIMA(5,1,2), SARIMA(3,1,1)(1,1,1,m), Linear Regression
- **Revenue Forecast** — When AOV > 0, projects forward revenue based on the forecasted conversion rate.

---

#### Change Intelligence

Detects performance changes around deployment events.

**Hourly Timeline:**
Deployment event markers are overlaid on a metric timeline. Hover a marker to see which deployments were detected.

**Before / After Comparison:**
For each detected deployment, shows the change in:
- Apdex
- Avg Duration
- Error Rate
- Frustrated %

Each change is classified by **severity** (Improved / Neutral / Degraded / Critical).

---

#### What-If Analysis

Simulate the business impact of infrastructure or performance changes before making them.

**Traffic Simulator:**
- Traffic change slider: 0–5000% of current load.
- Shows projected Apdex degradation and latency increase at the simulated traffic level.
- **Infrastructure Headroom** — Uses live CPU and memory metrics to assess whether current infrastructure can handle the simulated load. Verdict: SUFFICIENT / AT RISK / CRITICAL.

**Latency Improvement Simulator:**
- Latency improvement slider: 0–50% reduction.
- Shows projected conversion rate improvement and revenue uplift.
- **Performance Tax rate** — Estimates the revenue per millisecond currently being lost to latency.

**Revenue Impact section:**
When AOV is configured, all simulated changes include revenue delta projections.

---

### 7.6 Engagement & Revenue

#### Segmentation

Breaks down your funnel metrics by user segment.

**Dimensions:** Device type, Browser, Geography, OS version.

**Per-segment data:**
- Session count
- Apdex
- Conversion rate
- Error rate
- **Estimated Revenue** — `sessions × conversion rate × AOV` (when AOV is configured)

**ISO → Country Name Translation:** Geography codes are automatically expanded to full country names.

**AI Segment Discovery Card:** Heuristic analysis highlighting which segments have the largest gap between their traffic share and their revenue share.

---

#### Cohort Retention

Daily cohort analysis showing how conversion rates evolve for users acquired on each day.

- **Cohort Chart** — Dual-axis: daily new session cohort size (bars) + conversion rate overlay (line).
- **Device-type breakdown** — How cohort composition by device changes day-over-day.
- **Sessions per User** — Engagement depth metric.
- **Daily Detail Table** — Per-day breakdown with sessions, conversions, rate, and revenue.
- **Revenue Totals** — Weekly and period revenue when AOV is configured.

---

#### Session Engagement

Scores each session on a 0–100 engagement scale.

**Engagement Score Formula:**
- Actions taken: 30% weight
- Funnel depth reached: 40% weight
- Error penalty: −30% weight

**Features:**
- **Score Distribution Histogram** — Bar chart of engagement score buckets with conversion rate overlay. Shows where the conversion "cliff" occurs in the engagement distribution.
- **High-Intent Non-Converters** — Sessions with engagement scores > 70 that did not convert. High-priority targets for UX improvement.
- **Revenue Opportunity Estimate** — If the high-intent non-converters could be converted, what is the revenue opportunity?

---

#### Revenue Intelligence

Top-line revenue analytics when AOV is configured.

**KPI Row:** Total revenue, Revenue per session, Revenue per converted session, Revenue at risk.

**Performance Tax Breakdown:**
| Tax Component | Calculation |
|---|---|
| Latency Tax | ~1% conversion loss per 100ms above 1s baseline × AOV × sessions |
| Frustration Tax | ~50% of frustrated sessions estimated to convert at lower rate × delta × AOV |
| Error Tax | ~30% of error sessions estimated to convert less × delta × AOV |

**Funnel Revenue Leakage Table:** Per-step revenue lost to drop-off.

**Revenue Optimization Opportunities:** Ranked list of actions with projected revenue uplift per action (e.g., "Reduce LCP on /checkout by 500ms → +$X/month").

---

#### A/B Comparison

Side-by-side segment comparison for two user groups.

**Dimensions:** Device, Browser, Geography, Custom DQL Filter.

**Preset Comparisons:**
- Desktop vs. Mobile
- Chrome vs. Firefox
- US vs. Non-US

**Custom DQL Segments:** Define arbitrary DQL filter expressions for Segment A and Segment B to compare any two populations.

**Comparison Data:**
- KPI cards for each segment (Sessions, Conv Rate, Apdex, Error Rate, Avg Duration)
- Core Web Vitals side-by-side
- **Estimated Revenue delta** — revenue difference between the two segments

---

### 7.7 Errors & Reliability

#### Exceptions

JavaScript exception analysis with regression detection.

- **KPI Row:** Total exceptions, Unique exception types, Sessions affected, Pages affected.
- **Source Map Deobfuscation:** When source maps are available in Dynatrace, exceptions show the original `file:line:col` location rather than minified references.
- **Regression Classifier:** Each exception is classified as:
  - 🟦 **NEW** — First seen in the current period.
  - 🟡 **RECURRING** — Existed in prior periods with similar volume.
  - 🔴 **REGRESSION** — Volume has significantly increased vs. prior period.
- **Error Inspector links** — Direct deep-links to the Dynatrace Error Inspector pre-filtered by application and page.

---

#### Error Clustering

Groups errors by type and pattern to identify systemic issues.

- **Clusters** — Errors are grouped by error type + normalized message pattern. Each cluster shows occurrence count and session impact count.
- **Hourly Error Trend Chart** — Volume over time per top cluster.
- **Top Clusters Bar Chart** — Visual ranking of clusters by impact.
- **Sample Messages** — Representative error messages for each cluster.

---

#### SLO Tracker

Monitors 6 default SLOs with user-editable targets.

**Default SLOs:**
| SLO | Default Target |
|---|---|
| Apdex | ≥ 0.85 |
| Error Rate | ≤ 1% |
| LCP | ≤ 2500ms |
| CLS | ≤ 0.1 |
| INP | ≤ 200ms |
| TTFB | ≤ 800ms |

**Features:**
- **Inline editing** — Click any target value to modify it.
- **Error Budget Burn-down** — How much of your error budget has been consumed in the current period?
- **Projected Exhaustion Time** — At the current burn rate, when will the error budget be fully consumed?
- **Hourly Trend** — Per-SLO time series for the selected period.
- **Create SLO button** — Opens the Dynatrace SLO management app pre-filled with the metric expression and your configured target. One-click to create an official Dynatrace SLO.

---

### 7.8 FinOps

> FinOps tabs require **Monthly Infrastructure Cost** and other cost settings to be configured in Settings. Without cost data, these tabs show structural zeros.

#### Cost per Conversion

Maps infrastructure spend to conversion outcomes.

- Cost per session
- Cost per conversion
- Revenue:cost ratio
- Per-step cost allocation (where in the funnel is most cost incurred?)
- **Efficiency Scorecard** — Rates your cost efficiency against vertical benchmarks.

---

#### Performance Tax

Quantifies the revenue being lost to performance problems.

- **Latency Tax** — Revenue lost due to page load times above the 1-second baseline.
- **Frustration Tax** — Revenue lost because frustrated users convert less.
- **Error Tax** — Revenue lost because sessions with errors convert less.
- **Lost Conversions** — Total estimated conversions lost across all three components.
- **Break-even Engineering Time** — Given your Engineer Hourly Rate, how many engineering hours would need to be invested to recover the lost revenue?
- **ROI Scenarios Table** — What ROI would you get from a 10%, 20%, or 30% improvement in each tax component?

---

#### Idle Capacity

Identifies wasted infrastructure capacity during low-traffic periods.

- **Idle hours detection** — Hours where traffic is less than 40% of the daily peak are classified as idle.
- **Monthly idle waste estimate** — Idle hours × Compute Cost Per Hour.
- **Hourly Utilization Chart** — Red bars (idle) vs. green bars (utilized) across the day.
- **Autoscaling savings estimate** — How much could autoscaling save by scaling down during idle periods?
- **Right-sizing savings estimate** — Potential savings from matching instance size to actual load.

---

#### CDN ROI

Models the return on investment from CDN adoption or expansion.

- **CDN Latency Savings Model** — Projected latency reduction based on your geography distribution and typical CDN improvement rates.
- **Additional Monthly Revenue** — Revenue uplift from improved conversion due to lower latency.
- **Data Transfer Cost Savings** — Reduction in origin egress costs.
- **Payback Period** — Months until CDN cost is recovered by savings.
- **CDN Candidates Table** — Pages/resources ranked by potential CDN impact score.

---

#### Cost per Transaction

Detailed cost attribution per session and per conversion.

- Revenue per dollar of infrastructure
- Per-service ROI breakdown (when service topology data is available)
- Efficiency trending over the selected period

---

#### SLO Cost Trade-offs

Compares the cost of different reliability tiers.

| Availability Tier | Monthly Downtime | Annual Downtime |
|---|---|---|
| 99.0% ("two nines") | ~7.3 hours | ~3.65 days |
| 99.5% | ~3.65 hours | ~1.83 days |
| 99.9% ("three nines") | ~43.8 minutes | ~8.76 hours |
| 99.95% | ~21.9 minutes | ~4.38 hours |
| 99.99% ("four nines") | ~4.38 minutes | ~52.6 minutes |

- **Revenue at risk per tier** — Estimated revenue lost if downtime matches each tier's allowance.
- **Marginal cost per nine** — How much additional infrastructure investment is needed to move up each tier?
- **Optimal tier recommendation** — Based on your AOV, session volume, and current reliability, which SLO tier maximizes revenue minus infrastructure cost?

---

## 8. Export & Sharing

### Executive Summary → Export to PDF

1. Navigate to **Executive Summary** tab.
2. Click **Export**.
3. A print-ready HTML page opens in a new browser tab.
4. Click "Print / Save PDF" on that page.
5. In your browser print dialog, choose "Save as PDF" as the destination.

The generated report includes: letter grade, KPI highlights, funnel summary, CWV snapshot, and performance snapshot table. Page size is A4.

### Executive Summary → Copy to Clipboard

Click **Copy** on the Executive Summary tab to copy a plain-text version of the summary for pasting into Slack, email, or issue trackers.

### Session Replay Deep-Links

Several tabs provide direct links into Dynatrace Session Replay for individual sessions:
- **Worst Sessions** — per-session Replay link
- **Session Replay Spotlight** — per-row Replay link
- **Resource Waterfall** — "View Full Session" link in the drill-down panel
- **Navigation Paths** — session picker with Replay navigation

### Dynatrace App Deep-Links

The app generates pre-filtered deep-links into other Dynatrace apps:

| Destination | Trigger |
|---|---|
| Dynatrace Error Inspector | Exceptions tab — click an error |
| Dynatrace Services app | Root Cause Correlation — click a service node |
| Dynatrace SLO Management | SLO Tracker — "Create SLO" button |
| Dynatrace gen3 User Sessions | Maps, Click Issues, Geo Heatmap — click a location/cluster |
| Dynatrace Web Vitals / Experience | Step Details, Navigation Paths — page-level links |

---

## 9. Glossary

| Term | Definition |
|---|---|
| **Apdex** | Application Performance Index — a 0–1 satisfaction score. Satisfied ≤ 3000ms, Tolerating ≤ 12000ms, Frustrated > 12000ms. |
| **AI Impact Score** | A 0–100 session severity score (Worst Sessions tab) computed from Z-normalized errors, frustrated actions, and latency, multiplied by a systemic factor. |
| **AI Insights** | Contextual, heuristic analysis panel (✦✦✦ button). All computation is client-side — no external AI API. |
| **AOV (Average Order Value)** | Revenue per conversion. Configures all revenue features when set > 0. |
| **Behavioral Fingerprint** | Session grouping key: error types + performance bucket + frustration bucket. Used for cluster analysis in Worst Sessions. |
| **CDN** | Content Delivery Network — referenced in FinOps CDN ROI tab. |
| **Change Intelligence** | Detects and quantifies performance changes around deployment events. |
| **Chord Diagram** | A circular Sankey rendering style where pages are arcs on a ring and flows are arcs connecting them. |
| **Conversion** | A session that reached all defined funnel steps in sequence. |
| **Conversion Probability** | A graph-based per-page score estimating the likelihood that a session visiting that page will ultimately convert. |
| **Cross-App Funnel** | A funnel where individual steps span different Dynatrace frontend applications. |
| **CWV** | Core Web Vitals — LCP, CLS, INP, TTFB. |
| **Davis Problems** | Dynatrace AI-detected anomaly problems surfaced in Anomaly Detection and Root Cause Correlation. |
| **Drop-off / Abandonment** | Users who entered a funnel step but did not proceed to the next step. |
| **DQL** | Dynatrace Query Language — all app data is fetched via DQL from the connected Dynatrace environment. |
| **Error Budget** | The allowed amount of SLO violations in a period. Tracked by SLO Tracker. |
| **Frustrated** | Apdex satisfaction tier for sessions with duration > 12000ms. |
| **Full-Stack Correlation** | BFS traversal of the service topology graph connecting frontend degradation to backend problems (up to 7 tiers). |
| **Funnel** | A named collection of steps defining one user journey. Up to 10 can be saved. |
| **Funnel Discovery** | Automatic candidate detection from 7 days of session data. |
| **Funnel Leakage** | Sessions that leave the defined funnel path before converting. Classified as Straight-Through, Recoverers, or Lost. |
| **Funnel Skin / Style** | The visual presentation mode for Funnel Overview (19 options: analytical or themed). |
| **Funnel Velocity** | Time elapsed between funnel step transitions per session. |
| **Hotness / Heat Strip** | Color-coded Time-Lapse timeline indicating anomaly intensity per bucket. Green = healthy, red = high anomaly. |
| **Hotness Mode** | Shared (canonical cross-tab Z-score) vs. Tab-specific (per-tab formula) computation for the Heat Strip. |
| **Hyperlyzer** | Multidimensional radial performance explorer across OS, geo, user action, and browser dimensions. |
| **Industry Vertical** | App setting that calibrates AI Insights benchmarks to your sector (E-Commerce, SaaS, Media, etc.). |
| **Latency Tax** | Estimated revenue lost due to page load times above the 1-second baseline (~1% conversion loss per 100ms). |
| **Navigation Flow Diagram** | SVG flow visualization in Navigation Paths using BFS column assignment and Bézier links. |
| **Pattern Clusters** | Groups of sessions sharing the same behavioral fingerprint. |
| **Performance Tax** | Aggregate revenue lost across Latency Tax, Frustration Tax, and Error Tax. |
| **Revenue at Risk** | Drop-off sessions × AOV — the revenue lost at a specific funnel step. |
| **Sankey** | Flow diagram visualizing how users move between pages. The Sankey tab has 9 sub-tabs and 7 chart styles. |
| **Sankey Style** | The rendering mode for the Sankey chart (Classic, Gradient, Directed Flow, Alluvial, State Machine, Chord, Transition Heatmap). |
| **Satisfied** | Apdex satisfaction tier for sessions with duration ≤ 3000ms. |
| **SLO** | Service Level Objective — a target for a specific performance or reliability metric. |
| **Step** | A single stage in the funnel. Defined by a label, page identifier(s), step type, and optional app override. |
| **Systemic / SYSTEMIC** | A session or error whose pattern appears in > 40% of the total session population — indicating a broad issue, not an isolated incident. |
| **Time-Lapse** | Historical playback feature that animates through time buckets (1m–1h) to show metric evolution. |
| **Tolerating** | Apdex satisfaction tier for sessions with duration between 3000ms and 12000ms. |
| **Transition Heatmap** | An N×N grid Sankey style showing page-to-page transition frequencies as color-coded cells. |
