# User Journey & Experience App — Design Document

## Non-Strato Third-Party Libraries

| Library | Version | Purpose | Used In |
|---------|---------|---------|---------|
| **d3-geo** | ^3.1.1 | Cartographic projections (`geoNaturalEarth1`, `geoAlbersUsa`) and SVG path generation (`geoPath`) for geographic heatmap visualizations | `ui/app/pages/UserJourney.tsx` — WorldMap tab |
| **topojson-client** | ^3.1.0 | Converts TopoJSON topology data into GeoJSON features for map rendering via `feature()` | `ui/app/pages/UserJourney.tsx` — WorldMap tab |
| **world-atlas** | ^2.0.2 | TopoJSON dataset of world country boundaries (110m resolution) | `ui/app/pages/UserJourney.tsx` — WorldMap tab (global view) |
| **us-atlas** | ^3.0.1 | TopoJSON dataset of US state boundaries (10m resolution) | `ui/app/pages/UserJourney.tsx` — WorldMap tab (US drill-down view) |
| **react-router-dom** | ^6.22.2 | Client-side routing (`BrowserRouter`, `Routes`, `Route`) for page-level navigation between UserJourney and ObservabilityJourney | `ui/main.tsx` (BrowserRouter wrapper), `ui/app/App.tsx` (route definitions) |
| **react-intl** | 6.6.2 | Required peer dependency of Strato form components (IntlProvider for i18n context) — not directly imported in app code but needed at runtime | Peer dependency consumed by Strato internally |

### Notes

- **Geographic stack** (`d3-geo` + `topojson-client` + `world-atlas` + `us-atlas`): These four libraries work together to render the interactive SVG world/US maps in the Geographic tab. Country/state shapes are stored as TopoJSON, converted to GeoJSON features, projected onto 2D coordinates, and rendered as SVG `<path>` elements. The helper file `ui/app/worldMapPaths.ts` provides ISO alpha-2 → numeric code mappings for correlating DQL geo data with atlas geometry IDs.
- **react-router-dom**: Provides two routes — `/` (UserJourney, the 36-tab main experience) and `/journey` (ObservabilityJourney maturity model). The `BrowserRouter` uses `basename="ui"` to align with the Dynatrace app shell URL structure.
- **react-intl**: Not imported directly by any application component. It is a peer dependency required by Strato form input components at runtime. Installed explicitly to satisfy peer resolution.

---

## Overview

The User Journey & Experience App is a 36-tab frontend observability suite built as a Dynatrace Platform App, organized into 8 parent tab groups with nested sub-tabs. It provides comprehensive Real User Monitoring (RUM) analysis including funnel tracking, Web Vitals, geographic heatmaps, predictive forecasting, automated anomaly detection, and multidimensional radial performance exploration — all powered by DQL (Dynatrace Query Language).

**Architecture**: Single-page React app using Strato Design System components, `@dynatrace-sdk/react-hooks` (`useDql`) for data fetching, and SVG-based custom visualizations. All queries are parameterized by funnel step definitions (each with its own app assignment), a default frontend application, and timeframe. Funnels can span multiple apps — step-scoped queries use `in(frontend.name, {"app1", "app2"})` when the funnel references more than one application.

---

## Tab Group Structure

The 36 sub-tabs are organized into **8 parent tab groups** with nested Strato `<Tabs>` navigation:

| # | Parent Tab Group | Sub-Tabs |
|---|---|---|
| 1 | **Funnel & Conversion** | Funnel Overview, Step Details, Trends, Conversion Attribution, Errors & Drop-offs |
| 2 | **Executive Summary** | Executive Summary (standalone) |
| 3 | **User Experience** | Web Vitals, Worst Sessions, Click Issues, Perf Budgets, Resource Waterfall, Third-Party Impact, Hyperlyzer |
| 4 | **Navigation & Flows** | Navigation Paths, Sankey, Geo Heatmap, Maps, Session Replay Spotlight |
| 5 | **Intelligence & AI** | Anomaly Detection, Root Cause Correlation, Predictive Forecasting, Change Intelligence, What-If Analysis |
| 6 | **Engagement & Revenue** | Segmentation, Cohort Retention, Session Engagement, Revenue Intelligence, A/B Comparison |
| 7 | **Errors & Reliability** | Exceptions, Error Clustering, SLO Tracker |
| 8 | **FinOps** | Cost per Conversion, Performance Tax, Idle Capacity, CDN ROI, Cost Anomalies, Right-Sizing, Cost per Transaction, Cloud Waste, Scaling Efficiency, SLO Cost Trade-offs, Tag Allocation, Observability ROI |

**Key architecture decisions**:
- Parent tab groups and sub-tabs are independently reorderable and toggleable via Settings
- Parent tab visibility hides the entire group; sub-tab visibility hides individual views
- Both orders are persisted per user via Dynatrace App State (`uj-parent-tab-order`, `uj-parent-tab-visibility`, `uj-sub-tab-order`)
- AI Insights is sub-tab aware — the analysis panel updates based on the active sub-tab within each group
- The `TAB_GROUPS` constant defines the default grouping; `TAB_TO_PARENT` provides reverse lookup

---

## Cross-Cutting Features

### Related Metrics — Cross-Metric Correlation Discovery

**Purpose**: Allow users to discover which metrics have a statistically significant relationship with any given KPI, helping identify root causes and contributing factors.

**Implementation** (`ui/app/components/CorrelationsPanel.tsx`):
- **Pearson correlation coefficient** (r) computed between sparkline time-series arrays of all registered metrics
- **Central metrics registry**: 11 metrics registered from top-level sparkline data (Sessions, Total Actions, Conversion Rate, Conversions, Apdex, Avg Duration, P50/P90 Duration, Error Rate, Errors, Frustrated, Revenue)
- **Context pattern**: `CorrelationsContext` provides `registry`, `register`, and `open` functions — wraps all tabs alongside `ForecastProvider` and `AIInsightsContext.Provider`
- **Trigger**: ⟷ button appears on hover in KPI cards (via `kpi-related-btn` CSS class) and Trends cards. Click opens the panel for that metric
- **Panel**: Full-screen overlay with ranked correlation results, mini sparklines, strength bars, direction descriptions, and business-context narratives
- **Threshold filter**: User can toggle between 30%+, 50%+, 70%+ minimum correlation strength
- **Direction-aware narratives**: Explains whether a positive or inverse relationship exists and what it means in context (e.g. "when Sessions rises, Error Rate tends to worsen")
- Minimum 3 sparkline data points required for meaningful correlation computation

### Cross-App Funnels — Per-Step Application Assignment

**Purpose**: Allow funnel steps to span multiple Dynatrace frontend applications (e.g. marketing site → checkout app → post-purchase portal).

**Implementation** (`ui/app/SettingsContext.tsx`, `ui/app/pages/UserJourney.tsx`):
- **`StepDef` type** extended: `{ label: string; identifiers: string[]; type: "view" | "request"; app?: string }` — optional `app` field overrides the default frontend for that step
- **Default frontend**: The top-level "Default Frontend Application" setting serves as the fallback when a step has no explicit `app`
- **`frontendFilter(steps, fallback)` helper**: Computes the DQL filter clause — returns `frontend.name == "X"` for single-app funnels or `in(frontend.name, {"X", "Y"})` for multi-app funnels
- **`uniqueApps(steps, fallback)` helper**: Extracts the distinct set of apps referenced across all steps
- **Settings UI**: Each step has its own Application dropdown. New steps inherit the previous step's app. Steps assigned to a different app show a "(different app)" indicator in purple
- **Pages/Identifiers**: The page dropdown for each step shows only pages from that step's assigned app (fetched via `availablePagesMultiAppQuery` which retrieves pages for all referenced apps in a single query, then the UI filters client-side by step app)
- **Backward compatible**: Saved step definitions without an `app` field automatically inherit the default frontend app. Migration logic in `SettingsProvider` preserves `app` when present
- **AI Insights**: When a funnel spans multiple apps, the AI panel surfaces a cross-app insight noting the architecture and advising on session correlation verification

**Query impact**: All ~37 step-scoped query functions now use `${frontendFilter(steps, frontend)}` instead of `frontend.name == "${frontend}"`. Non-step queries (Sankey, CWV, Session Replay) continue using the default frontend.

### Multi-Funnel Management & Discovery

**Purpose**: Allow users to define, persist, and switch between up to 10 independent funnel configurations. Includes automatic funnel discovery from session data.

**Data Model** (`ui/app/SettingsContext.tsx`):
- **`FunnelDef` type**: `{ name: string; steps: StepDef[] }` — each funnel is a named set of steps
- **Constants**: `MAX_FUNNELS = 10`, `DEFAULT_FUNNELS: FunnelDef[] = []` (empty — forces Settings on first launch)
- **Storage keys**: `uj-funnels` (JSON array of `FunnelDef`), `uj-active-funnel` (index as string)
- **Context exports**: `funnels`, `activeFunnelIndex`, `saveFunnels()`, `saveActiveFunnelIndex()`, plus backward-compat `steps`/`setSteps`/`saveSteps` (derived from active funnel)

**Migration**: On load, reads `uj-funnels` first. If absent, checks legacy `uj-funnel-steps` key and wraps in `[{ name: "My Funnel", steps }]`. New installs start with empty array.

**UI — Header Funnel Selector** (`UserJourney.tsx`):
- Dropdown positioned left of the Timeframe selector in the app header
- Shows active funnel name; lists all funnels for quick switching
- Selecting a funnel updates `activeFunnelIndex` → all tabs re-render with the new funnel's steps

**UI — Settings Funnel Management**:
- **Funnel tabs**: Horizontal tab row showing all funnels by name, highlighted active tab, "+ New Funnel" button (disabled at MAX_FUNNELS)
- **Per-funnel editor**: Editable name field, Delete button (with confirmation for last funnel), and the existing step editor scoped to that funnel's steps
- **Auto-open Settings**: A `useEffect` detects `funnels.length === 0` and opens Settings automatically on first launch

**UI — Funnel Discovery** (`FunnelDiscovery` component):
- **App selection**: Multi-select dropdown of available applications
- **Discovery query** (`funnelDiscoveryQuery`): Analyzes 7 days of session data to find common sequential page patterns (grouped by session, ordered by timestamp, filtered by min 3 distinct pages)
- **Circular path deduplication**: When building candidates, each page is tracked as visited — if a user revisits a page already in the funnel (e.g. `/home → /auth → /home`), the revisit is dropped so the funnel only contains each page once (e.g. `/home → /auth`). This handles circular navigation without discarding the rest of the path (e.g. `/home → /cart → /auth → /home → /checkout` becomes `/home → /cart → /auth → /checkout`)
- **Candidate list**: Shows discovered funnel candidates with step count, session volume, and page sequence preview
- **Apply flow**: Click Apply → enter funnel name → funnel is appended to the funnels array and activated

**Per-Funnel Settings** (embedded in `FunnelDef`):
- Each funnel stores its own AOV, FinOps costs (monthly infra, CDN, compute/hour, cost/GB, engineer hourly rate), and industry type
- Context still exposes flat `aov`, `saveAov`, `industry`, `saveIndustry`, etc. — consumers are unaware of per-funnel storage
- **Legacy migration**: If a funnel has no embedded settings, falls back to the old global state keys (`uj-average-order-value`, `uj-monthly-infra-cost`, etc.) then to compile-time defaults
- Once saved per-funnel, the embedded value takes precedence over legacy global keys

---

## Tab Reference

### 1. Funnel Overview

**Purpose**: Visualize user progression through defined funnel steps with conversion rates, Apdex scoring, and drop-off analysis.

