# PVC Pipe Production & Analytics Suite 🏭
### منظومة إنتاج وتحليل مواسير البلاستيك (uPVC & PVC)

A production-grade, unified industrial platform engineered specifically for PVC and uPVC pipe manufacturing extrusion plants. It consolidates automated daily shift evaluation, factory SOP compliance (`SOP-EXT-PVC-01`), 24-hour hourly logging, OEE performance tracking, single-page A4 landscape PDF reporting, machine sizing feasibility analysis, ERP data cleaning, and production run planning into a single modular architecture.

---

## 🌟 Architecture & Core Modules

The application is structured into two core interconnected modules accessible via the top industrial navigation bar:

```
┌────────────────────────────────────────────────────────────────────────┐
│             🏭 PVC PIPE PRODUCTION & ANALYTICS SUITE                   │
│  [Module Switcher: 📊 Pipe Data Intelligence  |  📋 Daily OEE Evaluation] │
│  [Data Hub: Upload Excel / ERP / Samples] [Theme: 🌙/☀️] [Lang: EN/AR]    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  📊 Pipe Data Intelligence   │        │   📋 Daily OEE Evaluation    │
├──────────────────────────────┤        ├──────────────────────────────┤
│ • Master Extrusion Runs      │        │ • 24-Hour Production Sheet   │
│ • Production KPIs & Charts   │        │   (Hourly, Shift, SOP views) │
│ • Cleaning & Audit Table     │        │ • Single-Page A4 PDF Export  │
│ • Production Planning Matrix │        │ • Batch Date-Range ZIP Export│
│ • Unique Sizing Catalog      │        │ • Production Log Uploader    │
│ • Verification Center        │        │ • Plant OEE Analytics        │
│                              │        │ • MySQL / Local History      │
└──────────────────────────────┘        └──────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│      🔌 Backend Services     │        │    🐍 Python CLI Cleaner     │
├──────────────────────────────┤        ├──────────────────────────────┤
│ • PHP / MySQL REST API       │        │ • Standalone CLI Batch       │
│   (api/save_report.php, etc.)│        │   Excel Cleaner & Auditor    │
│ • Database schema.sql        │        │ • pandas, openpyxl, numpy    │
└──────────────────────────────┘        └──────────────────────────────┘
```

### Module 1: Pipe Data Intelligence & Planning (منصة تحليل وتخطيط الإنتاج)
- **Automated Data Cleaning & Audit**:
  - Arithmetic verification: `Total Weight = Production Qty × Unit Weight`.
  - Scrap rate auditing: `Scrap % = (Scrap / (Total Weight + Scrap)) * 100`.
  - Operating hour validation: ensures operating hours $\le 24$ hours/day and calculates downtime.
  - Product specs parsing: extracts material (`uPVC`, `PVC`, `HDPE`, `PPR`), outer diameter (metric `mm` or imperial inches ASTM D1785), and pressure rating (`PN-12.5`, `SCH40`, `SDR-11`).
- **Master Extrusion Runs Table**:
  - 18 standardized production tracking columns.
  - Frozen headers, dynamic search, multi-column sorting, and Excel export.
- **Executive KPIs & Recharts Dashboards**:
  - Net finished goods (Metric Tons & Pieces), scrap percentage, throughput ($kg/hr$), and capacity utilization.
  - Interactive charts for machine comparisons, daily volume trends, downtime Pareto causes, and extrusion velocities.
- **Production Planning & Unique Catalog Matrix**:
  - Calibrated physical sizing envelope rules matching diameter to extruder capability.
  - Multi-candidate machine allocation with primary and alternate recommendations.
- **Self-Aware Verification Center**:
  - Automated capability registry, golden case testing, and retest intelligence.

### Module 2: Daily OEE & Shift Evaluation (سجل الوردية والتقييم اليومي)
- **Standardized Plant Compliance**:
  - Plant SOP Reference: `SOP-EXT-PVC-01` | Document Version: `04` | Status: `Standardized`.
  - 24-hour log sequence (`07:00` to `07:00`) with Shift 1 (`06:30 - 18:30`) and Shift 2 (`18:30 - 06:30`) subtotals.
