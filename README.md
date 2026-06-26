# DISCLAIMER
This project was created by myself, an SE of Dynatrace. This is not an official Dynatrace application and it is not something you can open a support ticket on. You may create an issue on the github repository, however there is no guaruntee it will be addressed (this isn't my primary job, just a fun project). Feel free to fork the repository (https://github.com/TechShady/user-journey-app) for your own use as well.

# User Journey & Experience

A 31-tab frontend observability suite built as a Dynatrace Platform App. Provides real user monitoring (RUM) funnel analysis, Web Vitals tracking, geographic heatmaps, predictive forecasting, and more — all powered by DQL.

![User Journey & Experience App](screenshot.png)

## Features

| Tab | Description |
|-----|-------------|
| **Funnel Overview** | Conversion funnel with Apdex scoring and drop-off analysis |
| **Trends** | Period-over-period time-series for key funnel metrics |
| **Web Vitals** | LCP, CLS, INP, TTFB with good/poor thresholds |
| **Sankey** | Flow visualization with 5 rendering styles |
| **Step Details** | Per-step performance breakdowns |
| **Worst Sessions** | Sessions with worst performance or highest drop-off |
| **Exceptions** | Frontend/backend exception analysis with affected sessions |
| **Click Issues** | Rage clicks, dead clicks, and click-path problems |
| **Perf Budgets** | Performance budget compliance monitoring |
| **Geo Heatmap** | Geographic performance heatmap |
| **Map** | World and US map visualizations |
| **Navigation Paths** | User navigation path analysis |
| **Anomaly Detection** | Anomalous metric and session detection |
| **Conversion Attribution** | Factors most impacting conversion by device/browser |
| **Executive Summary** | High-level dashboard for leadership |
| **Segmentation** | User segment analysis |
| **Errors & Drop-offs** | Error correlation with funnel abandonment |
| **What-If Analysis** | Simulated scenario modeling |
| **Root Cause Correlation** | Correlate performance issues with root causes |
| **Predictive Forecasting** | Forecast future trends |
| **Resource Waterfall** | Resource-level loading waterfall per funnel step |
| **Change Intelligence** | Before/after metrics around deployments |
| **SLO Tracker** | Service level objective and error budget tracking |
| **Session Replay Spotlight** | Highest-impact session replays |
| **A/B Comparison** | Platform variant performance comparison |
| **Revenue Intelligence** | Revenue impact analysis with performance taxes |
| **Cohort Retention** | Daily user cohort conversion curves |
| **Session Engagement** | Per-session engagement scoring |
| **Third-Party Impact** | First-party vs third-party resource analysis |
| **Error Clustering** | Error grouping by type/pattern |
| **Hyperlyzer** | Multidimensional radial performance explorer |

## Getting Started

### Prerequisites

- Node.js ≥ 16.13
- A Dynatrace environment with RUM enabled
- `dt-app` CLI (`npx dt-app`)

### Install

```bash
npm install
```

### Development

```bash
npx dt-app dev
```

### Deploy

```bash
npx dt-app deploy
```

## Configuration

The app monitors a configurable frontend application and funnel steps. Default funnel:

1. **Home** → 2. **Search** → 3. **Journey Detail** → 4. **Book**

All tabs support user-configurable visibility and ordering (persisted per user).

## Tech Stack

- **Platform:** Dynatrace App Toolkit (dt-app)
- **UI:** React 18 + Strato Design System
- **Data:** DQL via `@dynatrace-sdk/client-query`
- **Visualizations:** D3-geo, TopoJSON, custom SVG

## License

ISC