**Key Features**:
- Colorized SVG funnel with step-by-step conversion percentages
- **5 visualization styles**: Classic (tapered SVG), Horizontal Bar (waterfall with drop-off extensions), Stacked Cohort (Marimekko columns split into converted/dropped), Elapsed-Time Curve (survival curve plotting % remaining vs. cumulative response time), Comparison Split (mirror funnel — current vs. previous period side-by-side with delta indicators)
- Default funnel style configurable via Settings and persisted per user
- **Cascade fade-in animation**: segments and labels stagger in with 120ms delay per step using CSS `@keyframes funnelSegmentIn` (opacity + translateY + scaleY)
- **Count-up animation**: session numbers animate from 0 to target value with cubic ease-out (800ms duration via `useCountUp` hook + `CountUpText` SVG component)
- Period-over-period comparison overlay (optional)
- Per-step Apdex gauges and satisfaction breakdowns
- KPI cards: Total Sessions, Conversions, Conversion Rate, Apdex, Error Rate, Avg Duration
- **Enhanced KPI cards**: Inline sparklines (time-bucketed trend shapes), comparison arrows showing % delta vs. previous period, one-click forecast popup (opens ForecastModal with 6 statistical models: Holt-Winters, Triple Exp., Prophet, ARIMA, SARIMA, Linear Regression), and **Related Metrics** correlation discovery button (⟷) showing Pearson-correlated metrics ranked by strength
- **Forecast Modal** (`ui/app/components/ForecastModal.tsx`): Full-screen overlay with interactive SVG chart showing historical data + 7-day forecast + confidence band. Supports model switching via dropdown. Hover crosshair shows exact values. Click-outside or Close button to dismiss
- **Revenue lost annotations** per funnel drop-off step when AOV is configured (shows estimated $ lost at each stage)

**Queries**:

```dql
-- sessionFlowQuery: Strict sequential funnel progression
fetch user.events, from: now() - {timeframe}
| filter {frontendFilter}  -- frontend.name == "X" (single app) or in(frontend.name, {"X","Y"}) (multi-app)
| filter {anyStepFilter}
| fieldsAdd step_tag = coalesce(if(view.name == "/home", "Home"), if(view.name == "/search", "Search"), ..., "other")
| summarize steps = collectDistinct(step_tag), by: {dt.rum.session.id}
| fieldsAdd reached_step1 = iAny(steps[] == "step1"), reached_step2 = iAny(steps[] == "step2"), ...
| summarize total_sessions = count(), at_step1 = countIf(reached_step1), at_step2 = countIf(reached_step1 AND reached_step2), ...
```

```dql
-- stepMetricsQuery: Per-step Apdex + duration percentiles
fetch user.events, from: now() - {timeframe}
| filter {frontendFilter}  -- derived from per-step app assignments
| filter {stepFilters}
| fieldsAdd dur_ms = toDouble(duration) / 1000000
| fieldsAdd step_tag = {stepTagExpr}
| fieldsAdd satisfaction = if(dur_ms <= 3000, "satisfied", else: if(dur_ms <= 12000, "tolerating", else: "frustrated"))
| summarize sessions = countDistinctExact(dt.rum.session.id), total_actions = count(), avg_duration_ms = avg(dur_ms), p50 = percentile(dur_ms, 50), p90 = percentile(dur_ms, 90), p99 = percentile(dur_ms, 99), error_count = countIf(characteristics.has_error), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {step_tag}
```

```dql
-- sessionQualityQuery: Overall quality metrics
fetch user.events, from: now() - {timeframe}
| filter {frontendFilter}
| filter {anyStepFilter}
| fieldsAdd dur_ms = toDouble(duration) / 1000000
| fieldsAdd satisfaction = if(dur_ms <= 3000, "satisfied", else: if(dur_ms <= 12000, "tolerating", else: "frustrated"))
| summarize total_actions = count(), total_sessions = countDistinctExact(dt.rum.session.id), avg_duration = avg(dur_ms), p50_duration = percentile(dur_ms, 50), p90_duration = percentile(dur_ms, 90), error_count = countIf(characteristics.has_error), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated")
```

---

### 2. Trends

**Purpose**: Period-over-period comparison showing improvement or degradation across 10 key metrics.

**Key Features**:
- Delta arrows with percentage change
- Color-coded improvement/degradation indicators
- 10 metrics: Sessions, Actions, Conversion Rate, Apdex, Avg Duration, P50, P90, Error Rate, Total Errors, Frustrated %
- Anomaly badges (⚠ Anomaly / ↑ Notable / ∿ Normal) powered by z-score analysis
- AI Assist recommends drill-to-forecast when negative trends detected

**Queries**: Reuses `sessionQualityQuery` and `sessionFlowQuery` for both current and previous period (2x timeframe shifted back).

---

### 3. Web Vitals

**Purpose**: Track Core Web Vitals (LCP, CLS, INP, TTFB) with good/poor threshold classification, trend visualization, and automated remediation recommendations.

**Key Features**:
- Gauge visualizations per metric with color thresholds
- Weighted Performance Health Score (LCP 35%, CLS 25%, INP 25%, TTFB 15%)
- **CWV Trend Chart**: Daily bucketed line chart (LCP, INP, TTFB on shared axis; CLS on separate scale) with Google threshold dashed lines and trend direction indicators (▲ better / ▼ worse / ● stable)
- **Automated Remediation Recommendations**: Per-failing-vital cards (anomaly-card style) showing status badge (FAILING/NEEDS IMPROVEMENT), top 3 offending pages, and 5 actionable fix recommendations
- Failing Vitals KPI (0–4 count)
- Page-level breakdown table
- Threshold reference card

**Queries**:

```dql
-- cwvQuery: Aggregate CWV averages from user events (NOT timeseries metrics — those return zeros)
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd lcp_ms = web_vitals.largest_contentful_paint, cls_val = web_vitals.cumulative_layout_shift, inp_ms = web_vitals.interaction_to_next_paint, ttfb_ms = web_vitals.time_to_first_byte
| summarize lcp_avg = avg(lcp_ms), cls_avg = avg(cls_val), inp_avg = avg(inp_ms), ttfb_avg = avg(ttfb_ms)
```

```dql
-- cwvByPageQuery: CWV per page
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd lcp_ms = web_vitals.largest_contentful_paint, cls_val = web_vitals.cumulative_layout_shift, inp_ms = web_vitals.interaction_to_next_paint, ttfb_ms = web_vitals.time_to_first_byte, fcp_ms = web_vitals.first_contentful_paint
| summarize lcp_avg = avg(lcp_ms), cls_avg = avg(cls_val), inp_avg = avg(inp_ms), ttfb_avg = avg(ttfb_ms), load_avg = avg(fcp_ms), by: {view.name}
| sort lcp_avg desc
| limit 20
```

---

### 4. Step Details

**Purpose**: Deep-dive into individual funnel steps with Apdex, satisfaction distribution, and duration percentiles. For multi-page steps, Compare Pages reveals per-page metrics with delta indicators and Core Web Vitals.

**Key Features**:
- Per-step Apdex gauge with label (Excellent/Good/Fair/Poor)
- Satisfaction bar (satisfied/tolerating/frustrated breakdown)
- Duration percentiles (P50, P90, P99)
- Error rate per step
- Links to Dynatrace Vitals app (skips wildcard/placeholder identifiers)
- **Revenue at Risk** metric box per step: `dropOff × AOV` showing dollar value of users lost at each step (visible when AOV > 0)
- **Page Drop-off Contributors** funnel (multi-page steps): Horizontal bar chart ranking pages within each step by event count, color-coded by Apdex quality (green/amber/red), with percentage drop indicators showing relative volume vs. the top page
- **Web Vitals** button (single-page steps): Toggleable CWV panel showing LCP, CLS, INP color-coded against Google thresholds with Good/Needs Improvement/Poor labels
- **Compare Pages** button (multi-page steps only): Expands per-page breakdown with individual Apdex, durations, satisfaction counts. First page is the primary baseline; all other pages show delta indicators (▲/▼ with %) against it. Each page also shows **LCP, CLS, INP** color-coded against Google CWV thresholds.

**Queries**: Reuses `stepMetricsQuery` for aggregate step metrics. Adds `pageMetricsQuery` (groups by `view.name` instead of `step_tag`) for per-page breakdown. Uses `cwvByPageQuery` for per-page Core Web Vitals (LCP, CLS, INP).

---

### 5. Worst Sessions

**Purpose**: Surface the worst-performing sessions using an ML-driven AI Impact Score that distinguishes systemic issues from isolated outliers. Sessions are clustered by behavioral fingerprint to reveal repeatable patterns.

**Key Features**:
- **AI Impact Score (0–100)**: Z-score normalized across 4 severity dimensions (errors 35%, frustrated actions 30%, avg latency 20%, max latency 15%), multiplied by a systemic factor. Sessions whose error types appear across many other sessions score higher; unique outliers are dampened.
- **"Sessions Like This" cluster count**: Behavioral fingerprint (error types + performance bucket + frustration bucket) groups sessions into clusters. Shows how many other sessions share the same pattern.
- **SYSTEMIC badge**: Sessions with systemic score > 0.4 (shared error patterns across 40%+ of the population)
- **Pattern Clusters section**: Systemic vs. Outlier counts, distinct behavioral patterns, top cluster descriptions
- Top 25 sessions (from 50 fetched) after scoring & re-ranking
- Session Replay direct links
- Per-session metrics: Impact, Cluster, actions, avg/max duration, errors, frustrated, Apdex
- Summary cards: Avg Impact Score, Frustrated Actions, Total Errors, Avg Peak Duration, Worst Apdex

**Scoring Algorithm**:
1. Z-score normalize each session's errors, frustrated, avgDur, maxDur against the population
2. Severity = weighted sum (0.35·errZ + 0.30·fruZ + 0.20·avgDurZ + 0.15·maxDurZ)
3. Systemic factor = (mean error-type frequency × 0.7 + mean page frequency × 0.3) across session's errors/pages
4. Impact = severity × (0.4 + systemic × 0.6), capped at 100

**Queries**:

```dql
-- worstSessionsQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd dur_ms = toDouble(duration) / 1000000
| fieldsAdd satisfaction = if(dur_ms <= 3000, "satisfied", else: if(dur_ms <= 12000, "tolerating", else: "frustrated"))
| fieldsAdd pageName = coalesce(view.name, url.path, "unknown")
| fieldsAdd errName = if(characteristics.has_error == true, coalesce(error.display_name, error.type, "error"), "")
| summarize actions = count(), avg_dur = avg(dur_ms), max_dur = max(dur_ms), p90_dur = percentile(dur_ms, 90), errors = countIf(characteristics.has_error), frustrated = countIf(satisfaction == "frustrated"), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), start_ts = min(start_time), pages = collectDistinct(pageName), error_types = collectDistinct(errName), by: {dt.rum.session.id}
| sort frustrated desc, errors desc, max_dur desc
| limit 50
```

---

### 6. Exceptions

**Purpose**: JavaScript exception analysis with inline source map deobfuscation and regression detection.

**Key Features**:
- Error grouping by error name/ID
- Occurrences, affected sessions, affected pages
- First/last seen timestamps
- Direct links to Dynatrace Error Inspector
- **Source map deobfuscation**: Parses file:line:col from error names, displays inline monospace "Source" row
- **Regression detector**: Compares current vs previous period — classifies as NEW (first appearance), RECURRING (in both periods), or REGRESSION (previously fixed, returned)
- Status badges: NEW (cyan), RECURRING (yellow), REGRESSION (red)
- KPI summary: Unique Exceptions, Total Occurrences, Affected Sessions, New, Recurring, Regressions
- Metric Forecasts-style cards with compact grid layout and severity-colored left border
- Impact bars visualization

**Queries**:

```dql
-- jsErrorsQuery (+ prev period variant)
fetch user.events, from: now() - {timeframe}, samplingRatio: 1
| filter frontend.name == "{frontend}"
| filter characteristics.has_error
| filter error.type == "exception"
| summarize occurrences = count(), affected_users = countDistinct(dt.rum.instance.id), affected_sessions = countDistinct(dt.rum.session.id), first_seen = min(start_time), last_seen = max(start_time), pages = collectDistinct(view.name), sample_stack = takeFirst(stackLocation), by: {error.id, errorName}
| sort occurrences desc
| limit 30
```

---

### 7. Click Issues

**Purpose**: Detect rage clicks and dead clicks indicating UX frustration.