- **Transparent OEE Mathematics**:
  - $\text{Availability} = \frac{\text{Operating Hours}}{24}$
  - $\text{Performance} = \frac{\text{Actual Output}}{\text{Operating Hours} \times \text{Standard Hourly Rate}}$
  - $\text{Quality} = \frac{\text{Good Output}}{\text{Actual Output}}$
  - $\text{OEE} = \text{Availability} \times \text{Performance} \times \text{Quality}$
- **Pixel-Perfect Single-Page A4 Landscape PDF Export**:
  - Strict zero-overflow A4 landscape PDF layout via client-side canvas engine (`html2pdf.js`).
  - Batch date-range ZIP exports bundling multiple machine reports into a single archive.
- **Historical Persistence**:
  - Client-side IndexedDB engine for massive datasets (7,400+ runs) without storage quotas.
  - LocalStorage daily report history + remote Hostinger MySQL backend via REST API (`api/`).

---

## 🏭 Factory Extrusion Line Master Registry

Configured with the 9 actual plant extrusion lines:

| Line ID | Extruder Model | Nominal Capacity | Diameter Envelope | Line Type |
| :--- | :--- | :--- | :--- | :--- |
| **L-01** | KTS 550 | 400 kg/h | Broad / N/A | Pelletizing & Compounding |
| **L-02** | KTS 250 TDH | 200 kg/h | 20 - 50 mm | Pipe Extrusion Line |
| **L-03** | KTS 700 | 500 kg/h | 110 - 400 mm | Pipe Extrusion Line |
| **L-04** | KTS 200 | 180 - 200 kg/h | 25 - 63 mm | Pipe Extrusion Line |
| **L-05** | KTS 350 | 290 - 330 kg/h | 75 - 160 mm | Pipe Extrusion Line |
| **L-06** | Kabra 90 | 380 kg/h | 110 - 200 mm | Pipe Extrusion Line |
| **L-07** | KTS 170 | 135 - 150 kg/h | 20 - 75 mm | Pipe Extrusion Line |
| **L-08** | KTS 350 TDH | 300 kg/h | 25 - 75 mm | Pipe Extrusion Line |
| **L-09** | Bausano | 1100 kg/h | Broad / N/A | High-Capacity Compounding |

---

## 📁 Repository Structure

