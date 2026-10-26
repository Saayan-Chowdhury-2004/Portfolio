import { KANJI_BRUTALIST_BOLD_B64, KANJI_BRUTALIST_REGULAR_B64 } from "./kanjiFontData";
import { clamp, hash3, smoothstep } from "./math";

export interface DynamicAgeBreakdown {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Dynamically calculates exact elapsed years, months, days, hours, minutes, and seconds
 * from date of birth: 18 February 2004 (local time). Never hardcodes the displayed age.
 */
export function computeDynamicAgeBreakdown(now: Date = new Date()): DynamicAgeBreakdown {
  const birthYear = 2004;
  const birthMonth = 1; // February (0-indexed)
  const birthDay = 18;

  let years = now.getFullYear() - birthYear;
  let months = now.getMonth() - birthMonth;
  let days = now.getDate() - birthDay;

  if (days < 0) {
    months -= 1;
    const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  return { years, months, days, hours, minutes, seconds };
}

interface EducationEntry {
  index: string;
  institution: string;
  qualification: string;
  dateLabel: string;
  statusTag: string;
  focusAreas: string;
  highlights: string;
}

const EDUCATION_ITEMS: readonly EducationEntry[] = [
  {
    index: "01",
    institution: "Indian Institute of Technology (IIT) Patna",
    qualification: "BSc, Computer Science and Data Analytics",
    dateLabel: "Graduated: July 2026",
    statusTag: "DEGREE // IIT PATNA",
    focusAreas: "Statistical Modeling · Machine Learning · Data Engineering · AI Systems",
    highlights:
      "Focused on large-scale data analytics, predictive modeling, computer vision pipelines, and applied artificial intelligence.",
  },
  {
    index: "02",
    institution: "Durgapur Institute of Advanced Technology and Management",
    qualification: "BTech, Computer Science and Engineering",
    dateLabel: "Expected: 2027",
    statusTag: "B.TECH // CSE",
    focusAreas: "Systems Architecture · Operating Systems · Computer Networks · Robotics",
    highlights:
      "Core engineering curriculum covering algorithms, distributed computing, embedded hardware integration, and software design.",
  },
  {
    index: "03",
    institution: "Hem Sheela Model School",
    qualification: "Class XII, 72.00%",
    dateLabel: "Completed: 2022",
    statusTag: "HIGHER SECONDARY // XII",
    focusAreas: "Physics · Chemistry · Mathematics · Computer Science",
    highlights:
      "Senior secondary specialization in quantitative sciences and foundational programming.",
  },
  {
    index: "04",
    institution: "Hem Sheela Model School",
    qualification: "Class X, 93.5%",
    dateLabel: "Completed: 2020",
    statusTag: "SECONDARY // X (93.5%)",
    focusAreas: "Science · Mathematics · Information Technology",
    highlights:
      "Graduated with 93.5% aggregate distinction across core analytical and scientific subjects.",
  },
];

interface SkillCategoryEntry {
  index: string;
  category: string;
  items: string;
  tags: readonly string[];
  expandedSummary: string;
}

const SKILL_CATEGORIES: readonly SkillCategoryEntry[] = [
  {
    index: "01",
    category: "Languages",
    items: "Python, SQL, C++",
    tags: ["Python 3", "SQL", "C++", "AsyncIO", "Data Structures"],
    expandedSummary:
      "Production scripting, asynchronous backend services, relational query optimization, and low-latency algorithmic modules.",
  },
  {
    index: "02",
    category: "AI/ML",
    items: "Scikit-learn, YOLOv8, Sentence Transformers, local LLM inference (Ollama)",
    tags: ["YOLOv8", "ByteTrack", "Sentence Transformers", "Ollama LLM", "Scikit-learn"],
    expandedSummary:
      "Real-time multi-object drone detection, dense vector embeddings for semantic search, and self-hosted LLM orchestration.",
  },
  {
    index: "03",
    category: "Backend & Frontend",
    items: "FastAPI, Flask, React, REST API",
    tags: ["FastAPI", "Flask", "React", "REST APIs", "Custom TCP Sync"],
    expandedSummary:
      "High-throughput REST and custom chunked TCP protocols, webhook automation, and flicker-free live telemetry dashboards.",
  },
  {
    index: "04",
    category: "Databases",
    items: "PostgreSQL, ChromaDB, PostGIS",
    tags: ["PostgreSQL", "ChromaDB", "PostGIS", "Vector Indexing"],
    expandedSummary:
      "Relational schema design, vector similarity stores for RAG document retrieval, and geospatial query processing.",
  },
  {
    index: "05",
    category: "Robotics",
    items: "Arduino, Raspberry Pi",
    tags: ["Raspberry Pi 5", "Arduino", "UAV Telemetry", "Edge Vision"],
    expandedSummary:
      "On-board edge AI inference on Raspberry Pi 5, multi-sensor drone payload integration, and hardware telemetry sync.",
  },
  {
    index: "06",
    category: "Tools & Platforms",
    items: "Git, Docker, Linux, n8n, Blender",
    tags: ["Docker Compose", "Linux", "n8n Webhooks", "Git", "Blender", "GEE / GDAL"],
    expandedSummary:
      "Containerized microservice deployment, automated n8n ingestion workflows, geospatial raster processing, and 3D visualization.",
  },
];

interface ProjectTopicEntry {
  id: string;
  index: string;
  heading: string;
  badge: string;
  subtitle: string;
  pipeline: string;
  techStack: readonly string[];
  bullets: readonly string[];
}

const PROJECT_TOPICS: readonly ProjectTopicEntry[] = [
  {
    id: "drone-sync",
    index: "01",
    heading: "Autonomous Drone Detection & Data Synchronization System",
    badge: "ISRO IRoC-U 2026",
    subtitle: "ISRO IRoC-U 2026 — Team qualified through the Preliminary and Qualification Rounds",
    pipeline: "YOLOv8 + ByteTrack (Raspberry Pi 5) → Custom Chunked TCP Sync (SHA-256) → Live Telemetry Dashboard",
    techStack: ["YOLOv8", "ByteTrack", "Raspberry Pi 5", "TCP Sockets", "SHA-256", "HTML/CSS/JS"],
    bullets: [
      "Built a real-time drone detection and tracking pipeline (YOLOv8 + ByteTrack) on a Raspberry Pi 5.",
      "Engineered a custom TCP data-sync system with chunked transfer, SHA-256 verification, resume support, and priority queuing.",
      "Built a live monitoring dashboard (HTML/CSS/JS) with throttled DOM updates for flicker-free streaming.",
    ],
  },
  {
    id: "mailovertel",
    index: "02",
    heading: "MailOverTel — Self-Hosted AI Email Automation Platform",
    badge: "LOCAL LLM + DOCKER",
    subtitle: "Self-Hosted Conversational AI Email Dispatch & Provisioning Engine",
    pipeline: "Telegram Bot → Python Backend → Local Ollama LLM → Recipient Extraction → Gmail SMTP",
    techStack: ["Python", "Ollama LLM", "Telegram API", "Gmail SMTP", "Docker Compose", "Bash"],
    bullets: [
      "Built a self-hosted AI email automation system converting Telegram messages into structured emails via a local Ollama LLM and Gmail SMTP.",
      "Designed the pipeline: Telegram → Python backend → local LLM → structured email → Gmail SMTP, with automatic recipient extraction.",
      "Dockerized the app with Docker Compose and an automated setup script for dependencies, model provisioning, and builds.",
    ],
  },
  {
    id: "researchos",
    index: "03",
    heading: "ResearchOS — AI Research Assistant Platform",
    badge: "RAG + VECTOR SEARCH",
    subtitle: "Semantic Document Ingestion & Vector-Based Research Retrieval System",
    pipeline: "PDF Ingestion (PyMuPDF / n8n) → Sentence Transformers → ChromaDB Vector Store → FastAPI + React",
    techStack: ["FastAPI", "React", "Sentence Transformers", "ChromaDB", "n8n Webhooks", "PyMuPDF", "ngrok"],
    bullets: [
      "Engineered a document-ingestion and semantic-search pipeline using FastAPI, Sentence Transformers, and ChromaDB for vector-based retrieval.",
      "Built a React frontend integrated with FastAPI endpoints and automated ingestion workflows via n8n webhooks.",
      "Exposed local services through ngrok and resolved PDF-extraction (PyMuPDF) dependency issues.",
    ],
  },
  {
    id: "flying-eye",
    index: "04",
    heading: "Flying Eye — Drone-Based Intelligent ET Sensing & Irrigation System",
    badge: "SIH 2024 RUNNER-UP",
    subtitle: "Smart India Hackathon 2024 — Grand Finale Runner-up",
    pipeline: "Multi-Sensor Drone Imagery → NDVI & Penman–Monteith Modeling → Google Earth Engine + GDAL/Rasterio",
    techStack: ["Google Earth Engine", "Rasterio", "GDAL", "NDVI", "Penman–Monteith", "Drone Sensing"],
    bullets: [
      "Advanced to the Grand Finale of Smart India Hackathon 2024 and placed Runner-up.",
      "Designed an AET estimation workflow (NDVI, Penman–Monteith, crop-coefficient modeling) using Google Earth Engine, Rasterio, and GDAL, integrating multi-sensor drone data for field-level monitoring.",
    ],
  },
];

const STYLE_ELEMENT_ID = "brutalist-portfolio-columns-styles";
const ADDITIONAL_ANIM_GLYPHS = "SAAYANCHOWDHURY0123456789";

/**
 * Shrunk column width weight: reduced by 15% from 0.05 (5% of original width) -> 0.0425 (4.25% of original width).
 * Expanded column weight covers the remaining space of all 4 columns: 4.0 - 3 * 0.0425 = 3.8725.
 */
const SHRUNK_COL_WEIGHT = 0.05 * 0.85; // 0.0425
const EXPANDED_COL_WEIGHT = 4 - 3 * SHRUNK_COL_WEIGHT; // 3.8725
/**
 * Gap between shrunk columns reduced by 75% (to 25% of normal inter-column gap).
 */
const SHRUNK_GAP_MULTIPLIER = 0.25;

interface ColumnPalette {
  r: number;
  g: number;
  b: number;
  seamR: number;
  seamG: number;
  seamB: number;
  glyphR: number;
  glyphG: number;
  glyphB: number;
  accentHex: string;
  isOdd: boolean;
}

/**
 * Column color specs matching the 4 brutalist columns:
 * - Column 1 (Odd): Black (#161515) -> top-to-bottom expansion, vanishing gradient at the bottom
 * - Column 2 (Even): Earthy soil brown (#c0ad93) -> bottom-to-top expansion, vanishing gradient at the bottom
 * - Column 3 (Odd): Industrial grey (#9ea0a5) -> top-to-bottom expansion, vanishing gradient at the bottom
 * - Column 4 (Even): Warm white (#ebe9e4) -> bottom-to-top expansion, vanishing gradient at the bottom
 */
const COLUMN_PALETTES: readonly ColumnPalette[] = [
  {
    r: 22,
    g: 21,
    b: 21,
    seamR: 38,
    seamG: 36,
    seamB: 35,
    glyphR: 240,
    glyphG: 238,
    glyphB: 233,
    accentHex: "#ff6d14",
    isOdd: true,
  },
  {
    r: 192,
    g: 173,
    b: 147,
    seamR: 176,
    seamG: 158,
    seamB: 133,
    glyphR: 32,
    glyphG: 26,
    glyphB: 21,
    accentHex: "#b83706",
    isOdd: false,
  },
  {
    r: 158,
    g: 160,
    b: 165,
    seamR: 142,
    seamG: 145,
    seamB: 150,
    glyphR: 24,
    glyphG: 27,
    glyphB: 31,
    accentHex: "#b83706",
    isOdd: true,
  },
  {
    r: 235,
    g: 233,
    b: 228,
    seamR: 218,
    seamG: 215,
    seamB: 209,
    glyphR: 25,
    glyphG: 25,
    glyphB: 25,
    accentHex: "#d9460c",
    isOdd: false,
  },
];

/**
 * Red palette used for:
 * - Shrunk NAME (IDENTITY) column in dark mode
 * - Shrunk PROJECTS column in light mode
 */
const SHRUNK_RED_PALETTE: ColumnPalette = {
  r: 216,
  g: 38,
  b: 34,
  seamR: 180,
  seamG: 24,
  seamB: 20,
  glyphR: 255,
  glyphG: 235,
  glyphB: 230,
  accentHex: "#ff4d44",
  isOdd: true,
};

interface AnimatedBlockItem {
  el: HTMLElement;
  colIdx: number;
  orderRatio: number; // 0..1 order along the column's expansion direction
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Smooth cubic-bezier-like easing (`easeInOutCubic` blended with `smoothstep`) for silky column expansion/shrinking.
 */
function easeColumnTransition(t: number): number {
  const x = clamp01(t);
  // Quintic smoothstep C2-continuous S-curve: 6x^5 - 15x^4 + 10x^3
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Renders a word or phrase as a vertical stack of upright characters (top-to-bottom reading).
 */
function buildVerticalCharStackHTML(text: string, extraClass = ""): string {
  const chars = Array.from(text);
  const spans = chars
    .map((ch) => {
      if (ch === " ") {
        return `<span class="bp-vchar bp-vchar--space" aria-hidden="true">&nbsp;</span>`;
      }
      return `<span class="bp-vchar">${ch}</span>`;
    })
    .join("");
  return `<span class="bp-vstack ${extraClass}" aria-label="${text}">${spans}</span>`;
}

/**
 * Builds an accurate SVG silhouette of West Bengal (from the northern Darjeeling Himalayas
 * and Siliguri corridor through Malda, Murshidabad, Birbhum, Bardhaman/Panagarh, Purulia,
 * Bankura, Hooghly, Kolkata, Midnapore, and 24 Parganas down to the Bay of Bengal).
 * Visible only when the IDENTITY column is expanded; white in dark mode and dark in light mode.
 */
const WB_MAP_DATA_URI = "data:image/png;base64,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";

function buildWestBengalMapHTML(): string {
  return `
    <span class="bp-wb-map-wrap" title="West Bengal, India (Panagarh)" aria-label="Map of West Bengal">
      <img
        class="bp-wb-map-img"
        src="./images/west-bengal.png"
        alt="Map of West Bengal"
        decoding="async"
        onerror="if(!this.dataset.fb1){this.dataset.fb1='1';this.src='./images/WB.png';}else if(!this.dataset.fb2){this.dataset.fb2='1';this.src='${WB_MAP_DATA_URI}';}"
      />
    </span>
  `;
}

/**
 * Compute the vertical vanishing gradient alpha for row `r` out of `rows` in a column.
 * Both odd and even columns have their vanishing gradient at the bottom only (`u = 1`).
 */
function computeColumnGradientAlpha(u: number, _isOdd: boolean): number {
  const distFromVanish = 1 - u;
  const ramp = smoothstep(0.0, 0.26, distFromVanish);
  const gentleSlope = 0.90 + 0.095 * clamp01((distFromVanish - 0.26) / 0.74);
  return clamp01(ramp * gentleSlope);
}

/**
 * Manages the Brutalist Japanese-Inspired 4-Column Dynamic Expandable Portfolio UI:
 * - Every column expands when clicked upon to cover the area of the rest three columns
 *   while the rest three columns shrink their width by 15% further (`4.25%` of original width)
 *   and the gap between shrunk columns is reduced by 75% (`25%` of original gap).
 * - In dark mode, the shrunk NAME (`IDENTITY`) column changes its color to red;
 *   in light mode, the shrunk `PROJECTS` column changes its color to red.
 * - Neither expanding nor shrinking columns displays a glyph matrix effect during dynamic expansion/shrinking.
 * - Hardware-accelerated offscreen column strip atlas (`this.stripAtlasCanvas`) + quintic C2 easing
 *   provides locked 60/120 FPS smoothness during expansion and shrinking.
 */
export class BrutalistPortfolioUI {
  private readonly bgCanvas: HTMLCanvasElement;
  private readonly bgCtx: CanvasRenderingContext2D;
  private readonly staticColsCanvas: HTMLCanvasElement;
  private readonly staticColsCtx: CanvasRenderingContext2D;
  private readonly stripAtlasCanvas: HTMLCanvasElement;
  private readonly stripAtlasCtx: CanvasRenderingContext2D;
  private readonly root: HTMLElement;
  private colElements: HTMLElement[] = [];
  private colInnerWrappers: HTMLElement[] = [];
  private animBlocks: AnimatedBlockItem[] = [];

  private yearsValueEl!: HTMLElement;
  private monthsValueEl!: HTMLElement;
  private daysValueEl!: HTMLElement;

  private lastSecond = -1;
  private lastLightMode: boolean | null = null;

  // Two-stage initial formation animation state:
  // colProgress: [0..1] empty-glyph column expansion (Odd: top->bottom, Even: bottom->top)
  // textProgress: [0..1] text reveal strictly after colProgress === 1
  private targetOpen = false;
  private colProgress = 0;
  private textProgress = 0;
  private readonly colExpandDuration = 1.05;
  private readonly textRevealDuration = 0.62;

  // Dynamic single-column click-to-expand state with smooth C2 quintic easing:
  private expandedColIdx: number | null = null;
  private colWeights: [number, number, number, number] = [1, 1, 1, 1];
  private startColWeights: [number, number, number, number] = [1, 1, 1, 1];
  private targetColWeights: [number, number, number, number] = [1, 1, 1, 1];

  private gapMultipliers: [number, number, number] = [1, 1, 1];
  private startGapMultipliers: [number, number, number] = [1, 1, 1];
  private targetGapMultipliers: [number, number, number] = [1, 1, 1];

  private expandAnimProgress = 1;
  private readonly expandAnimDuration = 0.48;

  // 5-second slow red color transition for shrunk NAME (dark mode) and shrunk PROJECTS (light mode)
  private colRedProgress: [number, number, number, number] = [0, 0, 0, 0];
  private readonly shrunkRedDuration = 5.0;

  // Active opened project sub-topic index inside the expanded PROJECTS column
  private activeProjectIdx: number | null = 0;

  private atlasDirty = true;
  private staticDirty = true;
  private canvasSettled = false;
  private domSettled = false;

  private canvasW = 0;
  private canvasH = 0;
  private canvasDpr = 1;
  private cachedLeftPx = 0;
  private cachedRightClearance = 74;
  private cachedGapPx = 10;
  private cachedCw = 8;
  private cachedCh = 12;
  private baseColWidth = 100;
  private maxExpandedColWidth = 400;
  private atlasStripWidthPx = 420;
  private colLefts: [number, number, number, number] = [0, 0, 0, 0];
  private colWidths: [number, number, number, number] = [100, 100, 100, 100];

  constructor(parent: HTMLElement, private onStateChange?: () => void) {
    this.injectStyles();

    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.className = "bp-empty-glyph-canvas";
    this.bgCanvas.setAttribute("aria-hidden", "true");
    const ctx = this.bgCanvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for BrutalistPortfolioUI");
    this.bgCtx = ctx;

    this.staticColsCanvas = document.createElement("canvas");
    const sCtx = this.staticColsCanvas.getContext("2d");
    if (!sCtx) throw new Error("Offscreen 2D context unavailable for BrutalistPortfolioUI");
    this.staticColsCtx = sCtx;

    this.stripAtlasCanvas = document.createElement("canvas");
    const aCtx = this.stripAtlasCanvas.getContext("2d");
    if (!aCtx) throw new Error("Atlas 2D context unavailable for BrutalistPortfolioUI");
    this.stripAtlasCtx = aCtx;

    this.root = this.buildDOM();
    parent.appendChild(this.bgCanvas);
    parent.appendChild(this.root);

    this.updateAgeDOM(new Date());
    this.collectAnimatedBlocks();
  }

  /**
   * True while initial column formation, text reveal, or dynamic column expansion/shrinking is in progress.
   */
  get isAnimating(): boolean {
    const initAnim = this.targetOpen
      ? this.colProgress < 1 || this.textProgress < 1
      : this.colProgress > 0 || this.textProgress > 0;
    if (initAnim) return true;
    if (this.expandAnimProgress < 1) return true;
    const isLight = Boolean(this.lastLightMode);
    for (let i = 0; i < 4; i++) {
      const isColShrunk = this.expandedColIdx !== null && this.expandedColIdx !== i;
      const shouldTurnRed = isColShrunk && ((!isLight && i === 0) || (isLight && i === 3));
      const targetRed = shouldTurnRed ? 1 : 0;
      if (Math.abs(this.colRedProgress[i] - targetRed) > 0.001) {
        return true;
      }
    }
    return false;
  }

  destroy(): void {
    this.bgCanvas.remove();
    this.root.remove();
  }

  /**
   * Toggles or switches the dynamically expanded column without ever interchanging column positions.
   * - Clicking a non-expanded column `idx` expands `idx` to cover the other 3 columns
   *   while the other 3 columns shrink to `SHRUNK_COL_WEIGHT` (15% narrower than 5% = 4.25% of original width)
   *   and the gaps between shrunk columns shrink by 75% (`0.25 * gapPx`).
   * - Clicking the already-expanded column restores all 4 columns to `1.0` and gaps to `1.0`.
   * - No glyph matrix effect is shown during expansion or shrinking.
   */
  private setExpandedColumn(idx: number | null): void {
    if (this.colProgress < 0.98) return;
    const nextIdx = this.expandedColIdx === idx ? null : idx;
    this.expandedColIdx = nextIdx;

    this.startColWeights = [
      this.colWeights[0],
      this.colWeights[1],
      this.colWeights[2],
      this.colWeights[3],
    ];
    this.startGapMultipliers = [
      this.gapMultipliers[0],
      this.gapMultipliers[1],
      this.gapMultipliers[2],
    ];

    this.targetColWeights =
      nextIdx === null
        ? [1, 1, 1, 1]
        : [
            nextIdx === 0 ? EXPANDED_COL_WEIGHT : SHRUNK_COL_WEIGHT,
            nextIdx === 1 ? EXPANDED_COL_WEIGHT : SHRUNK_COL_WEIGHT,
            nextIdx === 2 ? EXPANDED_COL_WEIGHT : SHRUNK_COL_WEIGHT,
            nextIdx === 3 ? EXPANDED_COL_WEIGHT : SHRUNK_COL_WEIGHT,
          ];

    // Reduce the gap between shrunk columns by 75% (to 0.25x normal gap)
    if (nextIdx === null) {
      this.targetGapMultipliers = [1, 1, 1];
    } else {
      this.targetGapMultipliers = [
        nextIdx !== 0 && nextIdx !== 1 ? SHRUNK_GAP_MULTIPLIER : SHRUNK_GAP_MULTIPLIER,
        nextIdx !== 1 && nextIdx !== 2 ? SHRUNK_GAP_MULTIPLIER : SHRUNK_GAP_MULTIPLIER,
        nextIdx !== 2 && nextIdx !== 3 ? SHRUNK_GAP_MULTIPLIER : SHRUNK_GAP_MULTIPLIER,
      ];
    }

    this.expandAnimProgress = 0;

    for (let i = 0; i < 4; i++) {
      const colEl = this.colElements[i];
      colEl.classList.toggle("bp-col--is-expanded", nextIdx === i);
      colEl.classList.toggle("bp-col--is-shrunk", nextIdx !== null && nextIdx !== i);
    }

    this.root.classList.toggle("bp-has-expanded-col", nextIdx !== null);

    if (nextIdx === 3 && this.activeProjectIdx === null) {
      this.setActiveProjectTopic(0, false);
    }

    this.staticDirty = true;
    this.canvasSettled = false;
    this.domSettled = false;
    this.onStateChange?.();
  }

  /**
   * Opens or toggles a clickable project sub-topic inside the expanded PROJECTS column
   * with a smooth accordion transition (and no glyph-matrix wave).
   */
  private setActiveProjectTopic(projIdx: number, toggleIfSame = true): void {
    const nextProj = toggleIfSame && this.activeProjectIdx === projIdx ? null : projIdx;
    this.activeProjectIdx = nextProj;

    const projCol = this.colElements[3];
    if (!projCol) return;

    const items = Array.from(projCol.querySelectorAll<HTMLElement>("[data-bp-project-item]"));
    for (let i = 0; i < items.length; i++) {
      const itemEl = items[i];
      const isOpen = nextProj === i;
      itemEl.classList.toggle("bp-project-item--active", isOpen);
      itemEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    this.onStateChange?.();
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    style.textContent = `
      @font-face {
        font-family: "KanjiBrutalist";
        src: url("data:font/ttf;base64,${KANJI_BRUTALIST_REGULAR_B64}") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: block;
      }
      @font-face {
        font-family: "KanjiBrutalist";
        src: url("data:font/ttf;base64,${KANJI_BRUTALIST_BOLD_B64}") format("truetype");
        font-weight: 700;
        font-style: normal;
        font-display: block;
      }

      .bp-empty-glyph-canvas {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        z-index: 29;
        pointer-events: none;
        display: block;
      }

      .bp-portfolio-root {
        position: fixed;
        top: 0;
        bottom: 0;
        height: 100vh;
        z-index: 30;
        display: block;
        pointer-events: none;
        user-select: text;
        -webkit-user-select: text;
        box-sizing: border-box;
        font-family: "JetBrains Mono", "Geist Mono", "Inter", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: geometricPrecision;
      }

      .bp-portfolio-root.bp-interactive {
        pointer-events: auto;
      }

      .bp-portfolio-root *,
      .bp-portfolio-root *::before,
      .bp-portfolio-root *::after {
        box-sizing: border-box;
      }

      /* Individual brutalist column strip — positioned with exact pixel geometry to eliminate layout reflow */
      .bp-col {
        position: absolute;
        top: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
        min-height: 100vh;
        max-height: 100vh;
        overflow: hidden;
        background: transparent;
        border: none;
        color: var(--bp-fg);
        will-change: left, width;
      }

      .bp-col-inner {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        min-height: 0;
        transform-origin: left center;
        will-change: transform, opacity;
      }

      /* Column 1 (Odd — Vanishing gradient at bottom): Black */
      .bp-col--black {
        --bp-bg: #161515;
        --bp-fg: #f5f3ee;
        --bp-muted: #d4d0c6;
        --bp-faint: rgba(245, 243, 238, 0.74);
        --bp-rule: rgba(245, 243, 238, 0.24);
        --bp-rule-strong: rgba(245, 243, 238, 0.54);
        --bp-accent: #ff6d14;
        --bp-accent-soft: rgba(255, 109, 20, 0.22);
        --bp-halo: 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 8px rgba(22, 21, 21, 0.88);
        --bp-plate: rgba(22, 21, 21, 0.62);
        --bp-card-bg: rgba(34, 32, 31, 0.82);
      }

      /* Column 2 (Even — Vanishing gradient at bottom): Earthy soil brown — no white glow */
      .bp-col--brown {
        --bp-bg: #c0ad93;
        --bp-fg: #14100d;
        --bp-muted: #2c241d;
        --bp-faint: rgba(20, 16, 13, 0.74);
        --bp-rule: rgba(20, 16, 13, 0.26);
        --bp-rule-strong: rgba(20, 16, 13, 0.56);
        --bp-accent: #a82e00;
        --bp-accent-soft: rgba(168, 46, 0, 0.16);
        --bp-halo: none;
        --bp-plate: rgba(192, 173, 147, 0.60);
        --bp-card-bg: rgba(206, 190, 168, 0.78);
      }

      /* Column 3 (Odd — Vanishing gradient at bottom): Industrial grey — uses same orange (#a82e00) as EDUCATION top-left square */
      .bp-col--grey {
        --bp-bg: #9ea0a5;
        --bp-fg: #111317;
        --bp-muted: #242830;
        --bp-faint: rgba(17, 19, 23, 0.74);
        --bp-rule: rgba(17, 19, 23, 0.26);
        --bp-rule-strong: rgba(17, 19, 23, 0.56);
        --bp-accent: #a82e00;
        --bp-accent-soft: rgba(168, 46, 0, 0.15);
        --bp-halo: none;
        --bp-plate: rgba(158, 160, 165, 0.60);
        --bp-card-bg: rgba(175, 178, 184, 0.78);
      }

      /* Column 4 (Even — Vanishing gradient at bottom): Warm white */
      .bp-col--white {
        --bp-bg: #ebe9e4;
        --bp-fg: #121212;
        --bp-muted: #2e2c28;
        --bp-faint: rgba(18, 18, 18, 0.72);
        --bp-rule: rgba(18, 18, 18, 0.24);
        --bp-rule-strong: rgba(18, 18, 18, 0.54);
        --bp-accent: #c83b04;
        --bp-accent-soft: rgba(200, 59, 4, 0.15);
        --bp-halo: 0 1px 2px rgba(255, 255, 255, 0.96), 0 0 8px rgba(235, 233, 228, 0.94);
        --bp-plate: rgba(235, 233, 228, 0.62);
        --bp-card-bg: rgba(245, 243, 239, 0.86);
      }

      .bp-col--brown, .bp-col--brown *,
      .bp-col--grey, .bp-col--grey * {
        text-shadow: none !important;
      }

      /* GPU-accelerated block transition container */
      [data-bp-block] {
        will-change: transform, opacity;
      }

      /* Zone 1: Top Heading Zone — shifted towards the right inside the column */
      .bp-title-zone {
        position: relative;
        height: clamp(144px, 21.5vh, 210px);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 10px clamp(12px, 1.25vw, 22px) 8px 12px;
        border-bottom: 1.5px solid var(--bp-rule-strong);
        overflow: hidden;
        transition: height 0.44s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.25s ease;
      }

      .bp-col--is-expanded .bp-title-zone {
        height: clamp(96px, 13.2vh, 132px);
      }

      .bp-title-zone:hover {
        background: var(--bp-accent-soft);
      }

      .bp-title-corner-dot {
        position: absolute;
        top: 12px;
        left: 12px;
        width: 6px;
        height: 6px;
        background-color: #a82e00;
        pointer-events: none;
      }

      .bp-title-corner-code {
        position: absolute;
        bottom: 10px;
        left: 10px;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        font-size: clamp(9.5px, 0.8vw, 11.5px);
        font-weight: 800;
        letter-spacing: 0.16em;
        color: var(--bp-faint);
        text-shadow: var(--bp-halo);
        text-transform: uppercase;
        white-space: nowrap;
        pointer-events: none;
        user-select: none;
      }

      .bp-col--is-expanded .bp-title-corner-code {
        display: none !important;
      }

      /* Expanded header summary banner (shown inside the title zone when a column is expanded) */
      .bp-expanded-title-banner {
        display: none;
        flex-direction: column;
        justify-content: center;
        gap: 3px;
        margin-left: 26px;
        margin-right: auto;
        padding-right: 16px;
        max-width: 78%;
      }

      .bp-col--is-expanded .bp-expanded-title-banner {
        display: flex;
      }

      .bp-expanded-title-kicker {
        font-size: clamp(9px, 0.74vw, 11px);
        font-weight: 800;
        letter-spacing: 0.15em;
        color: var(--bp-accent);
        text-transform: uppercase;
      }

      .bp-expanded-title-headline {
        font-size: clamp(15px, 1.45vw, 22px);
        font-weight: 800;
        letter-spacing: 0.04em;
        color: var(--bp-fg);
        line-height: 1.14;
      }

      .bp-expanded-title-sub {
        font-size: clamp(10px, 0.84vw, 12.5px);
        font-weight: 700;
        color: var(--bp-muted);
        line-height: 1.28;
      }

      /* Horizontal heading container holding vertical character stacks (top-to-bottom reading), shifted right */
      .bp-heading-horiz {
        margin: 0;
        margin-left: auto;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-end;
        gap: clamp(8px, 0.8vw, 16px);
        font-family: "KanjiBrutalist", "JetBrains Mono", ui-monospace, monospace;
        font-weight: 700;
        color: var(--bp-fg);
        text-shadow: var(--bp-halo);
        text-transform: uppercase;
        text-align: center;
      }

      .bp-col--is-expanded .bp-heading-horiz .bp-vchar {
        font-size: clamp(12.5px, 1.55vh, 17px) !important;
      }

      .bp-vstack {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
      }

      .bp-vchar {
        display: block;
        line-height: 0.93;
        text-align: center;
      }

      .bp-vchar--space {
        height: 0.42em;
      }

      .bp-heading-horiz--identity .bp-vchar {
        font-size: clamp(18px, 2.58vh, 27px);
        line-height: 0.91;
      }

      .bp-heading-horiz--education .bp-vchar {
        font-size: clamp(16px, 2.3vh, 24px);
        line-height: 0.91;
      }

      .bp-heading-horiz--skills .bp-vchar {
        font-size: clamp(23px, 3.4vh, 36px);
        line-height: 0.92;
      }

      .bp-heading-horiz--projects .bp-vchar {
        font-size: clamp(18px, 2.58vh, 27px);
        line-height: 0.91;
      }

      /* Zone 2: Section Label Band (SEC 01 - SEC 04) — subtle orange right-vanishing gradient across all 4 columns */
      .bp-sec-band {
        height: 34px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 clamp(10px, 0.9vw, 14px);
        border-bottom: 1.5px solid var(--bp-rule-strong);
        background: linear-gradient(90deg, var(--bp-accent-soft) 0%, var(--bp-plate) 100%);
        text-shadow: var(--bp-halo);
      }

      .bp-sec-label {
        font-size: clamp(14px, 1.25vw, 18px);
        font-weight: 800;
        letter-spacing: 0.14em;
        color: var(--bp-fg);
        text-transform: uppercase;
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
      }

      .bp-sec-label-kanji {
        font-family: "KanjiBrutalist", "JetBrains Mono", ui-monospace, monospace;
        font-weight: 700;
        font-size: 1.14em;
        letter-spacing: 0.08em;
      }

      .bp-sec-tag {
        font-size: clamp(9.5px, 0.82vw, 11.5px);
        font-weight: 800;
        letter-spacing: 0.14em;
        color: var(--bp-accent);
        text-transform: uppercase;
      }

      /* Zone 3: Brutalist Editorial Content Body */
      .bp-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        text-shadow: var(--bp-halo);
      }

      .bp-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 0;
        overflow-y: auto;
        scrollbar-width: none;
      }
      .bp-content::-webkit-scrollbar {
        display: none;
      }

      .bp-block {
        padding: clamp(8px, 1.15vh, 14px) clamp(10px, 0.95vw, 16px);
        border-bottom: 1px solid var(--bp-rule-strong);
        background: var(--bp-plate);
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .bp-block:last-child {
        border-bottom: none;
      }

      .bp-field-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: clamp(9.5px, 0.8vw, 11.5px);
        font-weight: 800;
        letter-spacing: 0.08em;
        color: var(--bp-muted);
        text-transform: uppercase;
        white-space: nowrap;
      }

      .bp-field-index {
        color: var(--bp-accent);
        font-weight: 800;
      }

      /* Expanded-only detail sections inside columns */
      .bp-expanded-extra {
        display: none;
        opacity: 0;
        transform: translate3d(0, 6px, 0);
        transition: opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1) 0.06s, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1) 0.06s;
      }

      .bp-col--is-expanded .bp-expanded-extra {
        display: flex;
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }

      /* Column 1 (IDENTITY): Unified Subject Name + Full Address + DOB + AGE + Expanded Contact & Internship.
         In default mode:
         - Subtle black background behind all sections is removed (background: transparent).
         - SUBJECT & LOCATION sits at the top without a bottom border.
         - A clear vertical gap separates SUBJECT & LOCATION from DATE OF BIRTH.
         - DATE OF BIRTH sits lower and closer to AGE, bounded closely above and below by two 1px horizontal lines.
         - The lowermost line below AGE is removed. */
      .bp-identity-layout {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        justify-content: space-between;
      }

      .bp-col--black:not(.bp-col--is-expanded):not(.bp-col--is-shrunk) .bp-block {
        background: transparent !important;
      }

      .bp-col--black:not(.bp-col--is-expanded) .bp-merged-identity-block {
        flex: 1.25;
        border-bottom: none !important;
      }

      .bp-col--black:not(.bp-col--is-expanded) .bp-dob-block {
        flex: 0 0 auto;
        margin-top: auto;
        border-top: 1px solid var(--bp-rule-strong) !important;
        border-bottom: 1px solid var(--bp-rule-strong) !important;
        padding: clamp(8px, 1.1vh, 13px) clamp(10px, 0.95vw, 16px) !important;
        gap: 4px !important;
      }

      .bp-col--black:not(.bp-col--is-expanded) .bp-age-block {
        flex: 0.72;
        justify-content: center;
        border-top: none !important;
        border-bottom: none !important;
      }

      /* Neat 12-column bento grid when IDENTITY (NAME) is expanded with ample spacing:
         - Cols 1..5 (Rows 1..2): SUBJECT & LOCATION with West Bengal map between vertical gradient line and PANAGARH
         - Cols 6..12 (Row 1): Enlarged CONTACT CHANNELS box so contacts never overfit
         - Cols 6..8 (Row 2): Compact, subordinate DATE OF BIRTH box
         - Cols 9..12 (Row 2): Compact, subordinate CALENDAR SPAN box
         - Cols 1..12 (Row 3): Full-width EXPERIENCE block */
      .bp-col--is-expanded .bp-identity-layout {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        grid-auto-rows: min-content;
        gap: clamp(16px, 2.2vh, 26px);
        padding: clamp(18px, 2.5vh, 30px) clamp(18px, 1.8vw, 28px);
        align-content: start;
      }

      .bp-col--is-expanded .bp-identity-layout > .bp-block {
        border: 1px solid var(--bp-rule-strong);
        background: var(--bp-card-bg);
      }

      .bp-merged-identity-block {
        flex: 1.25;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 6px;
        min-height: 0;
      }

      .bp-col--is-expanded .bp-merged-identity-block {
        grid-column: 1 / 6;
        grid-row: 1 / 3;
        padding: clamp(18px, 2.4vh, 28px) clamp(18px, 1.6vw, 26px);
        gap: clamp(14px, 1.8vh, 22px);
      }

      .bp-merged-horiz-columns {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;
        gap: clamp(4px, 0.45vw, 10px);
        padding: clamp(4px, 0.6vh, 8px) 2px;
        flex: 1;
        min-height: 0;
      }

      .bp-col--is-expanded .bp-merged-horiz-columns {
        align-items: stretch;
        gap: clamp(8px, 0.75vw, 14px);
        padding: clamp(8px, 1.2vh, 16px) 4px;
      }

      .bp-merged-group {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-around;
        gap: clamp(5px, 0.52vw, 11px);
      }

      .bp-col--is-expanded .bp-merged-group {
        gap: clamp(7px, 0.7vw, 14px);
      }

      .bp-merged-group--location {
        align-items: flex-start;
      }

      /* West Bengal map placed between the vertical gradient line and text PANAGARH,
         centered exactly from top and bottom of the parent box, no background, no boundary border,
         visible ONLY when expanded, and consistent in color across both dark and light mode. */
      .bp-wb-map-wrap {
        display: none;
        align-items: center;
        justify-content: center;
        align-self: center;
        margin-top: auto;
        margin-bottom: auto;
        margin-left: 2px;
        margin-right: 2px;
        width: clamp(36px, 3.2vw, 48px);
        height: clamp(58px, 7.6vh, 78px);
        padding: 0;
        flex-shrink: 0;
        background: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        border-radius: 0;
        pointer-events: none;
      }

      .bp-col--is-expanded .bp-wb-map-wrap {
        display: inline-flex;
      }

      .bp-wb-map-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: center center;
        display: block;
        background: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        filter: none !important;
      }

      .bp-merged-divider {
        width: 1.5px;
        align-self: stretch;
        background: linear-gradient(180deg, var(--bp-rule-strong) 0%, transparent 95%);
        margin: 0 4px;
        flex-shrink: 0;
      }

      /* Subject Name vertical character stacks (SAAYAN | CHOWDHURY) */
      .bp-vstack--subject-kanji .bp-vchar {
        font-family: "KanjiBrutalist", "JetBrains Mono", ui-monospace, monospace;
        font-size: clamp(16px, 2.35vh, 24px);
        font-weight: 700;
        line-height: 1.03;
        color: var(--bp-fg);
      }

      .bp-col--is-expanded .bp-vstack--subject-kanji .bp-vchar {
        font-size: clamp(14.5px, 2.05vh, 21px);
      }

      /* Unified Address + PIN vertical character stacks (PANAGARH, | WEST BENGAL, | INDIA, | 713148) */
      .bp-vstack--location .bp-vchar {
        font-size: clamp(11.5px, 1.75vh, 17px);
        font-weight: 800;
        line-height: 1.02;
        color: var(--bp-fg);
      }

      .bp-vstack--location-muted .bp-vchar {
        font-size: clamp(11.5px, 1.75vh, 17px);
        font-weight: 700;
        line-height: 1.02;
        color: var(--bp-muted);
      }

      .bp-col--is-expanded .bp-vstack--location .bp-vchar,
      .bp-col--is-expanded .bp-vstack--location-muted .bp-vchar {
        font-size: clamp(10.5px, 1.55vh, 15px);
      }

      .bp-primary-value {
        font-size: clamp(15px, 1.32vw, 20px);
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: 0.04em;
        color: var(--bp-fg);
        word-break: break-word;
      }

      /* Subordinate, compact DOB & Calendar Span when IDENTITY is expanded */
      .bp-col--is-expanded .bp-dob-block {
        grid-column: 6 / 9;
        grid-row: 2 / 3;
        padding: clamp(12px, 1.6vh, 18px) clamp(14px, 1.2vw, 20px);
        justify-content: center;
        gap: 6px;
      }

      .bp-col--is-expanded .bp-dob-block .bp-field-meta {
        font-size: clamp(8.5px, 0.7vw, 10px);
      }

      .bp-col--is-expanded .bp-dob-block .bp-primary-value {
        font-size: clamp(11.5px, 0.94vw, 14px);
        letter-spacing: 0.03em;
      }

      /* Dynamic Age 3-cell counter matrix with Japanese Kanji units (年 · 月 · 日) inside IDENTITY column */
      .bp-age-block {
        flex: 0.85;
        justify-content: center;
      }

      .bp-col--is-expanded .bp-age-block {
        grid-column: 9 / 13;
        grid-row: 2 / 3;
        padding: clamp(12px, 1.6vh, 18px) clamp(14px, 1.2vw, 20px);
        justify-content: center;
        gap: 6px;
      }

      .bp-col--is-expanded .bp-age-block .bp-field-meta {
        font-size: clamp(8.5px, 0.7vw, 10px);
      }

      .bp-age-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        border: 1.5px solid var(--bp-rule-strong);
        margin-top: 4px;
        background: rgba(255, 255, 255, 0.05);
      }

      .bp-col--is-expanded .bp-age-grid {
        margin-top: 2px;
        border-width: 1px;
      }

      .bp-age-cell {
        padding: clamp(10px, 1.65vh, 18px) 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-right: 1px solid var(--bp-rule-strong);
        text-align: center;
      }

      .bp-col--is-expanded .bp-age-cell {
        padding: 4px 3px;
        flex-direction: row;
        align-items: baseline;
        gap: 3px;
      }

      .bp-age-cell:last-child {
        border-right: none;
      }

      .bp-age-cell--pulse {
        background-color: var(--bp-accent-soft);
      }

      .bp-age-num {
        font-size: clamp(20px, 1.95vw, 30px);
        font-weight: 800;
        line-height: 1.05;
        letter-spacing: 0.04em;
        font-variant-numeric: tabular-nums;
        color: var(--bp-fg);
      }

      .bp-col--is-expanded .bp-age-num {
        font-size: clamp(13px, 1.05vw, 16px);
      }

      .bp-age-cell--pulse .bp-age-num {
        color: var(--bp-accent);
      }

      .bp-age-unit {
        margin-top: 5px;
        font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP", "Noto Sans JP", "Meiryo", "JetBrains Mono", sans-serif;
        font-size: clamp(14px, 1.2vw, 18px);
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: 0.06em;
        color: var(--bp-fg);
      }

      .bp-col--is-expanded .bp-age-unit {
        margin-top: 0;
        font-size: clamp(10px, 0.82vw, 12px);
      }

      /* Enlarged Contact details grid (visible when IDENTITY is expanded) — prevents text overfitting */
      .bp-contact-block {
        flex-direction: column;
        gap: 12px;
      }

      .bp-col--is-expanded .bp-contact-block {
        grid-column: 6 / 13;
        grid-row: 1 / 2;
        padding: clamp(16px, 2.2vh, 24px) clamp(16px, 1.5vw, 24px);
      }

      .bp-contact-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .bp-contact-card {
        padding: 12px 15px;
        border: 1px solid var(--bp-rule);
        background: rgba(255, 255, 255, 0.035);
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
        min-width: 0;
      }

      .bp-contact-label {
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.12em;
        color: var(--bp-accent);
        text-transform: uppercase;
      }

      .bp-contact-val,
      .bp-contact-link {
        font-size: clamp(11.5px, 0.94vw, 13.8px);
        font-weight: 700;
        color: var(--bp-fg);
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bp-contact-link:hover {
        color: var(--bp-accent);
        text-decoration: underline;
      }

      /* Marquee animation for Email, GitHub, and LinkedIn URLs inside Contact Channels */
      .bp-contact-link--marquee {
        display: block;
        width: 100%;
        overflow: hidden;
        text-overflow: clip;
        mask-image: linear-gradient(90deg, transparent 0%, #000 3%, #000 97%, transparent 100%);
        -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 3%, #000 97%, transparent 100%);
      }

      .bp-contact-marquee-track {
        display: inline-flex;
        align-items: center;
        width: max-content;
        white-space: nowrap;
        will-change: transform;
        animation: bp-contact-marquee 11s linear infinite;
      }

      .bp-contact-link--marquee:hover .bp-contact-marquee-track {
        animation-play-state: paused;
      }

      .bp-contact-marquee-item {
        display: inline-block;
        padding-right: 32px;
      }

      @keyframes bp-contact-marquee {
        0% {
          transform: translate3d(0, 0, 0);
        }
        100% {
          transform: translate3d(-50%, 0, 0);
        }
      }

      /* Experience blocks inside expanded IDENTITY (HCL GUVI + SaiKet Systems) */
      .bp-exp-block {
        grid-column: 1 / -1;
        grid-row: auto;
        flex-direction: column;
        gap: 10px;
        padding: clamp(16px, 2.2vh, 24px) clamp(18px, 1.6vw, 26px);
      }

      .bp-col--black .bp-project-tag {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--bp-rule-strong);
        color: var(--bp-fg);
      }

      .bp-exp-header {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }

      .bp-exp-role {
        font-size: clamp(13px, 1.1vw, 16px);
        font-weight: 800;
        color: var(--bp-fg);
      }

      .bp-exp-grade {
        font-size: clamp(10.5px, 0.88vw, 12.5px);
        font-weight: 800;
        color: var(--bp-accent);
        letter-spacing: 0.06em;
      }

      .bp-exp-bullets {
        margin: 2px 0 0 0;
        padding-left: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: clamp(11px, 0.92vw, 13.5px);
        font-weight: 600;
        line-height: 1.34;
        color: var(--bp-muted);
      }

      /* Column 2: Education entries */
      .bp-edu-list {
        display: flex;
        flex-direction: column;
        flex: 1;
        justify-content: space-between;
      }

      .bp-col--is-expanded .bp-edu-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        padding: 10px;
        align-content: stretch;
      }

      .bp-edu-item {
        flex: 1;
        padding: clamp(8px, 1.1vh, 14px) clamp(12px, 1vw, 16px);
        border-bottom: 1px solid var(--bp-rule-strong);
        background: var(--bp-plate);
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
      }

      .bp-col--is-expanded .bp-edu-item {
        border: 1.5px solid var(--bp-rule-strong);
        background: var(--bp-card-bg);
        padding: clamp(12px, 1.6vh, 20px) clamp(14px, 1.2vw, 22px);
        justify-content: flex-start;
        gap: 8px;
      }

      .bp-edu-item:last-child {
        border-bottom: none;
      }

      .bp-col--is-expanded .bp-edu-item:last-child {
        border-bottom: 1.5px solid var(--bp-rule-strong);
      }

      .bp-edu-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }

      .bp-edu-date {
        font-size: clamp(10px, 0.85vw, 12px);
        font-weight: 800;
        letter-spacing: 0.06em;
        color: var(--bp-muted);
        text-transform: uppercase;
        text-align: left;
        white-space: nowrap;
      }

      .bp-edu-badge {
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.1em;
        padding: 2px 6px;
        border: 1px solid var(--bp-accent);
        color: var(--bp-accent);
        background: var(--bp-accent-soft);
      }

      .bp-edu-school {
        font-size: clamp(13.5px, 1.16vw, 17.5px);
        font-weight: 800;
        line-height: 1.2;
        color: var(--bp-fg);
        letter-spacing: 0.01em;
      }

      .bp-edu-degree {
        font-size: clamp(11.6px, 1vw, 14.5px);
        font-weight: 700;
        line-height: 1.24;
        color: var(--bp-muted);
      }

      .bp-edu-extra {
        flex-direction: column;
        gap: 5px;
        margin-top: 4px;
        padding-top: 6px;
        border-top: 1px dashed var(--bp-rule-strong);
      }

      .bp-edu-focus {
        font-size: clamp(10.5px, 0.86vw, 12.5px);
        font-weight: 800;
        color: var(--bp-accent);
        letter-spacing: 0.04em;
      }

      .bp-edu-desc {
        font-size: clamp(11px, 0.9vw, 13px);
        font-weight: 600;
        line-height: 1.35;
        color: var(--bp-fg);
      }

      /* Column 3: Technical Skills entries */
      .bp-skill-list {
        display: flex;
        flex-direction: column;
        flex: 1;
        justify-content: space-between;
      }

      .bp-col--is-expanded .bp-skill-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        padding: 10px;
        align-content: stretch;
      }

      .bp-skill-item {
        flex: 1;
        padding: clamp(8px, 1.05vh, 13px) clamp(12px, 1vw, 16px);
        border-bottom: 1px solid var(--bp-rule-strong);
        background: var(--bp-plate);
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
      }

      .bp-col--is-expanded .bp-skill-item {
        border: 1.5px solid var(--bp-rule-strong);
        background: var(--bp-card-bg);
        padding: clamp(10px, 1.4vh, 16px) clamp(12px, 1.1vw, 18px);
        justify-content: flex-start;
        gap: 6px;
      }

      .bp-skill-item:last-child {
        border-bottom: none;
      }

      .bp-col--is-expanded .bp-skill-item:last-child {
        border-bottom: 1.5px solid var(--bp-rule-strong);
      }

      .bp-skill-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 6px;
      }

      .bp-skill-cat {
        font-size: clamp(13px, 1.12vw, 16.5px);
        font-weight: 800;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--bp-accent);
      }

      .bp-skill-idx {
        font-size: clamp(10px, 0.85vw, 12px);
        font-weight: 800;
        letter-spacing: 0.1em;
        color: var(--bp-accent);
      }

      .bp-skill-entries {
        font-size: clamp(11.6px, 1vw, 14.8px);
        font-weight: 700;
        line-height: 1.26;
        color: var(--bp-muted);
      }

      .bp-skill-extra {
        flex-direction: column;
        gap: 6px;
        margin-top: 3px;
        padding-top: 6px;
        border-top: 1px dashed var(--bp-rule-strong);
      }

      .bp-skill-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }

      .bp-skill-tag {
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        border: 1px solid var(--bp-rule-strong);
        background: rgba(255, 255, 255, 0.18);
        color: var(--bp-fg);
        text-transform: uppercase;
      }

      .bp-skill-summary {
        font-size: clamp(10.5px, 0.88vw, 12.8px);
        font-weight: 600;
        line-height: 1.32;
        color: var(--bp-fg);
      }

      /* Column 4: PROJECTS — Default shows project headings; Expanded makes sub-topics clickable with smooth animation */
      .bp-project-list {
        display: flex;
        flex-direction: column;
        flex: 1;
        justify-content: space-between;
      }

      .bp-col--is-expanded .bp-project-list {
        justify-content: flex-start;
        gap: 10px;
        padding: 10px;
      }

      .bp-project-item {
        flex: 1;
        padding: clamp(12px, 1.6vh, 22px) clamp(12px, 1.05vw, 18px);
        border-bottom: 1px solid var(--bp-rule-strong);
        background: var(--bp-plate);
        display: flex;
        flex-direction: column;
        justify-content: center;
        transition: background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
      }

      .bp-project-item:last-child {
        border-bottom: none;
      }

      .bp-col--is-expanded .bp-project-item {
        flex: 0 0 auto;
        border: 1.5px solid var(--bp-rule-strong);
        background: var(--bp-card-bg);
        padding: 0;
        overflow: hidden;
      }

      .bp-col--is-expanded .bp-project-item:hover {
        border-color: var(--bp-accent);
      }

      .bp-col--is-expanded .bp-project-item--active {
        border-color: var(--bp-accent);
        box-shadow: inset 4px 0 0 var(--bp-accent);
      }

      .bp-project-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
      }

      .bp-col--is-expanded .bp-project-header-row {
        padding: clamp(11px, 1.45vh, 16px) clamp(14px, 1.2vw, 20px);
      }

      .bp-project-header-row:hover .bp-project-title {
        color: var(--bp-accent);
      }

      .bp-project-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        flex: 1;
      }

      .bp-project-meta-top {
        display: none;
        align-items: center;
        gap: 8px;
      }

      .bp-col--is-expanded .bp-project-meta-top {
        display: inline-flex;
      }

      .bp-project-idx-pill {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        color: var(--bp-accent);
      }

      .bp-project-badge {
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.1em;
        padding: 2px 7px;
        background: var(--bp-accent-soft);
        border: 1px solid var(--bp-accent);
        color: var(--bp-accent);
      }

      .bp-project-title {
        font-size: clamp(14px, 1.22vw, 18.5px);
        font-weight: 800;
        line-height: 1.3;
        letter-spacing: 0.02em;
        color: var(--bp-fg);
        word-break: break-word;
        transition: color 0.2s ease;
      }

      .bp-col--is-expanded .bp-project-title {
        font-size: clamp(15px, 1.32vw, 20px);
      }

      /* Smooth animated sub-topic drawer inside expanded PROJECTS column */
      .bp-project-drawer-grid {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.42s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .bp-col--is-expanded .bp-project-item--active .bp-project-drawer-grid {
        grid-template-rows: 1fr;
      }

      .bp-project-drawer {
        overflow: hidden;
        opacity: 0;
        transform: translate3d(0, -6px, 0);
        transition: opacity 0.34s ease, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .bp-col--is-expanded .bp-project-item--active .bp-project-drawer {
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }

      .bp-project-drawer-inner {
        padding: 0 clamp(14px, 1.2vw, 20px) clamp(12px, 1.5vh, 18px) clamp(14px, 1.2vw, 20px);
        border-top: 1px dashed var(--bp-rule-strong);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .bp-project-subtitle {
        margin-top: 8px;
        font-size: clamp(11.5px, 0.96vw, 14px);
        font-weight: 800;
        color: var(--bp-accent);
        letter-spacing: 0.03em;
      }

      .bp-project-pipeline {
        padding: 6px 10px;
        border-left: 3px solid var(--bp-accent);
        background: rgba(18, 18, 18, 0.06);
        font-size: clamp(10.5px, 0.88vw, 12.8px);
        font-weight: 800;
        letter-spacing: 0.03em;
        color: var(--bp-fg);
      }

      .bp-project-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .bp-project-tag {
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.09em;
        padding: 2px 7px;
        border: 1px solid var(--bp-rule-strong);
        background: rgba(255, 255, 255, 0.45);
        color: var(--bp-fg);
        text-transform: uppercase;
      }

      .bp-project-bullets {
        margin: 2px 0 0 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: clamp(11.5px, 0.96vw, 14px);
        font-weight: 700;
        line-height: 1.38;
        color: var(--bp-muted);
      }

      @media (max-width: 1024px) {
        .bp-title-zone {
          height: clamp(135px, 21vh, 195px);
        }
        .bp-col--is-expanded .bp-identity-layout,
        .bp-col--is-expanded .bp-edu-list,
        .bp-col--is-expanded .bp-skill-list {
          grid-template-columns: 1fr;
        }
        .bp-col--is-expanded .bp-merged-identity-block,
        .bp-col--is-expanded .bp-contact-block,
        .bp-col--is-expanded .bp-dob-block,
        .bp-col--is-expanded .bp-age-block,
        .bp-col--is-expanded .bp-exp-block {
          grid-column: 1 / -1;
          grid-row: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private buildDOM(): HTMLElement {
    const root = document.createElement("section");
    root.className = "bp-portfolio-root";
    root.setAttribute("aria-label", "Portfolio Information Columns");
    root.style.opacity = "0";
    root.style.visibility = "hidden";

    // Stop pointer events inside the columns from triggering canvas splashes
    root.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    root.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    const col1 = this.buildIdentityColumn();
    const col2 = this.buildEducationColumn();
    const col3 = this.buildSkillsColumn();
    const col4 = this.buildProjectsColumn();

    this.colElements = [col1, col2, col3, col4];
    this.colInnerWrappers = this.colElements.map(
      (col) => col.querySelector(".bp-col-inner") as HTMLElement
    );

    for (let i = 0; i < this.colElements.length; i++) {
      const col = this.colElements[i];
      col.addEventListener("click", (e) => {
        e.stopPropagation();
        const target = e.target as HTMLElement | null;
        // Allow links inside expanded columns to work naturally
        if (target?.closest("a")) return;

        // If clicking inside an already-expanded PROJECTS column on a project sub-topic card, toggle that sub-topic
        if (this.expandedColIdx === i && i === 3) {
          const projCard = target?.closest<HTMLElement>("[data-bp-project-item]");
          if (projCard) {
            const pIdx = Number(projCard.getAttribute("data-bp-project-item"));
            if (!Number.isNaN(pIdx)) {
              this.setActiveProjectTopic(pIdx, true);
              return;
            }
          }
        }

        // Otherwise toggle expansion for column `i`
        this.setExpandedColumn(i);
      });
      root.appendChild(col);
    }

    return root;
  }

  /**
   * Column 1 — IDENTITY (Black, Odd -> top-to-bottom expansion, vanishing gradient at bottom)
   * Merges textual content of previous NAME and AGE columns, with unified address + PIN (Panagarh, West Bengal, India, 713148),
   * a small West Bengal map beside PANAGARH (visible only when expanded; white in dark mode, dark in light mode),
   * compact DOB and Calendar Span boxes, and an enlarged Contact Channels box to avoid text overfitting.
   */
  private buildIdentityColumn(): HTMLElement {
    const col = document.createElement("article");
    col.className = "bp-col bp-col--black";
    col.setAttribute("aria-label", "Identity — Section 01");

    col.innerHTML = `
      <div class="bp-col-inner">
        <header class="bp-title-zone" data-bp-block="1">
          <span class="bp-title-corner-dot" aria-hidden="true"></span>
          <span class="bp-title-corner-code" aria-hidden="true">ID // 01</span>
          <div class="bp-expanded-title-banner">
            <span class="bp-expanded-title-kicker">SEC 01 //</span>
            <div class="bp-expanded-title-headline">SAAYAN CHOWDHURY</div>
            <div class="bp-expanded-title-sub">Computer Science &amp; Data Analytics · AI/ML, Edge Vision &amp; Full-Stack Systems</div>
          </div>
          <h2 class="bp-heading-horiz bp-heading-horiz--identity" aria-label="IDENTITY">
            ${buildVerticalCharStackHTML("IDENTITY")}
          </h2>
        </header>
        <div class="bp-sec-band" data-bp-block="1">
          <span class="bp-sec-label"><span class="bp-sec-label-kanji">SEC</span> 01</span>
          <span class="bp-sec-tag">IDENTITY</span>
        </div>
        <div class="bp-body">
          <div class="bp-content">
            <div class="bp-identity-layout">
              <div class="bp-block bp-merged-identity-block" data-bp-block="1">
                <div class="bp-field-meta">
                  <span>SUBJECT &amp; LOCATION</span>
                </div>
                <div class="bp-merged-horiz-columns" role="group" aria-label="SAAYAN CHOWDHURY — PANAGARH WEST BENGAL INDIA 713148">
                  <div class="bp-merged-group" aria-label="SAAYAN CHOWDHURY">
                    ${buildVerticalCharStackHTML("SAAYAN", "bp-vstack--subject-kanji")}
                    ${buildVerticalCharStackHTML("CHOWDHURY", "bp-vstack--subject-kanji")}
                  </div>
                  <span class="bp-merged-divider" aria-hidden="true"></span>
                  ${buildWestBengalMapHTML()}
                  <div class="bp-merged-group bp-merged-group--location" aria-label="PANAGARH WEST BENGAL INDIA 713148">
                    ${buildVerticalCharStackHTML("PANAGARH", "bp-vstack--location")}
                    ${buildVerticalCharStackHTML("WEST BENGAL", "bp-vstack--location")}
                    ${buildVerticalCharStackHTML("INDIA", "bp-vstack--location-muted")}
                    ${buildVerticalCharStackHTML("713148", "bp-vstack--location")}
                  </div>
                </div>
              </div>
              <div class="bp-block bp-dob-block" data-bp-block="1">
                <div class="bp-field-meta">
                  <span>DATE OF BIRTH</span>
                </div>
                <div class="bp-primary-value">18 FEBRUARY 2004</div>
              </div>
              <div class="bp-block bp-age-block" data-bp-block="1">
                <div class="bp-field-meta">
                  <span>AGE</span>
                </div>
                <div class="bp-age-grid" role="group" aria-label="Elapsed years, months, and days">
                  <div class="bp-age-cell bp-age-cell--pulse">
                    <span class="bp-age-num" data-age-part="years">--</span>
                    <span class="bp-age-unit" aria-label="Years">年</span>
                  </div>
                  <div class="bp-age-cell">
                    <span class="bp-age-num" data-age-part="months">--</span>
                    <span class="bp-age-unit" aria-label="Months">月</span>
                  </div>
                  <div class="bp-age-cell">
                    <span class="bp-age-num" data-age-part="days">--</span>
                    <span class="bp-age-unit" aria-label="Days">日</span>
                  </div>
                </div>
              </div>

              <!-- Expanded-only Enlarged Contact Details Block -->
              <div class="bp-block bp-expanded-extra bp-contact-block">
                <div class="bp-field-meta">
                  <span>CONTACT CHANNELS &amp; VERIFIED LINKS</span>
                </div>
                <div class="bp-contact-grid">
                  <div class="bp-contact-card">
                    <span class="bp-contact-label">PHONE</span>
                    <a class="bp-contact-link" href="tel:+918196003077">+91 8196003077</a>
                  </div>
                  <div class="bp-contact-card">
                    <span class="bp-contact-label">EMAIL</span>
                    <a class="bp-contact-link bp-contact-link--marquee" href="mailto:saayanchowdhury2184@gmail.com">
                      <span class="bp-contact-marquee-track">
                        <span class="bp-contact-marquee-item">saayanchowdhury2184@gmail.com</span>
                        <span class="bp-contact-marquee-item" aria-hidden="true">saayanchowdhury2184@gmail.com</span>
                      </span>
                    </a>
                  </div>
                  <div class="bp-contact-card">
                    <span class="bp-contact-label">GITHUB</span>
                    <a class="bp-contact-link bp-contact-link--marquee" href="https://github.com/Saayan-Chowdhury-2004" target="_blank" rel="noopener noreferrer">
                      <span class="bp-contact-marquee-track">
                        <span class="bp-contact-marquee-item">github.com/Saayan-Chowdhury-2004</span>
                        <span class="bp-contact-marquee-item" aria-hidden="true">github.com/Saayan-Chowdhury-2004</span>
                      </span>
                    </a>
                  </div>
                  <div class="bp-contact-card">
                    <span class="bp-contact-label">LINKEDIN</span>
                    <a class="bp-contact-link bp-contact-link--marquee" href="https://www.linkedin.com/in/saayan-chowdhury-pop2004/" target="_blank" rel="noopener noreferrer">
                      <span class="bp-contact-marquee-track">
                        <span class="bp-contact-marquee-item">www.linkedin.com/in/saayan-chowdhury-pop2004/</span>
                        <span class="bp-contact-marquee-item" aria-hidden="true">www.linkedin.com/in/saayan-chowdhury-pop2004/</span>
                      </span>
                    </a>
                  </div>
                </div>
              </div>

              <!-- Expanded-only Experience Block 1: HCL GUVI -->
              <div class="bp-block bp-expanded-extra bp-exp-block">
                <div class="bp-field-meta">
                  <span>EXPERIENCE // VIRTUAL INTERNSHIP</span>
                  <span class="bp-field-index">JUL 2025 – SEP 2025</span>
                </div>
                <div class="bp-exp-header">
                  <span class="bp-exp-role">HCL GUVI — Virtual Intern</span>
                  <span class="bp-exp-grade">90-DAY PROGRAM · A+ GRADE (97/100)</span>
                </div>
                <ul class="bp-exp-bullets">
                  <li>Built an interactive India AQI mapping tool using Python, Pandas, Plotly and Mapbox on PM10 data across Indian cities (2023–2025).</li>
                  <li>Built a reproducible HR data-cleaning pipeline with encoding fixes, deduplication and multi-format (CSV/Excel/JSON) ingestion.</li>
                  <li>Built a modular Python Syntax Checker with batch scanning, a Tkinter GUI, real-time directory monitoring (Watchdog) and automated tests.</li>
                </ul>
              </div>

              <!-- Expanded-only Experience Block 2: SaiKet Systems Machine Learning Internship -->
              <div class="bp-block bp-expanded-extra bp-exp-block">
                <div class="bp-field-meta">
                  <span>EXPERIENCE // MACHINE LEARNING INTERNSHIP</span>
                  <span class="bp-field-index">APR 2025 – MAY 2025</span>
                </div>
                <div class="bp-exp-header">
                  <span class="bp-exp-role">SaiKet Systems — Machine Learning Intern</span>
                </div>
                <div class="bp-project-tags">
                  <span class="bp-project-tag">Scikit-learn</span>
                  <span class="bp-project-tag">XGBoost</span>
                  <span class="bp-project-tag">Imbalanced-learn</span>
                  <span class="bp-project-tag">Matplotlib</span>
                  <span class="bp-project-tag">ML</span>
                  <span class="bp-project-tag">Classification</span>
                  <span class="bp-project-tag">Feature Engineering</span>
                  <span class="bp-project-tag">Hyperparameter Tuning</span>
                </div>
                <ul class="bp-exp-bullets">
                  <li>Developed a telecom customer churn prediction pipeline using Python, Pandas, NumPy, Scikit-learn and XGBoost.</li>
                  <li>Cleaned and preprocessed customer data by handling missing values, encoding categorical variables and scaling numerical features.</li>
                  <li>Trained and tuned Gradient Boosting and XGBoost classifiers using RandomizedSearchCV and analyzed feature importance to identify key churn indicators.</li>
                  <li>Implemented SMOTE for class-imbalance handling and ensemble learning techniques, including soft-voting and stacking classifiers with Logistic Regression as the meta-classifier.</li>
                  <li>Conducted exploratory data analysis and evaluated model performance using accuracy, precision, recall, F1-score, ROC-AUC, confusion matrices and ROC curves.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.yearsValueEl = col.querySelector('[data-age-part="years"]') as HTMLElement;
    this.monthsValueEl = col.querySelector('[data-age-part="months"]') as HTMLElement;
    this.daysValueEl = col.querySelector('[data-age-part="days"]') as HTMLElement;

    return col;
  }

  /**
   * Column 2 — EDUCATION (Earthy Soil Brown, Even -> bottom-to-top expansion, vanishing gradient at bottom)
   */
  private buildEducationColumn(): HTMLElement {
    const col = document.createElement("article");
    col.className = "bp-col bp-col--brown";
    col.setAttribute("aria-label", "Education Qualifications — Section 02");

    const itemsHtml = EDUCATION_ITEMS.map(
      (item) => `
        <div class="bp-edu-item" data-bp-block="1">
          <div class="bp-edu-top">
            <span class="bp-edu-date">${item.dateLabel}</span>
            <span class="bp-expanded-extra bp-edu-badge">${item.statusTag}</span>
          </div>
          <div class="bp-edu-school">${item.institution}</div>
          <div class="bp-edu-degree">${item.qualification}</div>
          <div class="bp-expanded-extra bp-edu-extra">
            <div class="bp-edu-focus">${item.focusAreas}</div>
            <div class="bp-edu-desc">${item.highlights}</div>
          </div>
        </div>
      `
    ).join("");

    col.innerHTML = `
      <div class="bp-col-inner">
        <header class="bp-title-zone" data-bp-block="1">
          <span class="bp-title-corner-dot" aria-hidden="true"></span>
          <span class="bp-title-corner-code" aria-hidden="true">REC // 02</span>
          <div class="bp-expanded-title-banner">
            <span class="bp-expanded-title-kicker">SEC 02 // ACADEMIC CREDENTIALS</span>
            <div class="bp-expanded-title-headline">EDUCATION</div>
            <div class="bp-expanded-title-sub">Dual-track training in Computer Science, Data Analytics &amp; Core Engineering</div>
          </div>
          <h2 class="bp-heading-horiz bp-heading-horiz--education" aria-label="EDUCATION">
            ${buildVerticalCharStackHTML("EDUCATION")}
          </h2>
        </header>
        <div class="bp-sec-band" data-bp-block="1">
          <span class="bp-sec-label"><span class="bp-sec-label-kanji">SEC</span> 02</span>
          <span class="bp-sec-tag">CREDENTIALS</span>
        </div>
        <div class="bp-body">
          <div class="bp-content">
            <div class="bp-edu-list">
              ${itemsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
    return col;
  }

  /**
   * Column 3 — TECH SKILLS (Industrial Grey, Odd -> top-to-bottom expansion, vanishing gradient at bottom)
   */
  private buildSkillsColumn(): HTMLElement {
    const col = document.createElement("article");
    col.className = "bp-col bp-col--grey";
    col.setAttribute("aria-label", "Technical Skills — Section 03");

    const skillsHtml = SKILL_CATEGORIES.map(
      (sk) => `
        <div class="bp-skill-item" data-bp-block="1">
          <div class="bp-skill-head">
            <span class="bp-skill-cat">${sk.category}</span>
          </div>
          <div class="bp-skill-entries">${sk.items}</div>
          <div class="bp-expanded-extra bp-skill-extra">
            <div class="bp-skill-tags">
              ${sk.tags.map((t) => `<span class="bp-skill-tag">${t}</span>`).join("")}
            </div>
            <div class="bp-skill-summary">${sk.expandedSummary}</div>
          </div>
        </div>
      `
    ).join("");

    col.innerHTML = `
      <div class="bp-col-inner">
        <header class="bp-title-zone" data-bp-block="1">
          <span class="bp-title-corner-dot" aria-hidden="true"></span>
          <span class="bp-title-corner-code" aria-hidden="true">SYS // 03</span>
          <div class="bp-expanded-title-banner">
            <span class="bp-expanded-title-kicker">SEC 03 // TECHNICAL STACK &amp; TOOLCHAINS</span>
            <div class="bp-expanded-title-headline">TECHNICAL SKILLS</div>
            <div class="bp-expanded-title-sub">End-to-end proficiency across AI/ML, Edge Vision, Vector RAG &amp; Backend Engineering</div>
          </div>
          <h2 class="bp-heading-horiz bp-heading-horiz--skills" aria-label="TECH SKILLS">
            ${buildVerticalCharStackHTML("TECH")}
            ${buildVerticalCharStackHTML("SKILLS")}
          </h2>
        </header>
        <div class="bp-sec-band" data-bp-block="1">
          <span class="bp-sec-label"><span class="bp-sec-label-kanji">SEC</span> 03</span>
          <span class="bp-sec-tag">CAPABILITIES</span>
        </div>
        <div class="bp-body">
          <div class="bp-content">
            <div class="bp-skill-list">
              ${skillsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
    return col;
  }

  /**
   * Column 4 — PROJECTS (Warm White, Even -> bottom-to-top expansion, vanishing gradient at bottom)
   * In default 4-column view, features only the project headings/names.
   * When expanded, makes each project sub-topic clickable with a smooth animated drawer revealing architecture & details.
   */
  private buildProjectsColumn(): HTMLElement {
    const col = document.createElement("article");
    col.className = "bp-col bp-col--white";
    col.setAttribute("aria-label", "Projects — Section 04");

    const projectsHtml = PROJECT_TOPICS.map((proj, idx) => {
      const isInitialOpen = idx === 0;
      return `
        <div class="bp-project-item ${isInitialOpen ? "bp-project-item--active" : ""}" data-bp-block="1" data-bp-project-item="${idx}" role="button" tabindex="0" aria-expanded="${isInitialOpen ? "true" : "false"}">
          <div class="bp-project-header-row">
            <div class="bp-project-title-wrap">
              <div class="bp-project-meta-top">
                <span class="bp-project-idx-pill">PRJ // ${proj.index}</span>
                <span class="bp-project-badge">${proj.badge}</span>
              </div>
              <div class="bp-project-title">${proj.heading}</div>
            </div>
          </div>
          <div class="bp-project-drawer-grid">
            <div class="bp-project-drawer">
              <div class="bp-project-drawer-inner">
                <div class="bp-project-subtitle">${proj.subtitle}</div>
                <div class="bp-project-pipeline">PIPELINE // ${proj.pipeline}</div>
                <div class="bp-project-tags">
                  ${proj.techStack.map((tag) => `<span class="bp-project-tag">${tag}</span>`).join("")}
                </div>
                <ul class="bp-project-bullets">
                  ${proj.bullets.map((b) => `<li>${b}</li>`).join("")}
                </ul>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    col.innerHTML = `
      <div class="bp-col-inner">
        <header class="bp-title-zone" data-bp-block="1">
          <span class="bp-title-corner-dot" aria-hidden="true"></span>
          <span class="bp-title-corner-code" aria-hidden="true">PRJ // 04</span>
          <div class="bp-expanded-title-banner">
            <span class="bp-expanded-title-kicker">SEC 04 // ENGINEERING SYSTEMS &amp; ACHIEVEMENTS</span>
            <div class="bp-expanded-title-headline">FEATURED PROJECTS</div>
          </div>
          <h2 class="bp-heading-horiz bp-heading-horiz--projects" aria-label="PROJECTS">
            ${buildVerticalCharStackHTML("PROJECTS")}
          </h2>
        </header>
        <div class="bp-sec-band" data-bp-block="1">
          <span class="bp-sec-label"><span class="bp-sec-label-kanji">SEC</span> 04</span>
          <span class="bp-sec-tag">PROJECTS</span>
        </div>
        <div class="bp-body">
          <div class="bp-content">
            <div class="bp-project-list">
              ${projectsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
    return col;
  }

  /**
   * Registers the structural blocks inside each column for GPU-accelerated staggered text appearance
   * strictly after the empty-glyph columns finish their initial formation.
   */
  private collectAnimatedBlocks(): void {
    this.animBlocks = [];
    for (let colIdx = 0; colIdx < this.colElements.length; colIdx++) {
      const col = this.colElements[colIdx];
      const isOdd = COLUMN_PALETTES[colIdx].isOdd;
      const blocks = Array.from(col.querySelectorAll<HTMLElement>("[data-bp-block='1']"));
      const count = Math.max(1, blocks.length);
      for (let idx = 0; idx < blocks.length; idx++) {
        const norm = count > 1 ? idx / (count - 1) : 0;
        const orderRatio = isOdd ? norm : 1 - norm;
        this.animBlocks.push({
          el: blocks[idx],
          colIdx,
          orderRatio,
        });
      }
    }
  }

  private updateAgeDOM(now: Date): void {
    const sec = now.getSeconds();
    if (sec === this.lastSecond) return;
    this.lastSecond = sec;

    const { years, months, days } = computeDynamicAgeBreakdown(now);

    this.yearsValueEl.textContent = pad2(years);
    this.monthsValueEl.textContent = pad2(months);
    this.daysValueEl.textContent = pad2(days);
  }

  /**
   * Computes exact left offsets and widths for each of the 4 columns in their fixed order (0, 1, 2, 3)
   * based on `this.colWeights` and `this.gapMultipliers`.
   */
  private updateColumnGeometry(): void {
    const {
      canvasW: viewportW,
      cachedLeftPx: leftPx,
      cachedRightClearance: rightClearance,
      cachedGapPx: gapPx,
    } = this;

    const totalAvailW = Math.max(240, viewportW - leftPx - rightClearance);
    const defaultColsW = Math.max(120, totalAvailW - gapPx * 3);
    this.baseColWidth = defaultColsW / 4;

    const shrunkGapsSum = gapPx * 3 * SHRUNK_GAP_MULTIPLIER;
    const expandedTotalColsW = Math.max(120, totalAvailW - shrunkGapsSum);
    this.maxExpandedColWidth = (EXPANDED_COL_WEIGHT / 4) * expandedTotalColsW;

    const g0 = gapPx * this.gapMultipliers[0];
    const g1 = gapPx * this.gapMultipliers[1];
    const g2 = gapPx * this.gapMultipliers[2];
    const currentGapsSum = g0 + g1 + g2;
    const currentColsAvailW = Math.max(120, totalAvailW - currentGapsSum);

    const wSum =
      this.colWeights[0] + this.colWeights[1] + this.colWeights[2] + this.colWeights[3] || 4;

    const gaps = [g0, g1, g2, 0];
    let cursorLeft = leftPx;
    for (let i = 0; i < 4; i++) {
      const wPx = (this.colWeights[i] / wSum) * currentColsAvailW;
      this.colLefts[i] = cursorLeft;
      this.colWidths[i] = wPx;
      cursorLeft += wPx + gaps[i];

      const colEl = this.colElements[i];
      if (colEl) {
        colEl.style.left = `${(this.colLefts[i] - leftPx).toFixed(2)}px`;
        colEl.style.width = `${wPx.toFixed(2)}px`;
      }
    }
  }

  /**
   * Draws a single column's empty-glyph cells onto `targetCtx` within `[cLeft, cLeft + cWidth]`
   * using the specified `pal` (`COLUMN_PALETTES[colIdx]` or `SHRUNK_RED_PALETTE`).
   */
  private drawColumnEmptyGlyphCellsWithPalette(
    targetCtx: CanvasRenderingContext2D,
    pal: ColumnPalette,
    seedIdx: number,
    cLeft: number,
    cWidth: number,
    viewportH: number,
    cellW: number,
    cellH: number
  ): void {
    const cRight = cLeft + cWidth;
    if (cWidth <= 0.4) return;

    const cStart = Math.floor(cLeft / cellW);
    const cEnd = Math.max(cStart, Math.ceil(cRight / cellW) - 1);
    const rows = Math.max(1, Math.ceil(viewportH / cellH));

    for (let r = 0; r < rows; r++) {
      const u = rows > 1 ? r / (rows - 1) : 0.5;
      const gradAlpha = computeColumnGradientAlpha(u, pal.isOdd);
      if (gradAlpha <= 0.01) continue;

      const ty = r * cellH;
      const distFromVanish = 1 - u;

      for (let c = cStart; c <= cEnd; c++) {
        const hCell = hash3(c, r, 19 + seedIdx * 7);
        if (distFromVanish < 0.12 && hCell * 0.14 > distFromVanish) {
          continue;
        }

        const tx = Math.max(cLeft, c * cellW);
        const nextTx = Math.min(cRight, (c + 1) * cellW);
        const tileW = nextTx - tx;
        if (tileW <= 0.35) continue;

        const fillW = Math.min(cRight - tx, tileW + 0.45);
        const fillH = distFromVanish < 0.14 ? cellH - 0.35 : cellH + 0.45;

        const cellToneShift = (hCell - 0.5) * 5;
        const cr = clamp(Math.round(pal.r + cellToneShift), 0, 255);
        const cg = clamp(Math.round(pal.g + cellToneShift), 0, 255);
        const cb = clamp(Math.round(pal.b + cellToneShift), 0, 255);

        targetCtx.fillStyle = `rgba(${cr},${cg},${cb},${gradAlpha.toFixed(3)})`;
        targetCtx.fillRect(tx, ty, fillW, fillH);

        if (tileW > 3 && cellH > 4) {
          targetCtx.strokeStyle = `rgba(${pal.seamR},${pal.seamG},${pal.seamB},${(gradAlpha * 0.22).toFixed(3)})`;
          targetCtx.lineWidth = 0.55;
          targetCtx.strokeRect(tx + 0.5, ty + 0.5, Math.max(1, tileW - 1), Math.max(1, cellH - 1));
        }
      }
    }
  }

  /**
   * Pre-renders 5 full-height empty-glyph column strips onto `this.stripAtlasCanvas` ONCE per viewport resize:
   * - Strips 0..3: the 4 column palettes (`Black`, `Brown`, `Grey`, `White`), each wide enough to cover `maxExpandedColWidth`.
   * - Strip 4: the `SHRUNK_RED_PALETTE` strip used when `IDENTITY` shrinks in dark mode or `PROJECTS` shrinks in light mode.
   * This allows dynamic expansion/shrinking to blit each column in 1 GPU `drawImage` call per frame!
   */
  private rebuildStripAtlas(): void {
    const {
      canvasW: viewportW,
      canvasH: viewportH,
      canvasDpr: dpr,
      cachedCw: cw,
      cachedCh: ch,
    } = this;

    if (viewportW < 1 || viewportH < 1) return;

    this.updateColumnGeometry();

    const cellW = Math.max(3.5, cw);
    const cellH = Math.max(4.5, ch);
    const stripW = Math.ceil((this.maxExpandedColWidth + cellW * 4) / cellW) * cellW;
    this.atlasStripWidthPx = Math.max(64, stripW);

    this.stripAtlasCanvas.width = Math.round(this.atlasStripWidthPx * 5 * dpr);
    this.stripAtlasCanvas.height = Math.round(viewportH * dpr);

    const aCtx = this.stripAtlasCtx;
    aCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    aCtx.clearRect(0, 0, this.atlasStripWidthPx * 5, viewportH);

    for (let colIdx = 0; colIdx < 4; colIdx++) {
      this.drawColumnEmptyGlyphCellsWithPalette(
        aCtx,
        COLUMN_PALETTES[colIdx],
        colIdx,
        colIdx * this.atlasStripWidthPx,
        this.atlasStripWidthPx - cellW,
        viewportH,
        cellW,
        cellH
      );
    }

    // Strip 4: Crimson Red strip for shrunk NAME (dark mode) / shrunk PROJECTS (light mode)
    this.drawColumnEmptyGlyphCellsWithPalette(
      aCtx,
      SHRUNK_RED_PALETTE,
      4,
      4 * this.atlasStripWidthPx,
      Math.max(cellW * 12, this.baseColWidth),
      viewportH,
      cellW,
      cellH
    );

    this.atlasDirty = false;
  }

  /**
   * Computes [0..1] red blend factor for column `colIdx`:
   * - In dark mode (`!this.lastLightMode`), shrunk `NAME` (`IDENTITY`, `colIdx === 0`) turns red.
   * - In light mode (`this.lastLightMode === true`), shrunk `PROJECTS` (`colIdx === 3`) turns red.
   */
  private getShrunkRedBlend(colIdx: number): number {
    // Intensity of the red color that shrunk NAME and PROJECTS columns gradually take is capped at 80% (0.80)
    return 0.8 * smoothstep(0.0, 1.0, this.colRedProgress[colIdx]);
  }

  /**
   * Blits column `colIdx` at `[cLeft, cLeft + cWidth]` onto `targetCtx` using the pre-rendered
   * `this.stripAtlasCanvas` (plus the red overlay capped at 80% intensity if shrunk in dark/light mode).
   */
  private blitColumnFromAtlas(
    targetCtx: CanvasRenderingContext2D,
    colIdx: number,
    cLeft: number,
    cWidth: number
  ): void {
    if (cWidth <= 0.4) return;
    const dpr = this.canvasDpr;
    const stripLeftPx = colIdx * this.atlasStripWidthPx;
    const sx = Math.round(stripLeftPx * dpr);
    const sw = Math.max(1, Math.min(Math.round(this.atlasStripWidthPx * dpr), Math.round(cWidth * dpr)));
    const sh = this.stripAtlasCanvas.height;
    const dx = Math.round(cLeft * dpr);
    const dw = Math.max(1, Math.round(cWidth * dpr));
    const dh = this.bgCanvas.height;

    const redBlend = this.getShrunkRedBlend(colIdx);

    targetCtx.save();
    targetCtx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw base column strip at full cell opacity, then blend the red strip up to 80% intensity on top
    targetCtx.globalAlpha = 1;
    targetCtx.drawImage(this.stripAtlasCanvas, sx, 0, sw, sh, dx, 0, dw, dh);

    if (redBlend > 0.001) {
      const redSx = Math.round(4 * this.atlasStripWidthPx * dpr);
      targetCtx.globalCompositeOperation = "source-atop";
      targetCtx.globalAlpha = redBlend;
      targetCtx.drawImage(this.stripAtlasCanvas, redSx, 0, sw, sh, dx, 0, dw, dh);
    }

    targetCtx.restore();
  }

  /**
   * Rebuilds `this.staticColsCanvas` from the strip atlas when layout settles.
   */
  private rebuildStaticColumnsBuffer(): void {
    const { canvasW: viewportW, canvasH: viewportH, canvasDpr: dpr } = this;
    if (viewportW < 1 || viewportH < 1) return;

    if (this.atlasDirty) {
      this.rebuildStripAtlas();
    }

    this.staticColsCanvas.width = Math.round(viewportW * dpr);
    this.staticColsCanvas.height = Math.round(viewportH * dpr);

    const sCtx = this.staticColsCtx;
    sCtx.setTransform(1, 0, 0, 1, 0, 0);
    sCtx.clearRect(0, 0, this.staticColsCanvas.width, this.staticColsCanvas.height);

    this.updateColumnGeometry();

    for (let colIdx = 0; colIdx < 4; colIdx++) {
      this.blitColumnFromAtlas(sCtx, colIdx, this.colLefts[colIdx], this.colWidths[colIdx]);
    }

    this.staticDirty = false;
  }

  /**
   * Renders the empty-glyph columns onto `this.bgCanvas`:
   * - During initial formation (`colProgress < 1`): Odd columns expand top-to-bottom, Even columns expand bottom-to-top.
   * - During dynamic column expansion/shrinking (`colProgress >= 1`): Blits each column in 1 GPU `drawImage` call
   *   from `this.stripAtlasCanvas` with ZERO glyph-matrix effect and smooth red color transition on shrunk NAME/PROJECTS.
   */
  private renderColumnsCanvas(time: number): void {
    const {
      canvasW: viewportW,
      canvasH: viewportH,
      canvasDpr: dpr,
      cachedCw: cw,
      cachedCh: ch,
      colProgress,
      textProgress,
    } = this;

    const ctx = this.bgCtx;

    if (colProgress <= 0.001) {
      if (!this.canvasSettled) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewportW, viewportH);
        this.canvasSettled = true;
      }
      return;
    }

    if (this.atlasDirty) {
      this.rebuildStripAtlas();
    }

    const isLight = Boolean(this.lastLightMode);
    let redTransitionActive = false;
    for (let i = 0; i < 4; i++) {
      const isColShrunk = this.expandedColIdx !== null && this.expandedColIdx !== i;
      const shouldTurnRed = isColShrunk && ((!isLight && i === 0) || (isLight && i === 3));
      const targetRed = shouldTurnRed ? 1 : 0;
      if (Math.abs(this.colRedProgress[i] - targetRed) > 0.001) {
        redTransitionActive = true;
        break;
      }
    }
    const dynamicActive = this.expandAnimProgress < 0.999 || redTransitionActive;

    // When initial formation, text reveal, and dynamic column transitions are all settled, blit static buffer once
    if (colProgress >= 0.999 && textProgress >= 0.999 && !dynamicActive) {
      if (this.staticDirty) {
        this.rebuildStaticColumnsBuffer();
      }
      if (!this.canvasSettled) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        ctx.drawImage(this.staticColsCanvas, 0, 0);
        this.canvasSettled = true;
      }
      return;
    }

    if (colProgress < 0.999 && this.staticDirty) {
      this.rebuildStaticColumnsBuffer();
    }

    this.canvasSettled = false;

    // Fast path for dynamic column expansion/shrinking (colProgress >= 1 && textProgress >= 1):
    // 4 GPU drawImage blits from stripAtlasCanvas, zero glyph matrix effect!
    if (colProgress >= 0.999 && textProgress >= 0.999) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
      for (let colIdx = 0; colIdx < 4; colIdx++) {
        this.blitColumnFromAtlas(ctx, colIdx, this.colLefts[colIdx], this.colWidths[colIdx]);
      }
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportW, viewportH);

    const cellW = Math.max(3.5, cw);
    const cellH = Math.max(4.5, ch);
    const rows = Math.max(1, Math.ceil(viewportH / cellH));
    const microGap = 0.35;
    const glyphFillW = Math.max(2, cellW - microGap);
    const glyphFillH = Math.max(2, cellH - microGap);
    const easeCol = smoothstep(0, 1, colProgress);
    const tDiscrete = Math.floor(time * 18);
    const frontBandRows = 7;

    ctx.font = `700 ${Math.max(8, Math.round(cellH * 0.72))}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let colIdx = 0; colIdx < 4; colIdx++) {
      const pal = COLUMN_PALETTES[colIdx];
      const cLeft = this.colLefts[colIdx];
      const cWidth = this.colWidths[colIdx];
      const cRight = cLeft + cWidth;
      const cStart = Math.floor(cLeft / cellW);
      const cEnd = Math.max(cStart, Math.ceil(cRight / cellW) - 1);

      if (colProgress >= 0.999) {
        this.blitColumnFromAtlas(ctx, colIdx, cLeft, cWidth);
      } else {
        // Initial column formation animation:
        // Odd columns (colIdx 0, 2): Top -> Bottom expansion
        // Even columns (colIdx 1, 3): Bottom -> Top expansion
        const totalSpanRows = rows + frontBandRows;
        const currentFrontRow = easeCol * totalSpanRows;
        const solidRowCount = Math.max(0, Math.floor(currentFrontRow - frontBandRows));

        if (solidRowCount > 0) {
          const sx = Math.max(0, Math.floor(cLeft * dpr));
          const sw = Math.min(this.staticColsCanvas.width - sx, Math.ceil(cWidth * dpr));
          const solidPxH = Math.min(viewportH, solidRowCount * cellH);
          const sy = pal.isOdd ? 0 : Math.max(0, Math.round((viewportH - solidPxH) * dpr));
          const sh = Math.min(this.staticColsCanvas.height - sy, Math.round(solidPxH * dpr));
          if (sw > 0 && sh > 0) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(this.staticColsCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
            ctx.restore();
          }
        }

        const bandStartStep = Math.max(0, solidRowCount);
        const bandEndStep = Math.min(rows - 1, Math.ceil(currentFrontRow + 2));

        for (let stepR = bandStartStep; stepR <= bandEndStep; stepR++) {
          const r = pal.isOdd ? stepR : rows - 1 - stepR;
          if (r < 0 || r >= rows) continue;

          const u = rows > 1 ? r / (rows - 1) : 0.5;
          const gradAlpha = computeColumnGradientAlpha(u, pal.isOdd);
          if (gradAlpha <= 0.01) continue;

          const ty = r * cellH;

          for (let c = cStart; c <= cEnd; c++) {
            const colHash = hash3(c, colIdx, 37);
            const cellLead = currentFrontRow - stepR - colHash * 2.8;
            if (cellLead <= 0) continue;

            const cellP = clamp01(cellLead / frontBandRows);
            const tx = Math.max(cLeft, c * cellW);
            const tileW = Math.min(glyphFillW, cRight - tx);
            if (tileW <= 0.5) continue;

            const cellAlpha = gradAlpha * smoothstep(0, 0.65, cellP);
            ctx.fillStyle = `rgba(${pal.r},${pal.g},${pal.b},${cellAlpha.toFixed(3)})`;
            ctx.fillRect(tx, ty, Math.min(cRight - tx, tileW + 0.45), glyphFillH + 0.45);

            if (cellP < 0.92) {
              const glyphEnv = Math.sin((cellP / 0.92) * Math.PI);
              const gIdx = (c * 5 + r * 7 + tDiscrete + colIdx * 3) % ADDITIONAL_ANIM_GLYPHS.length;
              const isAccent = hash3(c, r, 83 + colIdx) > 0.72;
              if (isAccent) {
                ctx.fillStyle = pal.accentHex;
              } else {
                ctx.fillStyle = `rgba(${pal.glyphR},${pal.glyphG},${pal.glyphB},${(glyphEnv * 0.85).toFixed(3)})`;
              }
              ctx.fillText(ADDITIONAL_ANIM_GLYPHS[gIdx], tx + tileW * 0.5, ty + glyphFillH * 0.5 + 0.5);
            }
          }
        }
      }

      // During Stage 2 of initial formation (Text Formation, after colProgress === 1.0), sweep a crisp
      // additional-glyph deciphering shimmer wave across the column as the text blocks lock into place
      if (colProgress >= 0.999 && textProgress > 0.001 && textProgress < 0.995) {
        const textWaveFront = textProgress * (rows + 6);
        const wStart = Math.max(0, Math.floor(textWaveFront - 4));
        const wEnd = Math.min(rows - 1, Math.ceil(textWaveFront + 1));

        for (let stepR = wStart; stepR <= wEnd; stepR++) {
          const r = pal.isOdd ? stepR : rows - 1 - stepR;
          if (r < 0 || r >= rows) continue;

          const dist = Math.abs(stepR - textWaveFront);
          const env = Math.max(0, 1 - dist / 4.5);
          if (env <= 0.05) continue;

          const ty = r * cellH;
          for (let c = cStart; c <= cEnd; c++) {
            if (hash3(c, r, 131 + tDiscrete) > 0.42) continue;
            const tx = Math.max(cLeft, c * cellW);
            const tileW = Math.min(glyphFillW, cRight - tx);
            const gIdx = (c * 3 + r * 5 + tDiscrete) % ADDITIONAL_ANIM_GLYPHS.length;
            ctx.fillStyle = `rgba(${pal.glyphR},${pal.glyphG},${pal.glyphB},${(env * 0.36).toFixed(3)})`;
            ctx.fillText(ADDITIONAL_ANIM_GLYPHS[gIdx], tx + tileW * 0.5, ty + glyphFillH * 0.5 + 0.5);
          }
        }
      }
    }
  }

  /**
   * Advances the two-stage initial column & text animation as well as the C2-eased dynamic
   * column expansion/shrinking, 75% gap reduction, shrunk red color transition, and text disappearance.
   */
  update(
    portraitTarget: boolean,
    isLightMode: boolean,
    viewportW: number,
    viewportH: number,
    portraitRightPx: number,
    _portraitBottomPx: number,
    cw = 8,
    ch = 12,
    dt = 1 / 60,
    time = 0
  ): void {
    if (this.lastLightMode !== isLightMode) {
      this.lastLightMode = isLightMode;
      this.root.classList.toggle("bp-theme-light", isLightMode);
      // Redraw static columns buffer if a column is currently shrunk so NAME/PROJECTS red state updates for the new theme
      if (this.expandedColIdx !== null) {
        this.staticDirty = true;
        this.canvasSettled = false;
      }
    }

    // Reset expanded state if the profile view is closed
    if (!portraitTarget && this.expandedColIdx !== null) {
      this.expandedColIdx = null;
      this.colWeights = [1, 1, 1, 1];
      this.startColWeights = [1, 1, 1, 1];
      this.targetColWeights = [1, 1, 1, 1];
      this.gapMultipliers = [1, 1, 1];
      this.startGapMultipliers = [1, 1, 1];
      this.targetGapMultipliers = [1, 1, 1];
      this.colRedProgress = [0, 0, 0, 0];
      this.expandAnimProgress = 1;
      for (const colEl of this.colElements) {
        colEl.classList.remove("bp-col--is-expanded", "bp-col--is-shrunk");
      }
      this.root.classList.remove("bp-has-expanded-col");
      this.staticDirty = true;
      this.canvasSettled = false;
    }

    this.targetOpen = portraitTarget;

    // Advance the two-stage initial formation state machine:
    if (this.targetOpen) {
      if (this.colProgress < 1) {
        this.colProgress = Math.min(1, this.colProgress + dt / this.colExpandDuration);
        this.textProgress = 0;
      } else if (this.textProgress < 1) {
        this.textProgress = Math.min(1, this.textProgress + dt / this.textRevealDuration);
      }
    } else {
      if (this.textProgress > 0) {
        this.textProgress = Math.max(0, this.textProgress - dt / (this.textRevealDuration * 0.55));
      } else if (this.colProgress > 0) {
        this.colProgress = Math.max(0, this.colProgress - dt / (this.colExpandDuration * 0.72));
      }
    }

    // Advance C2 quintic eased column expansion & shrinking
    let weightsChanged = false;
    if (this.expandAnimProgress < 1) {
      this.expandAnimProgress = Math.min(1, this.expandAnimProgress + dt / this.expandAnimDuration);
      const ease = easeColumnTransition(this.expandAnimProgress);
      for (let i = 0; i < 4; i++) {
        this.colWeights[i] =
          this.startColWeights[i] + (this.targetColWeights[i] - this.startColWeights[i]) * ease;
      }
      for (let g = 0; g < 3; g++) {
        this.gapMultipliers[g] =
          this.startGapMultipliers[g] +
          (this.targetGapMultipliers[g] - this.startGapMultipliers[g]) * ease;
      }
      weightsChanged = true;
    }

    // Advance 5-second slow red color transition for shrunk NAME (dark mode) & shrunk PROJECTS (light mode)
    let redChanged = false;
    for (let i = 0; i < 4; i++) {
      const isColShrunk = this.expandedColIdx !== null && this.expandedColIdx !== i;
      const shouldTurnRed = isColShrunk && ((!isLightMode && i === 0) || (isLightMode && i === 3));
      if (shouldTurnRed) {
        if (this.colRedProgress[i] < 1) {
          this.colRedProgress[i] = Math.min(1, this.colRedProgress[i] + dt / this.shrunkRedDuration);
          redChanged = true;
        }
      } else {
        if (this.colRedProgress[i] > 0) {
          this.colRedProgress[i] = Math.max(0, this.colRedProgress[i] - dt / this.expandAnimDuration);
          redChanged = true;
        }
      }
    }
    if (redChanged) {
      this.staticDirty = true;
      this.canvasSettled = false;
    }

    if (this.colProgress > 0.005) {
      this.updateAgeDOM(new Date());
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isNarrow = viewportW < 820;
    const leftPx = isNarrow
      ? 10
      : Math.max(portraitRightPx + 14, Math.round(viewportW * 0.39));
    const rightClearance = 74;
    const gapPx = Math.min(14, Math.max(8, Math.round(viewportW * 0.0085)));

    const geomDirty =
      this.canvasW !== viewportW ||
      this.canvasH !== viewportH ||
      this.canvasDpr !== dpr ||
      this.cachedLeftPx !== leftPx ||
      this.cachedGapPx !== gapPx ||
      this.cachedCw !== cw ||
      this.cachedCh !== ch;

    if (geomDirty) {
      this.canvasW = viewportW;
      this.canvasH = viewportH;
      this.canvasDpr = dpr;
      this.cachedLeftPx = leftPx;
      this.cachedRightClearance = rightClearance;
      this.cachedGapPx = gapPx;
      this.cachedCw = cw;
      this.cachedCh = ch;

      this.bgCanvas.width = Math.round(viewportW * dpr);
      this.bgCanvas.height = Math.round(viewportH * dpr);
      this.atlasDirty = true;
      this.staticDirty = true;
      this.canvasSettled = false;

      this.root.style.left = `${leftPx}px`;
      this.root.style.right = `${rightClearance}px`;
      this.root.style.top = "0px";
      this.root.style.bottom = "0px";
      this.root.style.height = `${viewportH}px`;
    }

    if (geomDirty || weightsChanged) {
      this.updateColumnGeometry();
      this.staticDirty = true;
      this.canvasSettled = false;
    }

    this.renderColumnsCanvas(time);

    // Strictly hide all text until the glyph columns have completely taken form (colProgress >= 1)
    if (this.colProgress < 0.999 || this.textProgress <= 0.002) {
      if (this.root.style.visibility !== "hidden") {
        this.root.style.opacity = "0";
        this.root.style.visibility = "hidden";
        this.root.classList.remove("bp-interactive");
      }
      this.domSettled = false;
      return;
    }

    this.root.style.visibility = "visible";
    this.root.style.opacity = "1";
    this.root.classList.toggle("bp-interactive", this.textProgress > 0.3);

    // Lock each column's inner wrapper width to prevent mid-frame text reflows and smoothly scale/fade on the GPU
    for (let i = 0; i < 4; i++) {
      const inner = this.colInnerWrappers[i];
      if (!inner) continue;

      const isExpandedTarget = this.expandedColIdx === i;
      const targetStableW = isExpandedTarget ? this.maxExpandedColWidth : this.baseColWidth;
      inner.style.width = `${targetStableW.toFixed(1)}px`;

      // shrinkRatio: 0 when at SHRUNK_COL_WEIGHT (4.25%), 1 when at or above standard column width (1.0)
      const shrinkRatio = clamp01(
        (this.colWeights[i] - SHRUNK_COL_WEIGHT) / (1.0 - SHRUNK_COL_WEIGHT)
      );
      const textAlpha = smoothstep(0.06, 0.86, shrinkRatio);
      const scaleX = 0.32 + 0.68 * smoothstep(0.0, 1.0, shrinkRatio);

      inner.style.opacity = textAlpha.toFixed(3);
      if (shrinkRatio < 0.995) {
        inner.style.transform = `translate3d(0, 0, 0) scaleX(${scaleX.toFixed(3)})`;
        inner.style.pointerEvents = shrinkRatio < 0.4 ? "none" : "auto";
      } else {
        inner.style.transform = "translate3d(0, 0, 0)";
        inner.style.pointerEvents = "auto";
      }
    }

    const isTextFullySettled = this.textProgress >= 0.999;
    if (isTextFullySettled && this.domSettled && !weightsChanged) {
      return;
    }

    // Stagger each block along its column's expansion direction (top-to-bottom for odd, bottom-to-top for even)
    for (let i = 0; i < this.animBlocks.length; i++) {
      const item = this.animBlocks[i];
      const el = item.el;
      if (isTextFullySettled) {
        el.style.opacity = "1";
        el.style.transform = "";
        continue;
      }

      const startT = item.orderRatio * 0.42;
      const localP = clamp01((this.textProgress - startT) / 0.58);
      const easeP = smoothstep(0, 1, localP);
      const isOdd = COLUMN_PALETTES[item.colIdx].isOdd;
      const slideY = (1 - easeP) * (isOdd ? -12 : 12);

      el.style.opacity = easeP.toFixed(3);
      el.style.transform = `translate3d(0, ${slideY.toFixed(1)}px, 0)`;
    }

    this.domSettled = isTextFullySettled;
  }
}