**Key Features**:
- Rage click detection (rapid repeated clicks)
- Dead click detection (clicks with no response)
- Occurrences, affected sessions, target elements, pages
- UX frustration indicators
- **Frustration Clusters by Page**: Groups all rage/dead click elements per page with aggregated counts, severity, and session impact
- **Session Replay Links**: "View Sessions ↗" button per cluster opens User Sessions (gen3) filtered by app (`frontend`), page name, and frustrated user experience. Uses `buildSessionsLink()` helper.
- **Replay column**: When replay data is available, shows per-session clickable links via `buildSessionIdLink()` for instant replay navigation
- **Cluster Map**: Built from `replayData` (second DQL query) — maps page+element combinations to session IDs for linking

**Queries**:

```dql
-- clickIssuesQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter in(event.type, {"rageClick", "deadClick"})
| summarize occurrences = count(), affected_sessions = countDistinctExact(dt.rum.session.id), by: {event.type, view.name, target.element}
| sort occurrences desc
| limit 30
```

---

### 8. Perf Budgets

**Purpose**: Performance budget compliance monitoring with user-configurable thresholds, projected time-to-breach, and near-breach alerting.

**Key Features**:
- 6 budget metrics: Apdex >= 0.85, Conversion >= 20%, Avg Duration <= 2s, P90 <= 4s, Error Rate <= 2%, Frustrated <= 10% (all configurable)
- **User-configurable thresholds**: Click ✎ icon per metric to edit inline. Values persisted per user via `useUserAppState`. Reset button restores defaults.
- **Projected time-to-breach**: Compares current vs previous period, computes daily rate of change, projects when a passing metric will cross its threshold
- **Near-breach alerting**: Yellow "NEAR" badge + alert banner when a metric is within 10% of its threshold
- **Workflow trigger suggestion**: When near-breach detected, shows DQL condition template for Dynatrace Workflow automation
- Pass/fail/near status with margin to threshold
- "Near Breach" KPI card in summary row
- Budget Summary Table with "Breach" column (NOW / ~Np / Safe)
- Hourly Apdex distribution chart

**Queries**:

```dql
-- hourlyDistributionQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd dur_ms = toDouble(duration) / 1000000, hour = getHour(timestamp)
| fieldsAdd satisfaction = if(dur_ms <= 3000, "satisfied", else: if(dur_ms <= 12000, "tolerating", else: "frustrated"))
| summarize actions = count(), avg_dur = avg(dur_ms), p90_dur = percentile(dur_ms, 90), errors = countIf(characteristics.has_error), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {hour}
```

Also reuses `sessionQualityQuery`.

---

### 9. Geo Heatmap

**Purpose**: Country and city-level performance heatmap with Apdex coloring and satisfaction breakdowns.

**Key Features**:
- Country-level performance cards (top 20)
- City drill-down table
- Clickable → links to User Sessions filtered by location
- Apdex color scale

**Queries**:

```dql
-- geoPerformanceQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd dur_ms = toDouble(duration) / 1000000, satisfaction, country = geo.country.name, city = geo.city.name, lcp_ms, cls_val, inp_ms
| summarize actions = count(), sessions = countDistinctExact(dt.rum.session.id), avg_dur = avg(dur_ms), p90_dur = percentile(dur_ms, 90), errors = countIf(characteristics.has_error), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), lcp_avg = avg(lcp_ms), cls_avg = avg(cls_val), inp_avg = avg(inp_ms), by: {geo.country.isoCode, geo.country.name, geo.city.name}
| sort sessions desc
| limit 50
```

---

### 10. Map

**Purpose**: Interactive choropleth map with World and US state views.

**Key Features**:
- World map (d3-geo Natural Earth projection + world-atlas TopoJSON)
- US state map (Albers USA projection + us-atlas TopoJSON)
- 9 colorize-by metrics: Sessions, Avg Duration, Apdex, Error Rate, LCP, CLS, INP, Est. Revenue (AOV), Conversion Rate
- Conversion Rate uses two-pass session-level DQL query (per-country funnel completion %)
- **Time-Lapse animation mode** (World view): plays through map snapshots with configurable bucket size (1 min, 5 min, 10 min, 30 min, 1 hour); Play/Pause, scrubber slider, time label. Clicking a country during Time-Lapse drills into User Sessions scoped to that country and the exact time bucket displayed.
- **Globe view**: 3D orthographic sphere with data spikes showing metric magnitude per country. Atmospheric glow ring, country outlines, grid lines. Hold ◀/▶ arrows to smoothly rotate the globe, or double-click an arrow to lock continuous rotation (double-click again or click any arrow to stop). Locked arrows highlight blue. Spikes are clickable and link to User Sessions.
- Clickable countries/states/spikes link to User Sessions (in timelapse: scoped to current bucket timeframe)
- Hover tooltips with full metrics
- Conv % column in ranked table

**Queries**: `geoPerformanceQuery` (primary), `geoConversionQuery` (per-country conv rate), `mapTimelapseQuery` (hourly buckets), US state aggregation.

---

### 11. Navigation Paths

**Purpose**: Reveal actual user navigation flows, unexpected paths, loops, and exit points.

**Key Features**:
- Top navigation flows grouped by source page
- Funnel-aligned path tagging
- Transition counts and average session depth
- Direct links to Vitals app per page
- **Navigation Flow Diagram**: Sankey-like SVG visualization — pages arranged in columns by funnel step (BFS-based layer assignment, no MAX_PER_LAYER limit), curved links whose thickness represents traffic volume. Funnel page nodes are 220×74px (3 rows: ★ Step N: label, page name, traffic count); non-funnel nodes are 220×52px (page name + count). Funnel step label shown in green above page name inside each green box. Horizontally scrollable when paths exceed viewport width.
- **Session triage filters**: Optional user tag filter and optional direct session filter (session can be selected without user tag). Session picker includes converted/error/apdex/duration/action metadata.
- **Quick presets + ranking**: Presets for all sessions, issues-first, converted-only, and low-apdex-only. Sessions are impact-ranked for faster investigation.
- **Timeline scrubber**: Lightweight session timeline visualization (start/actions/errors/converted-exit) to quickly understand session progression.
- **Compare overlay**: Side-by-side compare of two sessions with delta context (impact, errors, apdex).
- **Scoped backend alignment**: Backend tiers are expanded by default and backend services/edges are filtered by active session/user scope so frontend and backend analysis stay aligned.
- **Session parity mode**: Navigation Paths can switch between the navigation model and a session-parity mode that counts the selected session's user actions rather than just navigation/page-summary records.
- **Trace-based backend mapping**: For a selected session, frontend-to-backend connectors prefer trace/request edges from the actual session so the service flow reflects the services Dynatrace called, not a generic page-to-service heuristic.
- **Persisted filters**: Navigation user/session/preset and compare selections are persisted per-user via app state.
- **Conversion Probability**: Graph-based iterative relaxation with drop-off rates — computes probability per page factoring in incoming vs outgoing traffic ratios. Avoids closed-graph 100% convergence by modeling session exits. Shown as "Conv Prob %" column in All Transitions table and a dedicated "Conversion Probability by Page" ranked table.
- **AI Path Optimization**: Card at the top automatically identifies which page sequences correlate with higher conversion probability and surfaces actionable recommendations.

**Queries**:

```dql
-- navigationPathsQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| sort timestamp asc
| summarize path = collectArray(view.name), by: {dt.rum.session.id}
| filter size(path) >= 2
| fieldsAdd step1 = path[0], step2 = path[1]
| fieldsAdd transition = concat(step1, " -> ", step2)
| summarize occurrences = count(), avg_depth = avg(size(path)), by: {transition, step1, step2}
| sort occurrences desc
| limit 30
```

---

### 12. Sankey

**Purpose**: Multi-step flow visualization with 7 analysis sub-tabs for comprehensive session path analytics.

**Sub-Tabs**:
1. **Flow Chart** (default): Sankey visualization with 7 chart styles (Classic, Gradient, Directed Flow, Alluvial, State Machine, Chord Diagram, Transition Heatmap), funnel highlighting, exit detection, observations, recommendations, exit analysis, health scorecard, transitions
2. **Conversion Paths**: Converted vs. abandoned path comparison — differentiating pages, path lengths, top transitions per group
3. **Loop Analysis**: A→B→A back-and-forth cycle detection with error/LCP correlation per loop page
4. **Page Timing**: Average and P90 duration per page, cross-referenced with health score and errors
5. **Session Endpoints**: Terminal page detection (where sessions end), bounce rate, bounce pages
6. **Revenue Paths** (AOV required): Top revenue-generating navigation paths, page touch rates for converting sessions
7. **Path Trends**: Period-over-period path comparison — new/dropped pages, frequency shifts, transition changes
8. **Funnel Leakage**: Deep analysis of users leaving the funnel — session classification (recoverers vs lost), exit step distribution, off-funnel destinations, behavioral comparison, CWV/error diagnostic signals, revenue impact, auto-generated insights

**Key Features**:
- 7 rendering styles: Classic Sankey, Gradient Sankey, Directed Flow Graph, Alluvial/Columnar, State Machine, Chord Diagram, Transition Heatmap
- 8 analytical sub-tabs including funnel leakage analysis
- **Per-column node limit**: 12 nodes per column (increased from previous limit), with vertical scroll when content exceeds viewport
- **Dynamic height**: SVG height adjusts to content; overflow-y scroll for tall diagrams
- **Chord Diagram**: Circular arc layout with clickable arcs for path highlighting, focus mode support, center label with inbound/outbound detail
- **Transition Heatmap**: NxN grid with clickable row/column highlighting, selection summary with totals, 52px cells
- **Funnel highlighting**: Funnel pages rendered in gold with ★ markers and dashed borders across all chart styles
- **Exit detection**: Pages where ≥30% of outbound traffic goes off-funnel are flagged in red (⛔) across all renderers
- Click nodes for inbound/outbound flow detail with links to Vitals app
- **Focus Mode** toggle button: when ON + a node is selected, completely hides all unrelated nodes and links (opacity 0) instead of dimming, providing a clean isolated view of a node's connections
- **Core Web Vitals overlay**: Per-page CWV (LCP, CLS, INP) shown on node selection with color-coded health indicators
- **Error overlay**: Per-page error counts shown on node selection
- **Key Observations**: Auto-generated insights about completion rates, return rates, lost revenue, and performance issues
- **Recommendations**: Prioritized (HIGH/MEDIUM/LOW) actionable suggestions based on data analysis
- **Funnel Exit Analysis table**: Exit points with sessions, return rates, and estimated lost revenue
- **Off-Funnel Destinations table**: Where users go after leaving the funnel, with session counts
- **Page Health Scorecard table**: All pages ranked by composite health score (0-100) combining CWV and error data. Error counts are clickable links to **Dynatrace Error Inspector** pre-filtered by frontend and page name
- **Path analysis**: Extended session paths analyzed for exits, returns, completions, and off-funnel navigation
- **Rich hover tooltips**: All chart styles show top 3 inbound/outbound connections with counts & percentages, self-reload detection (⟲ indicator when >5% of inbound is same-page), and error counts on hover

**Queries** (7 total):

```dql
-- sankeyQuery: Session navigation paths (5-step windows)
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| sort timestamp asc
| summarize path = collectArray(view.name), by: {dt.rum.session.id}
| filter size(path) >= 2
| fieldsAdd s0 = path[0], s1 = path[1], s2 = path[2], s3 = path[3], s4 = path[4]
| summarize sessions = count(), by: {s0, s1, s2, s3, s4}
| sort sessions desc
| limit 200
```

```dql
-- sankeyCwvPerPageQuery: Core Web Vitals per page for health scoring
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| fieldsAdd
    lcp_ms = toDouble(web_vitals.largest_contentful_paint) / 1000000.0,
    cls_val = toDouble(web_vitals.cumulative_layout_shift),
    inp_ms = toDouble(web_vitals.interaction_to_next_paint) / 1000000.0
| summarize lcp = avg(lcp_ms), cls = avg(cls_val), inp = avg(inp_ms), pageViews = count(), by: {pageName}
| sort pageViews desc
| limit 50
```