```
pvc_pipe_production/
├── .env.example                       # Unified environment variables
├── .gitignore                         # Git exclusion rules (node, dist, python, cache)
├── package.json                       # Unified npm dependencies & test scripts
├── vite.config.js                     # Unified Vite build config with manual chunking
├── tailwind.config.js                 # Tailwind styling system & custom palettes
├── postcss.config.js                  # PostCSS plugins
├── index.dev.html                     # Vite development entry point
├── index.html                         # Production root entry point (Hostinger synchronized)
├── README.md                          # Comprehensive documentation
│
├── api/                               # PHP MySQL Backend API for Daily Reports
│   ├── config.php                     # PDO connection & CORS headers
│   ├── save_report.php                # Save daily evaluation report
│   ├── get_report.php                 # Retrieve single report by ID
│   ├── get_history.php                # Retrieve report history list
│   ├── delete_report.php              # Delete report
│   └── schema.sql                     # Database schema definition
│
├── python_cleaner/                    # Standalone Python CLI Batch Tool
│   ├── pipe_cleaner.py                # CLI script for processing Excel workbooks
│   └── requirements.txt               # pandas, openpyxl, numpy
│
├── public/                            # Public assets & official Excel templates
│   ├── .htaccess                      # Apache / LiteSpeed URL rewrite & mime types
│   ├── favicon.svg                    # Extruder icon
│   ├── Master_Upload.xlsx             # Benchmark master workbook
│   ├── AlManar_2.xlsx                 # Historical factory workbook
│   └── PVC_Pipe_Daily_Follow.xlsx     # Official SOP follow sheet template
│
├── scripts/
│   └── sync-dist.js                   # Automated post-build sync for root & public_html
│
├── src/
│   ├── main.jsx                       # React entry point
│   ├── App.jsx                        # Master Unified Portal Layout
│   │
│   ├── config/
│   │   └── machines.js                # Unified machine master & physical sizing profiles
│   │
│   ├── styles/
│   │   ├── index.css                  # Tailwind CSS, themes (Dark & Warm Light), fonts
│   │   └── dailyEvaluation.css        # Scoped SOP styles & single-page A4 landscape print rules
│   │
│   ├── data/
│   │   ├── sampleData.js              # Production sample rows
│   │   └── sampleHistoricalErpData.js # Historical ERP records
│   │
│   ├── components/
│   │   ├── common/                    # Shared portal components (Navbar, ErrorBoundary, DataHub)
│   │   ├── daily-evaluation/          # Daily evaluation views (ReportSheet, LegacySopSheet, Uploader, etc.)
│   │   └── data-analysis/             # Analytics views (MasterTable, Charts, Planning, Verification, etc.)
│   │
│   ├── utils/                         # Shared utilities & business logic
│   │   ├── translations.js            # Arabic & English localization dictionary
│   │   ├── dataCleaner.js             # Specifications parsing & arithmetic validation
│   │   ├── analyticsEngine.js         # KPIs & aggregated throughput math
│   │   ├── inferenceEngine.js         # Machine allocation & master plan generator
│   │   ├── indexedDbStorage.js        # IndexedDB storage layer for large datasets
│   │   └── masterProfiles.js          # Sizing compatibility bridge
│   │
│   └── verification/                  # Automated verification engine & golden case runners
│
└── tests/                             # Unified 14 test suites
    ├── daily-evaluation/              # 8 unit test suites (engine, parser, batch, analytics, etc.)
    └── data-analysis/                 # 6 unit test suites (verification, clean catalog, master table, etc.)
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: v18.0+ (Tested on v24)
- **npm**: v9.0+ (Tested on v11)
- **Python** (Optional, for CLI cleaner): v3.9+ with `pandas`, `openpyxl`

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/khaledtaha-tech/pvc_pipe_production.git
cd pvc_pipe_production

# Install dependencies
npm install
```

### 2. Environment Setup
Copy the example environment file:
```bash
cp .env.example .env
```
Configure your database credentials in `.env` if using the Hostinger MySQL persistence layer.

### 3. Running Locally
```bash
npm run dev
```
The application will launch on `http://localhost:3000`.

### 4. Running the Test Suite (14 Suites)
```bash
# Run all 14 test suites
npm test

# Or run by module
npm run test:daily      # 8 Daily Evaluation test suites
npm run test:analysis   # 6 Data Analysis & Verification test suites
```

### 5. Building for Production
```bash
npm run build
```
The build executes `vite build` with code splitting and runs `scripts/sync-dist.js`, automatically synchronizing the compiled assets to:
- `dist/`
- Project root (`index.html`, `assets/`, `.htaccess`)
- `public_html/`

---

## 🌐 Deployment to Hostinger / LiteSpeed

This repository is optimized for direct Git deployment on Hostinger or any Apache / LiteSpeed server:
1. Connect the `main` branch of this repository in **Hostinger Git Deployment** or push directly to the server.
2. The pre-synchronized root `index.html`, `assets/`, and `.htaccess` allow immediate static serving with full SPA deep-linking and GZIP compression.
3. Configure your live database password in `api/config.php` (or through environment variables) and import `api/schema.sql` via phpMyAdmin to enable remote MySQL report persistence.

---

## 🐍 Standalone Python CLI Batch Cleaner

For terminal-based automated file cleaning:
```bash
cd python_cleaner
pip install -r requirements.txt
python pipe_cleaner.py "path/to/Daily_Production_Report.xlsx"
```
Outputs a cleaned and formatted workbook with dedicated audit summary sheets.

---

## 📄 License & Attribution
Engineered for industrial PVC pipe manufacturing facilities. Maintained under [khaledtaha-tech/pvc_pipe_production](https://github.com/khaledtaha-tech/pvc_pipe_production).