```dql
-- sankeyErrorsPerPageQuery: Error counts per page for exit correlation
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_error == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| summarize errorCount = count(), errorSessions = countDistinct(dt.rum.session.id), by: {pageName}
| sort errorCount desc
| limit 50
```

```dql
-- sankeyExtendedPathsQuery: Full session paths for return/completion analysis
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| sort timestamp asc
| summarize path = collectArray(pageName), by: {dt.rum.session.id}
| fieldsAdd pathLen = arraySize(path)
| filter pathLen >= 2
| limit 500
```

```dql
-- sankeyPageDurationQuery: Avg duration per page for Page Timing sub-tab
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| fieldsAdd dur_ms = toDouble(duration) / 1000000.0
| summarize avgDuration = avg(dur_ms), p90Duration = percentile(dur_ms, 90), sessions = count(), by: {pageName}
| sort sessions desc
| limit 50
```

```dql
-- sankeyPrevPathsQuery: Previous-period paths for Path Trends sub-tab
fetch user.events, from: now() - {prevPeriod}, to: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_navigation == true OR characteristics.has_page_summary == true
| fieldsAdd pageName = coalesce(view.name, page.name, url.path, "unknown")
| sort timestamp asc
| summarize path = collectArray(pageName), by: {dt.rum.session.id}
| fieldsAdd pathLen = arraySize(path)
| filter pathLen >= 2
| limit 500
```

---

### 13. Anomaly Detection

**Purpose**: Automated anomaly detection across key metrics with severity classification.

**Key Features**:
- Stability Score (0-100)
- 7 monitored metrics with deviation thresholds
- Per-step traffic anomaly detection
- Duration distribution histogram
- Automated diagnosis text

**Queries**: Reuses `sessionQualityQuery` (current + prev), `sessionFlowQuery` (current + prev), `stepMetricsQuery`.

```dql
-- sessionDurationDistributionQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd dur_ms = toDouble(duration) / 1000000
| fieldsAdd dur_bucket = if(dur_ms <= 500, "0-500ms", else: if(dur_ms <= 1000, "500ms-1s", else: if(dur_ms <= 2000, "1-2s", else: if(dur_ms <= 3000, "2-3s", else: if(dur_ms <= 5000, "3-5s", else: if(dur_ms <= 10000, "5-10s", else: ">10s"))))))
| summarize actions = count(), sessions = countDistinctExact(dt.rum.session.id), avg_dur = avg(dur_ms), errors = countIf(characteristics.has_error), by: {dur_bucket}
```

---

### 14. Conversion Attribution

**Purpose**: Identify factors most impacting conversion by device, browser, and speed buckets. Multi-touch attribution modeling shows which funnel steps have the highest influence on final conversion.

**Key Features**:
- Speed-to-conversion correlation (fast/medium/slow buckets)
- Device type attribution
- Browser attribution
- Full device x browser cross-section table
- **Multi-Touch Attribution Modeling**: 6 attribution models (First Touch, Last Touch, Linear, Position-Based, Time-Decay, Influence-Based) showing credit allocation per funnel step
- **Step Influence Cards**: Ranked by influence-based weight, showing conditional conversion rate (P(convert | reached step)), drop-off rate, downstream value per session (AOV × conditional conv rate), and drop-off cost (lost sessions × downstream conv probability × AOV)
- **Influence Visualization**: SVG bar chart showing relative influence weight per step
- **Revenue Credit**: When AOV configured, shows how much revenue each step "earns" under the influence-based model

**Queries**:

```dql
-- conversionAttributionQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd step_tag = {stepTagExpr}, dur_ms = toDouble(duration) / 1000000, deviceType = device.type, browserName = browser.name
| summarize steps = collectDistinct(step_tag), avg_dur = avg(dur_ms), errors = countIf(characteristics.has_error), by: {dt.rum.session.id, deviceType, browserName}
| fieldsAdd converted = iAll(steps[] == "step1") AND iAll(steps[] == "step2") AND ...
| summarize total_sessions = count(), converted_sessions = countIf(converted), avg_duration = avg(avg_dur), avg_errors = avg(errors), by: {deviceType, browserName}
| fieldsAdd conv_rate = 100.0 * converted_sessions / total_sessions
| sort total_sessions desc
| limit 30
```

---

### 15. Executive Summary

**Purpose**: One-page executive overview with weighted letter grade and key highlights.

**Key Features**:
- Weighted letter grade (A-F) combining Apdex, Conversion, Error Rate, CWV
- Highlight cards for critical metrics
- Funnel summary with bottleneck identification
- CWV snapshot
- Export to PDF and Copy-to-clipboard

**Queries**: Reuses `sessionQualityQuery`, `cwvQuery`, `sessionFlowQuery`, `stepMetricsQuery`.

---

### 16. Segmentation

**Purpose**: User segment analysis by device, browser, geography, and OS version.

**Key Features**:
- Device type breakdown (Desktop, Mobile, Tablet)
- Browser breakdown with Apdex per browser
- Geographic segment performance with full country names (ISO code → name translation via `isoToCountryName()`)
- **OS Version breakdown**: Table showing operating system versions with session count, Apdex, and duration
- **AI Segment Discovery**: Always-visible insight card that automatically identifies the cohort with the worst Apdex or lowest conversion rate — surfaces which user segment needs attention without manual filtering
- **Estimated Revenue** column in all tables: `sessions × convRate × AOV` showing revenue contribution per segment (visible when AOV > 0)

**Queries**:

```dql
-- deviceQuery
fetch user.events | filter frontend.name == "{frontend}" | filter {anyStepFilter}
| summarize sessions = countDistinctExact(dt.rum.session.id), actions = count(), avg_dur = avg(dur_ms), by: {device.type}

-- browserQuery
fetch user.events | filter frontend.name == "{frontend}" | filter {anyStepFilter}
| summarize sessions = countDistinctExact(dt.rum.session.id), actions = count(), avg_dur = avg(dur_ms), by: {browser.name}

-- geoQuery
fetch user.events | filter frontend.name == "{frontend}" | filter {anyStepFilter}
| summarize sessions = countDistinctExact(dt.rum.session.id), actions = count(), avg_dur = avg(dur_ms), by: {geo.country.name}
```

---

### 17. Errors & Drop-offs

**Purpose**: Correlate errors with funnel abandonment to identify drop-off causes. Predict future drop-off increases via error rate trend analysis.

**Key Features**:
- Drop-off analysis between funnel steps
- Error counts per step transition
- Optimization recommendations
- **Predictive Drop-off Scoring**: Linear regression on hourly error rates per step. Projects 2 hours forward to estimate additional drop-off if current error trajectory continues. Severity-colored cards (critical >5%, warning >2%, stable) show current error rate, projected rate, and trend per hour. Uses `rootCauseStepDropQuery` data (per-step per-hour actions/errors).

**Queries**: Reuses `errorQuery` + `sessionFlowQuery` results with client-side correlation.

---

### 18. What-If Analysis

**Purpose**: Simulated scenario modeling projecting impact of traffic increases, including revenue impact when AOV is configured. Latency improvement simulation and infrastructure headroom assessment.

**Key Features**:
- Traffic percent-change slider (0% to +5000%) with sparse tick labels at key values
- **Latency Improvement slider** (0% to −50%): Simulates the impact of performance optimizations (CDN, caching, code optimization). Reduces projected latency factor and partially offsets conversion degradation under load
- Projected Apdex degradation
- Projected latency increase
- Projected conversion impact
- Visual before/after comparison
- Revenue Impact section (when AOV > 0): current vs. projected revenue, net revenue change, conversion degradation loss, ideal vs. actual revenue comparison, and "Perf Tax" rate showing revenue lost to performance under load
- **Infrastructure Headroom**: Uses Dynatrace `dt.host.cpu.usage` and `dt.host.memory.usage` metrics to assess whether current infrastructure can sustain the simulated traffic increase. Shows current vs projected CPU/memory, max sustainable traffic increase before 85% saturation threshold, limiting factor (CPU or Memory), gauge bars with threshold markers, and SUFFICIENT/AT RISK/CRITICAL verdict

**Queries**: Reuses `sessionFlowQuery` + `stepMetricsQuery` — applies traffic multiplier (`1 + pctChange/100`) client-side with logarithmic degradation model. Revenue calculations are client-side using AOV from global settings. Infrastructure uses `hostMetricsQuery` (timeseries `dt.host.cpu.usage` and `dt.host.memory.usage`).

---

### 19. Root Cause Correlation

**Purpose**: Correlate conversion drops with latency spikes, error surges, and P90 outliers on an hourly timeline. Link frontend degradations to backend service problems via full-stack topology.

**Key Features**:
- Hourly timeline SVG chart
- Ranked signals with confidence scores
- Step degradation ranking
- Automated diagnosis text
- **Full-Stack Correlation**: Backend service topology filtered to only services called by the selected application via entity `calls[dt.entity.service]` relationships. BFS traversal up to 7 depth tiers. Clickable service nodes open Gen3 Dynatrace Services with matching timeframe.
- **Davis AI Backend Problems**: Table of Davis-detected problems on SERVICE/HOST/PROCESS entities with red clickable links to the Davis Problems app
- **Impact Banner**: When frontend degradation hours overlap with backend service problems, a red banner explicitly links the two — Dynatrace's unique advantage of connecting frontend UX to backend root cause
- **Service Flow Topology SVG**: Multi-layered left-to-right graph (up to 7 tiers) with curved Bézier edges, problem indicators (⚠️) on affected services, health status on clean services. Service nodes are clickable and open in Dynatrace Gen3 Services.

**Queries**:

```dql
-- rootCauseCorrelationQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd step_tag = {stepTagExpr}, dur_ms = toDouble(duration) / 1000000, hour_bucket = formatTimestamp(timestamp, "yyyy-MM-dd HH:00")
| summarize steps = collectDistinct(step_tag), avg_dur = avg(dur_ms), errors = countIf(characteristics.has_error), by: {dt.rum.session.id, hour_bucket}
| fieldsAdd converted = {allStepsReached}
| summarize total_sessions = count(), converted_sessions = countIf(converted), avg_duration = avg(avg_dur), p90_duration = percentile(avg_dur, 90), error_sessions = countIf(errors > 0), avg_errors = avg(errors), by: {hour_bucket}
| fieldsAdd conv_rate = 100.0 * converted_sessions / total_sessions, error_rate = 100.0 * error_sessions / total_sessions
| sort hour_bucket asc
```

```dql
-- rootCauseStepDropQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd dur_ms, step_tag, satisfaction, hour_bucket
| summarize actions = count(), avg_dur = avg(dur_ms), p90_dur = percentile(dur_ms, 90), errors = countIf(characteristics.has_error), frustrated = countIf(satisfaction == "frustrated"), by: {step_tag, hour_bucket}
```

```dql
-- backendServicesQuery (application's direct services via entity relationship)
fetch dt.entity.application
| filter entity.name == "{frontend}"
| expand service_id = calls[dt.entity.service]
| filter isNotNull(service_id)
| lookup [fetch dt.entity.service | fields id, entity.name, entity.detected_name], sourceField:service_id, lookupField:id, prefix:"svc."
| fields id = service_id, entity.name = svc.entity.name, entity.detected_name = svc.entity.detected_name
| limit 30
```

```dql
-- serviceToServiceQuery (downstream dependencies with name resolution)
fetch dt.entity.service
| fields id, entity.name, downstream = calls[dt.entity.service]
| expand downstream_id = downstream
| filter isNotNull(downstream_id)
| lookup [fetch dt.entity.service | fields id, entity.name], sourceField:downstream_id, lookupField:id, prefix:"tgt."
| fields source_id = id, source_name = entity.name, target_id = downstream_id, target_name = tgt.entity.name
| limit 300
```

```dql
-- backendProblemsQuery (Davis problems on backend entities)
fetch dt.davis.problems, from: now() - {timeframe}
| filter isNotNull(display_id)
| filter contains(toString(affected_entity_ids), "SERVICE") OR contains(toString(root_cause_entity_id), "SERVICE") OR contains(toString(affected_entity_ids), "HOST") OR contains(toString(affected_entity_ids), "PROCESS")
| sort event.start desc
| limit 40
| fields event.id, display_id, event.name, title, event.status, event.start, event.end, root_cause_entity_id, affected_entity_ids, event.category, management_zones
```

---

### 20. Predictive Forecasting

**Purpose**: Linear regression projecting key metrics 7 days forward with breach estimates.

**Key Features**:
- Trend sparklines with forecast extension
- Days-to-breach estimates for Apdex, conversion, error rate
- Multi-metric forecasting (Apdex, conversion, error rate, duration, CWV)
- **Revenue Forecast** section (when AOV > 0): current revenue, projected +7d revenue (based on conversion rate trend), and net revenue delta with color-coded gain/loss

**Queries**:

```dql
-- forecastTrendQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd step_tag, dur_ms, day_bucket = formatTimestamp(timestamp, "yyyy-MM-dd")
| summarize steps = collectDistinct(step_tag), by: {dt.rum.session.id, day_bucket}
| fieldsAdd converted = {allStepsReached}
| summarize total_sessions = count(), converted_sessions = countIf(converted), avg_duration = avg(...), total_errors = sum(...), by: {day_bucket}
| fieldsAdd conv_rate, error_rate
| sort day_bucket asc
```

```dql
-- forecastApdexTrendQuery
fetch user.events | fieldsAdd dur_ms, day_bucket
| summarize total = count(), satisfied = countIf(dur_ms <= 3000), tolerating = countIf(dur_ms > 3000 AND dur_ms <= 12000), frustrated = countIf(dur_ms > 12000), avg_dur = avg(dur_ms), p90_dur = percentile(dur_ms, 90), by: {day_bucket}
| sort day_bucket asc
```

```dql
-- forecastVitalsTrendQuery
timeseries { lcp = avg(dt.frontend.web.page.largest_contentful_paint), cls = avg(...cumulative_layout_shift), inp = avg(...interaction_to_next_paint), ttfb = avg(...time_to_first_byte) }, interval: 1d, from: now() - {timeframe}
```

---

### 21. Resource Waterfall

**Purpose**: Aggregated resource timing per funnel step + individual session-level drill-down showing scripts, CSS, images, fonts, and XHR load times.

**Key Features**:
- Visual waterfall bars (P50/P90)
- Per-step resource type breakdown
- Optimization recommendations (slow resources flagged)
- **Top 10 Slowest Resources**: Individual resource requests ranked by duration with clickable session links to view affected sessions
- **Session Drill-Down Panel**: Select a session to see all resources loaded in that session with full replay link. Buttons for each unique session ID; clicking opens a resource table for that session.

**Queries**:

```dql
-- resourceWaterfallQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_request == true
| fieldsAdd res_dur_ms = toDouble(duration) / 1000000, step_tag = {stepTagExpr}, res_type = if(endsWith(url.path, ".js"), "script", else: if(endsWith(url.path, ".css"), "css", else: if(matchesPhrase(content.type, "image"), "image", else: if(matchesPhrase(content.type, "font"), "font", else: "xhr")))), res_name = url.path
| summarize count = count(), avg_dur = avg(res_dur_ms), p50_dur = percentile(res_dur_ms, 50), p90_dur = percentile(res_dur_ms, 90), p99_dur = percentile(res_dur_ms, 99), max_dur = max(res_dur_ms), total_dur = sum(res_dur_ms), by: {step_tag, res_type, res_name}
| sort total_dur desc
| limit 100
```

```dql
-- resourceByStepQuery
fetch user.events | filter has_request
| summarize resources = count(), avg_dur = avg(res_dur_ms), p90_dur = percentile(res_dur_ms, 90), total_dur = sum(res_dur_ms), slow_count = countIf(res_dur_ms > 1000), by: {step_tag, res_type}
```

---

### 22. Change Intelligence

**Purpose**: Overlay deployment events on hourly performance timeline for before/after analysis.

**Key Features**:
- Deployment event markers on timeline
- Before/after Apdex, duration, error rate, frustrated %
- Severity classification (improvement, degradation, critical)

**Queries**:

```dql
-- deploymentEventsQuery
fetch events, from: now() - {timeframe}
| filter event.type == "CUSTOM_DEPLOYMENT" OR event.type == "task.deployment.finished"
| fieldsAdd deploy_name = event.name, source, version = tag.version, stage = tag.stage, component = tag.component, service = tag.service, desc = description, project = tag.project, repo = tag.repository, hour_key = formatTimestamp(timestamp, "yyyy-MM-dd HH:00")
| summarize deploy_count = count(), first_time = min(timestamp), by: {hour_key, deploy_name, version, stage, component, service}
| sort first_time desc
```

```dql
-- changeImpactQuery (hourly user metrics)
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd dur_ms, hour_ts = formatTimestamp(timestamp, "yyyy-MM-dd HH:00")
| fieldsAdd satisfaction
| summarize sessions = countDistinctExact(dt.rum.session.id), actions = count(), avg_dur = avg(dur_ms), p90_dur = percentile(dur_ms, 90), errors = countIf(characteristics.has_error), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {hour_ts}
| sort hour_ts asc
```

---

### 23. SLO Tracker

**Purpose**: Service Level Objective tracking with error budget burn-down, user-editable targets, and one-click native SLO provisioning.

**Key Features**:
- SLO definitions: Apdex >= 0.85, Error Rate <= 2%, LCP <= 2500ms, CLS <= 0.1, INP <= 200ms, TTFB <= 800ms (all defaults)
- **User-editable targets**: Click ✎ icon per SLO to customize target inline. Persisted per user via `useUserAppState`. Reset button (↺) restores default.
- **One-click "Create SLO" button**: Per-metric button opens the Dynatrace SLO settings page pre-filled with metric expression, target value, comparison operator, and application filter for the current frontend. Provisions a native platform SLO without leaving the app.
- Error budget remaining + burn rate
- Projected exhaustion time
- Hourly granularity trend

**Queries**:

```dql
-- sloApdexTrendQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| fieldsAdd dur_ms, hour_key = formatTimestamp(timestamp, "yyyy-MM-dd HH:00")
| fieldsAdd satisfaction
| summarize total = count(), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), errors = countIf(characteristics.has_error), avg_dur = avg(dur_ms), by: {hour_key}
| sort hour_key asc
```

```dql
-- sloCwvTrendQuery
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_page_summary == true
| fieldsAdd lcp_ms = web_vitals.largest_contentful_paint, cls_val = web_vitals.cumulative_layout_shift, inp_ms = web_vitals.interaction_to_next_paint, ttfb_ms = web_vitals.time_to_first_byte, bucket_key = formatTimestamp(timestamp, "yyyy-MM-dd HH:00")
| summarize lcp_val = avg(lcp_ms), cls_val = avg(cls_val), inp_val = avg(inp_ms), ttfb_val = avg(ttfb_ms), by: {bucket_key}
| sort bucket_key asc
```

---

### 24. Session Replay Spotlight

**Purpose**: Surface highest-impact session replays ranked by a composite impact score.

**Key Features**:
- Impact score formula: `errors * 10 + crash * 50 + bounce * 20 + (interactions > 10) * 5`
- Top 50 sessions with direct Replay links
- Duration, error count, device, browser, country metadata
- Crash and bounce badges

**Queries**:

```dql
-- sessionReplayQuery
fetch user.sessions, from: now() - {timeframe}
| filter characteristics.has_replay == true
| filter dt.rum.user_type == "real_user"
| filter frontend.name == "{frontend}"
| fieldsAdd dur_s = toDouble(duration) / 1000000000, err = error_count, navs = navigation_count, interactions = interaction_count, is_bounce = bounce, has_crash = crash, user_tag = dt.rum.user.tag, device = device.type, browser = browser.name, country = geo.country.name
| fieldsAdd impact_score = err * 10 + toInt(has_crash) * 50 + toInt(is_bounce) * 20 + if(interactions > 10, 5, else: 0)
| sort impact_score desc
| limit 50
```

---

### 25. A/B Comparison

**Purpose**: Side-by-side segment comparison for platform variants.

**Key Features**:
- Preset comparisons: Desktop vs Mobile, Chrome vs Firefox, US vs non-US
- Custom DQL filter segments
- Apdex, conversion, error rate, duration deltas
- CWV comparison per segment
- **Estimated Revenue** comparison row: `sessions × convRate × AOV` per segment showing revenue contribution delta (visible when AOV > 0)

**Queries**:

```dql
-- abSegmentQuery (called twice, once per segment)
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter {anyStepFilter}
| filter {segmentFilter}  -- e.g. device.type == "Desktop" or browser.name == "Chrome"
| fieldsAdd dur_ms, day_bucket = formatTimestamp(timestamp, "yyyy-MM-dd")
| fieldsAdd satisfaction
| summarize sessions = countDistinctExact(dt.rum.session.id), actions = count(), avg_dur = avg(dur_ms), p90_dur = percentile(dur_ms, 90), errors = countIf(characteristics.has_error), satisfied = countIf(satisfaction == "satisfied"), tolerating = countIf(satisfaction == "tolerating"), frustrated = countIf(satisfaction == "frustrated"), by: {day_bucket}
| sort day_bucket asc
```

```dql
-- abSegmentCwvQuery (called twice, once per segment)
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_page_summary == true
| filter {segmentFilter}
| fieldsAdd lcp_ms, cls_val, inp_ms, ttfb_ms
| summarize lcp_avg = avg(lcp_ms), cls_avg = avg(cls_val), inp_avg = avg(inp_ms), ttfb_avg = avg(ttfb_ms), page_views = count()
```

---

### 26. Revenue Intelligence

**Purpose**: Comprehensive revenue analytics translating performance metrics into dollar impact using Average Order Value (AOV).

**Key Features**:
- Top-line revenue KPIs: current revenue, previous period revenue, revenue change (absolute + %), revenue per session
- Performance Tax breakdown: latency tax (revenue lost to slow pages, ~1% conversion loss per 100ms above 1s), frustration tax (revenue lost to frustrated sessions), error tax (revenue lost to errors), total recoverable revenue
- Funnel Revenue Leakage table: estimated revenue lost at each funnel drop-off step, ranked by impact
- Revenue Optimization Opportunities: ranked improvement scenarios (fix top drop-off, reduce latency, eliminate frustration, cut errors, improve Apdex) with projected revenue uplift per action
- Prompts user to set AOV in Settings when not configured

**Queries**: Reuses `sessionFlowQuery` (current + previous period), `stepMetricsQuery`, and `sessionQualityQuery`. All revenue calculations are client-side using the AOV global setting.

**Revenue Models**:
- Latency tax: industry benchmark of ~1% conversion loss per 100ms above 1s baseline, capped at 30%
- Frustration tax: ~50% of frustrated users estimated to abandon
- Error tax: ~30% of error-affected sessions estimated to convert less
- Funnel leakage: dropped users assumed to have equal downstream conversion probability

---

### 27. Cohort Retention

**Purpose**: Daily user cohort analysis showing conversion retention curves, device breakdown, and sessions-per-user engagement.

**Key Features**:
- Daily cohort chart: sessions + conversion rate overlay
- Device-type breakdown with per-device conversion rates
- Sessions-per-user metric (returning user engagement)
- Daily detail table with date, sessions, users, conversions, and conversion rate
- Revenue totals when AOV is configured

**Queries**:

```dql
-- cohortRetentionQuery: Sessions by day and device with conversion
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| fieldsAdd day_bucket = formatTimestamp(timestamp, "yyyy-MM-dd")
| summarize sessions = count(), users = countDistinctExact(dt.rum.session.id), by: {day_bucket, device.type}
-- + conversion detection via step filter
```

```dql
-- cohortSessionCountQuery: Unique users and total sessions per day
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| summarize unique_users = countDistinctExact(dt.rum.session.id), total_sessions = count(), by: {day_bucket}
```

---

### 28. Session Engagement

**Purpose**: Assign engagement scores (0-100) to individual sessions and identify high-intent non-converters.

**Key Features**:
- Engagement score formula: actions (30%) + funnel depth (40%) - error penalty (30%)
- Score distribution histogram with conversion overlay per bucket
- Conversion rate by engagement tier: high (≥70), medium (30-69), low (<30)
- High-intent non-converters table: users with high scores who didn't convert
- Revenue opportunity estimate when AOV is configured

**Queries**:

```dql
-- sessionEngagementQuery: Per-session actions, depth, errors, conversion
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| summarize action_count = count(), max_depth = max(step_index), error_count = countIf(characteristics.has_error),
  converted = countIf(reached_last_step), by: {dt.rum.session.id}
| limit 500
```

---

### 29. Third-Party Impact

**Purpose**: Analyze how third-party resources affect page performance and Core Web Vitals.

**Key Features**:
- First-party vs. third-party request count, payload, and duration comparison
- Top domains chart ranked by request count with 1P/3P classification
- Full domain table with resource types, payload, and avg duration
- Page-level CWV data for correlation analysis
- Domain classification heuristic based on frontend hostname

**Queries**:

```dql
-- thirdPartyImpactQuery: Resource timing by domain and type
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| summarize total_bytes = sum(resource.size), avg_duration = avg(resource.duration),
  req_count = count(), by: {domain, res_type}
```

```dql
-- thirdPartyCwvCorrelationQuery: CWV per page for correlation
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| summarize lcp = avg(web_vitals.largest_contentful_paint),
  cls = avg(web_vitals.cumulative_layout_shift),
  inp = avg(web_vitals.interaction_to_next_paint), by: {pageName}
```

---

### 30. Error Clustering

**Purpose**: Group errors by type/pattern to prioritize fixes by impact.

**Key Features**:
- Error clusters with occurrence count, session impact, and impact percentage
- Hourly error trend chart (area + line) for spike detection
- Top clusters bar chart ranking errors by occurrence
- Sample error messages for quick identification
- Full detail table with sortable columns

**Queries**:

```dql
-- errorClusteringQuery: Errors grouped by error.id and errorName
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_error == true
| summarize occurrences = count(), affected_sessions = countDistinctExact(dt.rum.session.id),
  sample_message = first(error.message), by: {error.id, errorName}
| sort occurrences desc
```

```dql
-- errorTrendQuery: Error occurrences by hour
fetch user.events, from: now() - {timeframe}
| filter frontend.name == "{frontend}"
| filter characteristics.has_error == true
| summarize error_count = count(), by: {hour_bucket}
```

---

### 31. Hyperlyzer

**Purpose**: Multidimensional radial performance explorer that visualizes frontend metrics across 4 orthogonal dimensions simultaneously, enabling cross-dimensional filtering and outlier detection.

**Key Features**:
- Custom SVG radial chart with 4 quadrants: Operating System, Geolocation, User Action, Browser
- Bar length proportional to metric value (log-scaled) with application median reference line
- 8 selectable metrics: Action Duration (median), Apdex, LCP (P75), INP (P75), CLS (P75), TTFB (P75), Load Event End (P75), FCP (P75)
- Click-to-focus dimension highlighting (dims non-focused quadrants)
- Click-to-filter: stack multiple cross-dimensional filters (e.g. Chrome + US + specific page)
- Finding cards auto-identify top outliers per dimension vs. application median
- Paginated side table with color-coded metric ratings (good/needs-improvement/poor)
- Text search filter within focused dimension
- Drilldown links to Dynatrace Sessions or Vitals Experience apps
- Filter chips with remove/clear-all capability
- Responsive chart sizing based on viewport
- AI Insights integration with outlier analysis and metric health assessment

**Component files**: `ui/app/pages/HyperlyzerTab.tsx`, `ui/app/components/RadialHyperChart.tsx`

**Queries**:

```dql
-- buildDimQuery: Per-dimension top-N metric values
fetch user.events, {periodStr}
| filter characteristics.has_navigation == true
| filter dt.rum.user_type != "robot"
| filter frontend.name == "{frontend}"
{appliedFilters}
| fieldsAdd label = {dimFieldExpr}
| filter isNotNull(label) and label != ""
| summarize {metricSummarize}, by: {label}
| sort cnt desc
| limit {topN}
```

```dql
-- buildMedianQuery: Application-wide metric median
fetch user.events, {periodStr}
| filter characteristics.has_navigation == true
| filter dt.rum.user_type != "robot"
| filter frontend.name == "{frontend}"
{appliedFilters}
| summarize {metricSummarize}
```

### 32. Cost per Conversion

**Purpose**: Connect infrastructure spend to user outcomes by calculating the true cost of acquiring each conversion.

**Key Features**:
- Cost per session and cost per conversion metrics
- Revenue:cost ratio and sessions-per-dollar efficiency
- Per-step cost allocation proportional to session volume
- Efficiency Scorecard: requests-per-dollar, sessions-per-dollar, Apdex-per-dollar, revenue-per-dollar-spent
- Optimization Opportunities flagging expensive steps and low-efficiency scenarios
- Uses Monthly Infrastructure Cost from Settings (default $100, divided by 30 for daily)

---

### 33. Performance Tax

**Purpose**: Quantify revenue lost due to poor performance — slow pages, frustrated users, and errors.

**Key Features**:
- Three performance taxes: Latency Tax (~1% conversion loss per 100ms above 1s), Frustration Tax (50% lower conversion for frustrated users), Error Tax (30% lower conversion for error sessions)
- Total lost conversions and break-even engineering time
- Cost-per-millisecond calculations
- ROI Scenarios table modeling specific improvements with projected revenue recovery
- Engineering investment estimates using Engineer Hourly Rate from Settings

---

### 34. Idle Capacity

**Purpose**: Detect infrastructure waste by analyzing traffic patterns against fixed provisioning costs.

**Key Features**:
- Idle hours identification (traffic < 40% of peak)
- Monthly idle waste estimation
- Average utilization and peak-to-off-peak ratio
- Hourly utilization chart (red=idle, green=utilized)
- Autoscaling savings estimate (~35% reduction)
- Right-sizing savings estimate (~20% reduction)
- Uses Compute Cost Per Hour from Settings

---

### 35. CDN ROI

**Purpose**: Model the financial return of CDN investment by connecting latency reduction to conversion improvement.

**Key Features**:
- CDN latency savings model (60% reduction for static assets)
- Conversion rate improvement calculation (~1% per 100ms saved)
- Additional monthly revenue projection
- Data transfer cost savings (CDN offloads ~70% of origin traffic)
- Net monthly benefit after CDN costs
- Payback period calculation
- Origin vs CDN latency comparison
- CDN Candidates table ranking high-latency resources by impact score (latency x volume)
- Uses CDN Monthly Cost from Settings

---

### 36. Cost Anomalies

**Purpose**: Detect unusual spending patterns and correlate them with traffic, errors, and deployment events.

**Key Features**:
- Statistical anomaly detection (z-score > 1.5 SD) on 14-day daily cost trend
- Budget burn rate projection
- Error-driven waste estimation (errors cause retries increasing compute without business value)
- Cost efficiency delta vs. previous period
- Spend vs Experience Matrix
- Budget Forecast (end-of-month projection based on current burn rate)
- Uses Monthly Infrastructure Cost and Cost Per GB from Settings

---

### 37. Right-Sizing

**Purpose**: Identify over-provisioned hosts by comparing actual CPU/memory utilization against allocated capacity, with per-host savings estimates.

**Key Features**:
- Fleet-wide right-sizing opportunity assessment (over-provisioned count, total savings potential)
- Per-host analysis with current tier, recommended tier, average/peak CPU & memory utilization
- Risk classification (low/medium) based on peak utilization headroom
- Savings breakdown per host with implementation priority
- Uses Host Metrics data and Monthly Infrastructure Cost from Settings

---

### 38. Cost per Transaction

**Purpose**: Break down infrastructure cost per user session and per service request, revealing which services deliver the best ROI.

**Key Features**:
- Cost per session and cost per conversion calculations
- Revenue per dollar of infrastructure spend
- Per-service cost/revenue breakdown identifying highest and lowest ROI services
- Cost efficiency trending (current vs previous period)
- Uses Monthly Infrastructure Cost, AOV, and conversion data from Settings

---

### 39. Cloud Waste

**Purpose**: Aggregate idle resources, orphaned volumes, over-provisioned instances, and unused reservations into a single waste score.

**Key Features**:
- Categorized waste items with severity classification (high/medium/low)
- Per-category monthly cost impact and remediation actions
- Total waste percentage of infrastructure spend
- Severity-ranked remediation priority list
- Uses Monthly Infrastructure Cost from Settings

---

### 40. Scaling Efficiency

**Purpose**: Measure how well autoscaling responds to demand — identifies under-scaled services causing latency and over-scaled services burning budget.

**Key Features**:
- Hourly scaling event timeline showing under-scaled and over-scaled periods
- Under-scale latency impact quantification
- Over-scale waste cost per hour
- Scaling score (0-100) measuring responsiveness
- Uses Compute Cost Per Hour from Settings

---

### 41. SLO Cost Trade-offs

**Purpose**: Model the cost of each additional "nine" of availability — shows diminishing returns and helps find the optimal SLO tier.

**Key Features**:
- SLO tier comparison (99.0% through 99.99%) with cost multipliers
- Downtime minutes per month at each tier
- Revenue at risk vs. cost of achieving each tier
- Marginal cost per nine of availability
- Current SLO tier identification and optimal tier recommendation
- Uses Monthly Infrastructure Cost and revenue data from Settings

---

### 42. Tag Allocation

**Purpose**: Track cost allocation compliance by team/cost-center tags, identify untagged resources and teams exceeding budgets.

**Key Features**:
- Per-team spend vs. budget tracking with over/under indicators
- Untagged resource percentage and cost exposure
- Budget variance alerts for teams exceeding allocation
- Cost center rollup for showback/chargeback reporting
- Uses Monthly Infrastructure Cost from Settings

---

### 43. Observability ROI

**Purpose**: Quantify the return on observability investment — compare monitoring costs against incident prevention value and MTTR reduction.

**Key Features**:
- Total observability cost breakdown (APM, infrastructure, logs, synthetics, RUM)
- Observability cost as percentage of infrastructure spend
- ROI calculation: incidents detected × avg incident cost × prevention rate
- MTTR reduction value quantification
- False positive rate impact on team productivity
- Uses Monthly Infrastructure Cost and session data from Settings

---

## Architecture Notes

### Query Infrastructure

- **Data fetching**: All queries use `useDql()` from `@dynatrace-sdk/react-hooks` which handles polling for long-running queries
- **Timeframe**: User-selectable via `TimeframeSelector` (2h to 90d). Supports absolute windows with shifted anchors for historical analysis
- **Period comparison**: Many tabs run queries twice (current period + previous period of same duration) for delta calculations
- **Caching**: `useDql` deduplicates identical queries within a render cycle

### User Configuration (Persisted via UserAppState)

| Setting | State Key | Description |
|---------|-----------|-------------|
| Frontend App | `uj-frontend-app` | Which RUM application to analyze |
| Funnel Steps | `uj-funnel-steps` | Custom step definitions (2-10 steps, multi-page OR per step, wildcard support) |
| Tab Visibility | `uj-tab-visibility` | Show/hide individual tabs |
| Tab Order | `uj-tab-order` | Drag-to-reorder tab sequence |
| Sankey Style | `uj-sankey-style` | Preferred Sankey rendering mode |
| Map View | `uj-map-view` | Default map view (World/US) |
| Average Order Value | `uj-average-order-value` | Revenue per conversion for What-If & Revenue Intelligence |
| Monthly Infra Cost | `uj-monthly-infra-cost` | Monthly infrastructure spend for FinOps calculations (default $100,000) |
| CDN Monthly Cost | `uj-cdn-monthly-cost` | Monthly CDN spend for CDN ROI analysis (default $100) |
| Compute Cost/Hour | `uj-compute-cost-per-hour` | Hourly compute cost for Idle Capacity calculations (default $100) |
| Cost Per GB | `uj-cost-per-gb` | Data transfer cost per GB for Cost Anomalies (default $100) |
| Engineer Hourly Rate | `uj-engineer-hourly-rate` | Engineering cost per hour for Performance Tax ROI (default $100) |
| Industry | `uj-industry` | Industry vertical for AI Insights benchmarks (default "ecommerce"). Options: ecommerce, saas, media, financial, travel, healthcare, gaming, general. Controls all benchmark thresholds in AI analysis. |

### Key Constants

| Constant | Value | Description |
|----------|-------|-------------|
| APDEX_T | 3000 ms | Satisfied threshold |
| APDEX_4T | 12000 ms | Frustrated threshold |
| CWV LCP Good | 2500 ms | Core Web Vital threshold |
| CWV CLS Good | 0.1 | Core Web Vital threshold |
| CWV INP Good | 200 ms | Core Web Vital threshold |
| CWV TTFB Good | 800 ms | Core Web Vital threshold |

### Required Scopes

```json
[
  "storage:events:read",
  "storage:user.events:read",
  "storage:user.sessions:read",
  "storage:metrics:read",
  "storage:entities:read",
  "storage:system:read",
  "storage:buckets:read",
  "state:user-app-states:read",
  "state:user-app-states:write"
]
```

### External Dependencies

- `d3-geo` — Map projections (Natural Earth, Albers USA)
- `topojson-client` — TopoJSON → GeoJSON conversion
- `world-atlas` — World country boundaries
- `us-atlas` — US state boundaries

### Animations & Visual Polish

- **Funnel cascade animation**: CSS `@keyframes funnelSegmentIn` (opacity 0→1, translateY -8→0, scaleY 0.85→1) and `@keyframes funnelLabelIn` (opacity 0→1, translateY -6→0). Staggered via inline `animationDelay: ${i * 120}ms` on segments and `${stagger + 60}ms` on labels.
- **Count-up hook**: `useCountUp(target, duration=800, delay=0)` — animates number from 0 to target with cubic ease-out via `requestAnimationFrame`. Used by `CountUpText` SVG component with optional `suffix` prop.
- **Focus Mode (Sankey)**: Toggle button turns unrelated node/link dimming into full hiding (opacity 0) for clean isolated view.
- **Font sizes**: Minimum inline font size is 11px (bumped from 9px). CSS class fonts bumped proportionally.

### Revenue Integration (AOV-Dependent)

Revenue features appear across multiple tabs when `aov > 0` in global settings:

| Tab | Revenue Feature |
|-----|-----------------|
| Funnel Overview | Revenue lost annotation per drop-off step |
| Step Details | "Revenue at Risk" metric box: `dropOff × AOV` |
| Segmentation | "Est Revenue" column: `sessions × convRate × AOV` |
| Predictive Forecasting | Revenue Forecast section: current, projected +7d, delta |
| A/B Comparison | "Est Revenue" comparison row per segment |
| What-If Analysis | Full Revenue Impact section with Perf Tax |
| Revenue Intelligence | Dedicated tab with all revenue analytics |

All revenue calculations are client-side — no additional DQL queries needed beyond existing funnel/quality data.

### AI Insights Engine

- **Header button**: Single `AIInsightsButton` in the top header bar between timeframe selector and help icon. Uses `AIInsightsContext` (React context) to share open/close state with all tab components.
- **Three-sparkle icon**: SVG with 3 four-pointed diamond sparkles (large, medium, small) using purple gradient fill.
- **Panel**: `AIInsightsPanel` renders inside each tab via `useAIInsights(analysisFn)` hook, which reads open state from context and returns `{ panel }`. Panel includes Summary, color-coded Insights (good/warning/critical/info with left-border accents), and prioritized Recommendations (high/medium/low impact badges).
- **Typewriter animation**: `StreamText` component splits text into words, each rendered as a `<span>` with staggered `animationDelay` (60ms per word). CSS `@keyframes uj-ai-typewriter` (opacity 0→1, translateY 4→0, 0.3s duration). Section headers and insight rows also fade in sequentially with cumulative offsets.
- **Industry-Aware Enrichment**: The `useAIInsights` hook automatically calls `enrichWithIndustryContext()` on every analysis result. This function reads the user's selected industry from `useSettings()` and appends industry-specific benchmark comparisons based on detected metrics (conversion rate, Apdex, error rate, latency, LCP, CLS, third-party budget, mobile share). All 30+ tabs benefit without any per-tab code changes.
- **Industry Benchmarks** (`INDUSTRY_BENCHMARKS` in SettingsContext): Per-industry targets for 22 metrics across 8 verticals (E-Commerce, SaaS, Media, Financial Services, Travel, Healthcare, Gaming, General). Includes: convRateTarget, apdexTarget, avgDurationTarget, errorRateTarget, lcpTarget, clsTarget, inpTarget, costPerConvLow/High, revCostRatioTarget, cdnRoiTarget, idleUtilTarget, breakEvenHoursTarget, bounceRateTarget, frustratedPctTarget, sessionDepthTarget, retentionD7Target, thirdPartyBudgetMs, mobileShareExpected.
- **Data-Driven FinOps Analysis**: 5 dedicated analysis functions (`analyzeCostPerConversion`, `analyzePerformanceTax`, `analyzeIdleCapacity`, `analyzeCdnRoi`, `analyzeCostAnomalies`) compute actual metrics from tab data and compare against industry benchmarks with severity-appropriate insights.
- **Data-Driven Non-FinOps Analysis**: `analyzeWhatIf`, `analyzeRevenueIntelligence`, `analyzeSessionReplaySpotlight`, `analyzeABComparison` replace generic descriptions with data-driven analysis using available tab props + industry context.
- **Analysis functions**: 30+ tab-specific analysis functions using industry benchmarks:
  - Conversion: Industry-specific target (1.5%–8% depending on vertical)
  - Apdex: Industry-specific target (0.8–0.92 depending on vertical)
  - CWV: Google thresholds + industry targets (LCP 1800–3000ms, CLS 0.03–0.15, INP 100–250ms)
  - Error rate: Industry-specific (<0.1% financial to <2% media)
  - FinOps: Cost per conversion, revenue:cost ratio, idle utilization, CDN ROI, break-even hours
  - SLO compliance, cohort retention, engagement scoring, 3P impact, error clustering
- **Architecture**: All analysis runs client-side — pure heuristic functions, no external AI API calls. Each tab's analysis function receives computed data from the tab and returns `AIInsightsData { summary, insights[], recommendations[] }`. The `enrichWithIndustryContext` wrapper adds industry framing automatically.

- **Help Sheet**: Slide-out panel (`<Sheet>`) with `HelpContent` component covering all 31 tabs, configuration, Apdex, CWV thresholds, and tips
- **What's New section**: Changelog at the top of Help, newest entries first. Each entry has a date stamp, title, and bullet-pointed feature list. Styled with blue left-border accent cards. New changes are added at the top; older entries slide down — serves as an in-app audit log of feature changes

---

## Changelog

| Date | Version | Changes |
|------|---------|---------||
| 2026-06-11 | 4.53.5 | **AI Insights — Industry-Aware Analysis Engine**: All 30+ AI analysis functions now automatically enriched with industry-specific benchmarks via `enrichWithIndustryContext()` in the `useAIInsights` hook. New Industry setting (8 verticals: E-Commerce, SaaS, Media, Financial Services, Travel, Healthcare, Gaming, General) in SettingsContext with `INDUSTRY_BENCHMARKS` containing 22 per-industry metrics. New `IndustryBenchmark` interface. 9 data-driven analysis functions replace `analyzeGenericTab` calls: `analyzeCostPerConversion`, `analyzePerformanceTax`, `analyzeIdleCapacity`, `analyzeCdnRoi`, `analyzeCostAnomalies`, `analyzeWhatIf`, `analyzeRevenueIntelligence`, `analyzeSessionReplaySpotlight`, `analyzeABComparison`. Enrichment function detects metric keywords in existing insights and appends contextual industry comparisons (conversion rate, Apdex, error rate, latency, LCP, CLS, third-party, mobile share). Help panel and DESIGN.md updated. |
| 2026-06-04 | 4.53.0 | **FinOps Tab Group — 5 New Sub-Tabs**: Added 8th parent tab group "FinOps" with 5 sub-tabs: Cost per Conversion (infrastructure spend per conversion, efficiency scorecard), Performance Tax (revenue lost to latency/frustration/errors with ROI scenarios), Idle Capacity (traffic pattern analysis detecting idle hours and autoscaling savings), CDN ROI (latency reduction → conversion improvement modeling with payback period), Cost Anomalies (z-score anomaly detection on daily cost trend with budget forecast). 5 new user-configurable cost settings in SettingsContext (Monthly Infra Cost, CDN Monthly Cost, Compute Cost/Hour, Cost Per GB, Engineer Hourly Rate) — all default to $100. Help panel, AI Insights descriptions, and DESIGN.md updated. App now has 36 sub-tabs across 8 parent groups. |
| 2026-05-29 | 4.49.98 | **Forecast Modal — Multi-Model Popup Forecasting**: Clicking any KPI card now opens a full-screen `ForecastModal` popup (`ui/app/components/ForecastModal.tsx`) instead of navigating to the Predictive Forecasting tab. Modal displays historical sparkline data + 7-day forecast with confidence band in an interactive SVG chart. Users select from 6 forecasting models via dropdown: Holt-Winters (Double Exponential Smoothing), Triple Exponential Smoothing, Prophet (piecewise trend + Fourier seasonality), ARIMA(5,1,2), SARIMA(3,1,1)(1,1,1,m), and Linear Regression. Hover crosshair shows actual/forecast values with confidence interval. Click-outside or Close button dismisses. KpiCard `onDrillToForecast` prop changed from `() => void` to `(label, sparkline, color) => void`; cards only show clickable state when sparkline has ≥2 points. AI Assist recommendations updated to reference Forecast Modal. Help panel updated with new What's New entry and Tips section. |
| 2026-05-28 | 4.49.94 | **KPI Cards — Sparklines, Comparison Arrows & Drill-to-Forecast**: Funnel Overview and Executive Summary KPI cards upgraded with inline sparklines (time-bucketed trend lines from `trendsSparklineQuery`/`trendsConvSparklineQuery`), period-over-period comparison arrows showing % delta vs. previous timeframe (`prevRawValue`), and one-click drill-to-forecast navigation (clicking a card navigates to the Predictive Forecasting tab). AI Assist (`analyzeFunnelOverview`, `analyzeTrends`) now proactively recommends drilling into Predictive Forecasting when negative trends are detected (low conversion, poor Apdex, rising errors). Help panel updated with What's New entry and tab description refresh. |
| 2026-05-20 | 4.49.68 | **What-If Analysis — Infrastructure Headroom & Latency Improvement**: Added Latency Improvement slider (0-50%) simulating performance optimizations that reduce projected latency and partially offset conversion degradation. Added Infrastructure Headroom section using `dt.host.cpu.usage` and `dt.host.memory.usage` to assess whether hosts can sustain simulated traffic — shows projected CPU/memory, max sustainable increase before 85% threshold, gauge bars, and SUFFICIENT/AT RISK/CRITICAL verdict. |
| 2026-05-20 | 4.49.67 | **Conversion Attribution — Multi-Touch Attribution Modeling**: Removed Marketing Channel Attribution (UTM). Added multi-touch attribution modeling with 6 models (First Touch, Last Touch, Linear, Position-Based, Time-Decay, Influence-Based). Step influence cards ranked by conditional conversion probability uplift. Attribution model comparison table with credit allocation per step. SVG influence visualization bar chart. Revenue credit per step when AOV configured. Drop-off cost estimation per step. Help, AI Insights, and DESIGN.md updated. |
| 2026-05-20 | 4.49.62 | **Errors & Drop-offs — Predictive Drop-off Scoring**: Linear regression on hourly error rates per funnel step projects 2 hours forward, estimating how much additional drop-off will occur if the current error trajectory continues. Severity-colored cards (critical >5%, warning >2%) display current error rate, projected rate, and trend per hour. Uses `rootCauseStepDropQuery` data passed via `stepDropData` prop. Help, AI Insights, and DESIGN.md updated. |
| 2026-05-20 | 4.49.60 | **Root Cause Correlation — Full-Stack Correlation**: Service topology filtered to only services called by the selected application via entity `calls[dt.entity.service]` relationships. BFS traversal up to 7 depth tiers. Clickable service nodes open Gen3 Dynatrace Services with matching timeframe. Names resolved for all tiers via lookup. Davis AI problems overlaid with red links. Impact banner. |
| 2026-05-19 | 4.49.47 | **Navigation Flow Diagram & Click Issues Session Links**: Navigation Paths gains Sankey-like SVG flow diagram (BFS layer assignment, 220×52 nodes, curved links, horizontal scroll), graph-based conversion probability with drop-off-aware iterative relaxation, AI Path Optimization card. Click Issues gains Frustration Clusters by Page grouping and "View Sessions ↗" links to gen3 User Sessions (filtered by app+page+frustrated). Segmentation gains OS version table, AI Segment Discovery (always visible), ISO→country name translation. Sankey per-column limit raised to 12 with scroll. Davis problems now displays `event.name` (fixes Unknown Problem titles). |
| 2026-05-18 | 4.49.12 | **Map — Configurable Time-Lapse Buckets & Drilldown**: Time-Lapse bucket size now configurable via dropdown (1 min, 5 min, 10 min, 30 min, 1 hour — default 1h). Clicking a country during Time-Lapse drills into User Sessions scoped to that country AND the exact time bucket displayed. **Metric-Aware AI Insights**: `analyzeMapByMetric` function provides dedicated analysis for each colorize-by metric (traffic distribution, latency hotspots, Apdex satisfaction, error concentration, CWV geographic gaps, revenue distribution, conversion geography). AI panel re-runs analysis when metric selection changes. **Timelapse Tooltips**: Tooltip content now reflects the selected colorize-by metric instead of always showing Apdex/Sessions/Duration/Errors. |
| 2026-05-18 | 4.49.4 | **Map — Conversion Rate Colorize-By & Time-Lapse Animation**: Added Conversion Rate as 9th colorize-by option using two-pass session-level DQL query (`geoConversionQuery`). Added Time-Lapse animation mode that plays through hourly map snapshots showing performance/traffic shifts across time zones (Play/Pause, scrubber slider, hour label). Conv % column added to ranked table. Conv Rate legend added. **Geo Heatmap — AI Insights Enhanced**: `analyzeGeoHeatmap` now analyzes conversion data (high/low/zero-converting regions with recommendations) and ISP network data (slow ISPs with peering recommendations). Help panel and AI Assist tab descriptions updated. |
| 2026-05-17 | 4.47.90 | **Hyperlyzer Tab — Multidimensional Radial Performance Explorer**: New tab (31st) ported from standalone Hyperlyzer app. Radial SVG chart with 4 quadrants (OS, Geo, User Action, Browser), 8 selectable metrics (Duration/Apdex/LCP/INP/CLS/TTFB/Load Event End/FCP), cross-dimensional click-to-filter stacking, finding cards with outlier detection, paginated side table with color-coded ratings and drilldown links. Component split: `RadialHyperChart.tsx` (reusable SVG chart) + `HyperlyzerTab.tsx` (tab wrapper with DQL queries). AI Insights integration. Help, Settings, and DESIGN.md updated. Tab count 30→31. |
| 2026-05-15 | 4.47.88 | **Resource Waterfall — Session Drill-Down & Top 10 Slowest**: Added "Top 10 Slowest Resources" section showing individual resource requests ranked by duration with clickable session links. Added "Session Drill-Down" panel with session selector buttons — click to see all resources loaded in that specific session with a "View Full Session" replay link. New `resourceSessionDrillQuery` fetches per-session resource data (top 50 by duration). Help and AI Insights updated. |
| 2026-05-15 | 4.47.86 | **SLO Tracker — Editable Targets & Create Dynatrace SLO**: SLO target values now user-editable inline (✎ icon per metric, persisted via `useUserAppState`). Reset button (↺) restores defaults. Added one-click "Create SLO" button per metric that opens Dynatrace SLO management app. |
| 2026-05-15 | 4.47.85 | **Perf Budgets — Configurable Thresholds, Time-to-Breach & Alerts**: Thresholds now user-configurable inline (✎ icon per metric, persisted via `useUserAppState`). Added projected time-to-breach per metric using period-over-period trend rate. Near-breach alerting (within 10% of threshold) with yellow "NEAR" badge and alert banner. Workflow Trigger Suggestion section provides DQL condition template for Dynatrace Workflow automation. Cards compacted to grid layout with Period Δ indicator. Budget Summary Table gains "Breach" column. "Near Breach" KPI added. Previous-period quality data passed to component for trend computation. |
| 2026-05-15 | 4.47.83 | **Exceptions — Source Map Deobfuscation & Regression Detector**: Redesigned error cards to match Metric Forecasts style (compact grid layout, severity-colored left border, clean header). Added inline source map deobfuscation — parses file:line:col from error names and displays monospace "Source" row per card. Added regression detector comparing current vs previous period: classifies each error as NEW (cyan), RECURRING (yellow), or REGRESSION (red) with badge. KPI row expanded with New/Recurring/Regressions counts. Previous-period DQL query added. DataTable gains Status column. AI Insights updated with source/regression analysis. |
| 2026-05-15 | 4.47.84 | **Web Vitals — CWV Trend Lines & Remediation Recommendations**: Added daily CWV trend chart (LCP/INP/TTFB on shared axis, CLS separate scale) with Google threshold dashed lines and trend direction indicators (▲/▼/●). Added automated remediation recommendations per failing vital — anomaly-card style with FAILING/NEEDS IMPROVEMENT badge, top 3 offending pages, and 5 actionable recommendations per metric. Added "Failing Vitals" KPI. Reuses existing `sloCwvTrendQuery` data. AI Insights updated with trend + remediation awareness. |
| 2026-05-15 | 4.47.80 | **Worst Sessions — AI Impact Score & Pattern Clustering**: Replaced static composite ranking (frustrated/errors/max_dur sort) with ML-driven Impact Score (0–100). Z-score normalization across 4 severity dimensions weighted by systemic multiplier (error frequency across sessions). "Sessions Like This" column shows cluster size per behavioral fingerprint. SYSTEMIC badge for repeatable patterns. Pattern Clusters section with systemic/outlier counts. Query enhanced with `collectDistinct(pageName)`, `collectDistinct(errName)`, `p90_dur`, limit raised to 50 for scoring population. AI Insights updated with cluster-aware analysis. |
| 2026-05-15 | 4.47.79 | **Step Details — Web Vitals Button for Single-Page Steps**: Added "Web Vitals" toggle button (cyan accent) for single-page steps. When clicked, expands a panel showing LCP, CLS, INP color-coded against Google thresholds with Good/Needs Improvement/Poor labels beneath each metric. |
| 2026-05-15 | 4.47.78 | **Step Details — Page Drop-off Funnel & CWV Overlay**: Added Page Drop-off Contributors funnel for multi-page steps — horizontal bars ranked by event count, Apdex color-coded, with percentage drop indicators. Added LCP/CLS/INP overlay in Compare Pages view per page. `cwvByPageQuery` updated to include INP. `cwvByPage` data passed to StepDetailsTab. Help and AI Insights updated. |
| 2026-05-11 | 4.47.43 | **Step Details — Per-Page Comparison + Wildcard Enhancements**: Step Details tab now supports per-page comparison for multi-page steps — Compare Pages button (purple accent) reveals per-page breakdown with PRIMARY badge on first page, delta indicators (▲/▼ with %) comparing each subsequent page against the primary baseline, individual Apdex gauges, and Vitals links (skipping wildcards). New `pageMetricsQuery` groups by `view.name` for per-page metrics. Mid-string wildcards supported (`/journeys/*/book` → `startsWith() AND endsWith()`). Dynatrace `:id:` placeholders recognized as wildcards to prevent broken links. AI Insights updated with multi-page awareness. |
| 2026-05-11 | 4.47.42 | **Multi-Page Funnel Steps + Wildcard Support**: Each funnel step now supports multiple page identifiers with OR logic — e.g. (Step1a OR Step1b) AND Step2 AND (Step3a OR Step3b). Wildcards supported in all positions: `/home*` (startsWith), `*home` (endsWith), `*home*` (contains). DQL filters generate `startsWith()`, `endsWith()`, `contains()` expressions. Links skip wildcard identifiers (use first non-wildcard for Vitals URL). Settings UI updated with per-step "+ Add Page" button and per-identifier remove. Backward-compatible migration from old `identifier: string` to `identifiers: string[]` format. Updated Help docs |
| 2026-05-10 | 4.47.39 | **AI Insights Engine**: Header-level AI Insights button (3-sparkle icon) between timeframe selector and help icon. Collapsible panel per tab with Summary, color-coded Insights (good/warning/critical/info), and prioritized Recommendations (high/medium/low). Typewriter streaming animation (60ms/word, 0.3s fade). 25+ tab-specific analysis functions with industry benchmarks (conversion 2-5%, Apdex thresholds, Google CWV targets, error rate <1%). React context (`AIInsightsContext`) shares state from header to all 30 tab components via `useAIInsights` hook. All analysis client-side — zero external API calls |
| 2026-05-09 | 4.47.33 | **4 New Tabs + Funnel Velocity Sub-Tab**: Cohort Retention (daily cohorts, device breakdown, conv rate curves), Session Engagement (0-100 score per session, tier conversion rates, high-intent non-converters), Third-Party Impact (1P vs 3P resource analysis, domain breakdown, CWV correlation), Error Clustering (error grouping by type, hourly trend, impact ranking). Sankey gets 9th sub-tab: Funnel Velocity (step transition times, median/P90/avg per pair, journey time histogram). 8 new DQL queries, tab count 26→30 |
| 2026-05-10 | 4.47.18 | **Sankey — Funnel Leakage Sub-Tab**: New 8th sub-tab analyzing users who leave the funnel. Session classification (recoverers vs lost vs straight-through), exit step distribution with stacked bar chart, off-funnel destination mapping with recovery/conversion rates, behavioral comparison (path length, off-funnel pages, deepest step, top exit pages), CWV/error diagnostic signals with health scores, revenue impact estimation (AOV), auto-generated insights engine with severity levels |
| 2026-05-09 | 4.47.15 | **Funnel & Sankey — New Chart Styles**: Funnel Overview gets 5 visualization styles (Classic, Horizontal Bar, Stacked Cohort, Elapsed-Time Curve, Comparison Split) with style selector and Settings persistence. Sankey updated to 7 chart styles — removed Sunburst & Parallel Sets, added Chord Diagram (clickable arcs, focus mode, center label) and Transition Heatmap (52px cells, row/col highlighting, selection summary). Both Chord and Heatmap support selection + focus mode integration |
| 2026-05-08 | 4.47.9 | **Sankey — Sub-Tab Analytics Suite**: Reorganized into 7 sub-tabs (Flow Chart, Conversion Paths, Loop Analysis, Page Timing, Session Endpoints, Revenue Paths, Path Trends). Conversion vs. abandoned path differentiators, A→B→A loop detection with error/LCP correlation, avg/P90 page timing, terminal page & bounce analysis, revenue path ranking (AOV), period-over-period path trend detection. 2 new DQL queries (page duration, previous-period paths) |
| 2026-05-08 | 4.47.7 | **Sankey — Rich Hover Tooltips**: All 4 renderers now show rich hover tooltips with top 3 inbound/outbound (count & %), self-reload detection (⟲), and error counts. `buildNodeTooltip()` for classic/gradient, `buildLabelTooltip()` for directed/alluvial/state machine |
| 2026-05-08 | 4.47.6 | **Error Inspector linking fix**: Use `(Web) Page Name` filter field instead of `Page` |
| 2026-05-08 | 4.47.3 | **Sankey — Funnel Analytics & Health Scoring**: Funnel page highlighting (gold/★/dashed borders across all 5 chart styles), exit detection (≥30% off-funnel = red/⛔), per-page CWV & error overlays on node selection, Key Observations & Recommendations engine, Funnel Exit Analysis table (return rates, lost revenue), Off-Funnel Destinations table, Page Health Scorecard (composite health score), Error Inspector linking from scorecard, 3 new DQL queries (CWV per page, errors per page, extended paths), What's New section added to Help |
