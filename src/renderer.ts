/**
 * Draws the World as a grid of ASCII cells:
 *   1. a pure black cell grid
 *   2. a wake field that diffuses where things swim, lighting the dots cyan
 *   3. fish as minimal ASCII dashes, one per cell, glinting on hard turns
 *   4. sharks rasterised cell-by-cell with supersampled edges: dark tinted blocks
 *      carrying crisp glyphs whose density and brightness follow deliberate
 *      tonal bands (lit back, midtone flanks, dark underside)
 */
import { clamp, hash3, smoothstep } from "./math";
import {
  PORTRAIT_ASPECT,
  PORTRAIT_COLS,
  PORTRAIT_EDGE,
  PORTRAIT_META,
  PORTRAIT_ROWS,
  PORTRAIT_SHADE,
} from "./portraitData";
import { SHARK_LOCOMOTION, SHARK_NODES, type Shark, type SharkKind, type World } from "./world";

const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

const ALPHA_LEVELS = 6;
const FISH_ALPHAS = [0.28, 0.42, 0.58, 0.74, 0.9];

// Dot colour classes: blue, green, red, pale; the last entry is the cyan wake.
const DOT_RGB: [number, number, number][] = [
  [48, 52, 235],
  [52, 205, 60],
  [228, 50, 44],
  [190, 212, 255],
  [110, 230, 255],
];
const DOT_BASE_ALPHA = [1, 1, 1, 1, 0.5];
const WAKE = DOT_RGB.length - 1;

const ACCENTS = ["#e0892c", "#e03a32", "#b44ae0", "#33c8cc", "#3cb54a", "#3150e8", "#d9c14a"];
/**
 * Fraction of skin cells carrying a fixed accent colour. Accents are anchored to the skin
 * (they never re-roll over time); 0 keeps the shading pure and the glyphs fully legible.
 */
const ACCENT_RATE = 0;

// Deliberate tonal regions, darkest → brightest. Glyphs are drawn light-on-dark using
// ONLY the letters of "SAAYAN CHOWDHURY" / "saayan chowdhury" (no special characters or
// punctuation), sequenced horizontally so the glyphs making up each shark spell the name.
const NAME_UPPER = "SAAYANCHOWDHURY";
const NAME_LOWER = "saayanchowdhury";
const TONE_LEVELS = [58, 92, 126, 158, 192];

/** 9 varying orange shades used by the 3×3 glyph toggle button and the expanding glyph matrix wave. */
export const ORANGE_GLYPH_SHADES = [
  "#ff5400",
  "#ff6d14",
  "#ff8528",
  "#d9460c",
  "#f26116",
  "#ff9e3d",
  "#b83706",
  "#e65310",
  "#ffb454",
];

const LIGHT_BG_COLOR = "#f4f1ea";
const DARK_BG_COLOR = "#000000";

/** Light direction in screen space (pointing toward the light: up and slightly left). */
const LIGHT_X = -0.35;
const LIGHT_Y = -0.94;
/** How far past the spine's last node the caudal lobes may reach, as a fraction of length. */
const TAIL_EXTENSION = 0.1;

/**
 * Natural dorsal colour bands (top view): muted matte tones with zero green tints.
 * Ranges from deep blue-grey (#1A2A3A) and slate grey (#2E3F4F) through blue-grey (#4A5E6B)
 * and neutral grey (#6B7C88) to grey-brown (#7F7468) and dark brownish-grey (#4B3F36).
 */
interface SharkPalette {
  /** RGB multipliers in shadow / underside & fins (charcoal / deep blue-grey / dark umber). */
  low: [number, number, number];
  /** RGB multipliers in midtone flanks (slate grey / blue-grey / muted taupe). */
  mid: [number, number, number];
  /** RGB multipliers on the sunlit upper back and dorsal ridge (neutral grey / warm grey-brown). */
  high: [number, number, number];
}

const SHARK_PALETTES: SharkPalette[] = [
  // 1. Deep Blue-Grey → Slate Grey → Blue-Grey (cool pelagic dorsal: Great White / Whale Shark)
  {
    low: [0.62, 0.76, 0.94],
    mid: [0.74, 0.85, 0.98],
    high: [0.85, 0.92, 1.02],
  },
  // 2. Dark Charcoal-Slate → Cool Slate → Neutral Grey (#2E3F4F → #4A5E6B → #6B7C88)
  {
    low: [0.7, 0.78, 0.88],
    mid: [0.82, 0.88, 0.95],
    high: [0.92, 0.95, 1.0],
  },
  // 3. Dark Brownish-Grey → Matte Taupe → Grey-Brown (#4B3F36 → #665B50 → #7F7468, no green)
  {
    low: [0.82, 0.7, 0.6],
    mid: [0.94, 0.84, 0.74],
    high: [1.04, 0.95, 0.85],
  },
  // 4. Warm Charcoal-Brown → Sandy Grey-Brown → Muted Ochre-Grey (natural shallow-water lemon/tan)
  {
    low: [0.86, 0.74, 0.62],
    mid: [0.98, 0.88, 0.75],
    high: [1.08, 0.98, 0.84],
  },
];

const FLAG_BODY = 1;
const FLAG_EDGE = 2;
const FLAG_FIN = 3;
const FLAG_RIDGE = 4;
/** Dark skin markings: tiger bars, zebra-shark spots. */
const FLAG_MARK = 6;

// Sub-cell sample offsets for anti-aliased silhouettes.
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

/** Classic top-down half-width at s ∈ [0, 1] (snout → tail), as a fraction of length. */
function classicHalfWidth(s: number) {
  // Pointed conical snout (power < 1 keeps the tip sharp but the cheeks full).
  if (s < 0.16) return 0.112 * Math.pow(s / 0.16, 0.72);
  if (s < 0.32) return 0.112 + 0.01 * smoothstep(0.16, 0.32, s);
  // Long, gradual taper into a stout caudal peduncle (no pencil-thin tail stalk).
  if (s < 0.86) return 0.03 + 0.092 * Math.pow(1 - (s - 0.32) / 0.54, 1.15);
  const k = (s - 0.86) / 0.14;
  return 0.03 * (1 - 0.45 * k);
}

/** Body outline and fin layout per species. All values are fractions of length. */
interface SharkShape {
  halfWidth: (s: number) => number;
  /** Pectoral fin: leading root, trailing root, tip position along the body, and reach. */
  pectoral: [number, number, number, number];
  /** Notched (falcate) trailing edge on the pectorals. */
  falcate: boolean;
  /** Pelvic fins: leading root, trailing root, tip, reach. */
  pelvic: [number, number, number, number];
  /** Forked caudal fin: half-span of each lobe (fraction of length), or 0 for a ribbon/whip tail. */
  caudal: number;
  dorsal: [number, number];
  secondDorsal: [number, number];
  /**
   * Hammerheads' cephalofoil: half-span, how far its tips sweep back, its depth, and the
   * notch in the middle of the front edge. All fractions of length; absent for other sharks.
   */
  head?: { span: number; sweep: number; depth: number; notch: number };
  /** null when the eyes sit somewhere else (hammerhead: on the cephalofoil tips). */
  eye: [number, number] | null;
  gills: [number, number];
  /** Skin colour multipliers (r, g, b). */
  tint: [number, number, number];
}

const SHAPES: Record<SharkKind, SharkShape> = {
  classic: {
    halfWidth: classicHalfWidth,
    pectoral: [0.17, 0.43, 0.53, 0.28],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.135,
    dorsal: [0.32, 0.46],
    secondDorsal: [0.71, 0.76],
    eye: [0.1, 0.14],
    gills: [0.19, 0.29],
    tint: [0.86, 0.92, 1.0],
  },
  // Great white: conical pointed snout, powerful heavy-shouldered spindle body, large falcate
  // pectorals, prominent first dorsal, and a wide crescent caudal fin. Slate to blue-grey back.
  greatwhite: {
    halfWidth: (s) => {
      if (s < 0.16) return 0.122 * Math.pow(s / 0.16, 0.75);
      if (s < 0.34) return 0.122 + 0.012 * smoothstep(0.16, 0.34, s);
      if (s < 0.85) return 0.032 + 0.102 * Math.pow(1 - (s - 0.34) / 0.51, 1.18);
      const k = (s - 0.85) / 0.15;
      return 0.032 * (1 - 0.4 * k);
    },
    pectoral: [0.17, 0.43, 0.53, 0.29],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.145,
    dorsal: [0.31, 0.46],
    secondDorsal: [0.72, 0.76],
    eye: [0.09, 0.13],
    gills: [0.18, 0.28],
    tint: [0.82, 0.9, 1.0],
  },
  // Slim neck under a wide, swept-back cephalofoil (drawn in sampleShark),
  // tall first dorsal, long upper tail lobe. Matte brownish-slate grey (no green).
  hammerhead: {
    halfWidth: (s) => {
      if (s < 0.06) return 0.048;
      if (s < 0.3) return 0.048 + 0.064 * smoothstep(0.06, 0.3, s);
      return classicHalfWidth(s) * 0.94;
    },
    head: { span: 0.185, sweep: 0.032, depth: 0.092, notch: 0.008 },
    pectoral: [0.17, 0.4, 0.5, 0.24],
    falcate: true,
    pelvic: [0.56, 0.63, 0.67, 0.08],
    caudal: 0.125,
    dorsal: [0.28, 0.44],
    secondDorsal: [0.7, 0.74],
    eye: null,
    gills: [0.16, 0.26],
    tint: [0.94, 0.88, 0.82],
  },
  // Whale shark: very broad, flattened square-ish head, massive barrel torso with longitudinal
  // pale ridges and checkerboard pale spots/stripes, wide swept pectorals, and a large tail.
  whaleshark: {
    halfWidth: (s) => {
      if (s < 0.1) return 0.132 * Math.pow(Math.sin(((s / 0.1) * Math.PI) / 2), 0.38);
      if (s < 0.34) return 0.132 + 0.012 * smoothstep(0.1, 0.34, s);
      if (s < 0.84) return 0.032 + 0.112 * Math.pow(1 - (s - 0.34) / 0.5, 1.15);
      const k = (s - 0.84) / 0.16;
      return 0.032 * (1 - 0.42 * k);
    },
    pectoral: [0.15, 0.42, 0.52, 0.29],
    falcate: true,
    pelvic: [0.56, 0.64, 0.68, 0.085],
    caudal: 0.14,
    dorsal: [0.42, 0.53],
    secondDorsal: [0.68, 0.73],
    eye: [0.05, 0.08],
    gills: [0.14, 0.25],
    tint: [0.78, 0.88, 1.0],
  },
  // Lemon shark: broad rounded snout, stocky body, and its signature twin dorsal fins of
  // nearly equal size (second dorsal almost as large as the first). Matte sandy grey-brown.
  lemon: {
    halfWidth: (s) => {
      if (s < 0.14) return 0.106 * Math.pow(Math.sin(((s / 0.14) * Math.PI) / 2), 0.62);
      if (s < 0.32) return 0.106 + 0.012 * smoothstep(0.14, 0.32, s);
      if (s < 0.85) return 0.03 + 0.088 * Math.pow(1 - (s - 0.32) / 0.53, 1.12);
      const k = (s - 0.85) / 0.15;
      return 0.03 * (1 - 0.42 * k);
    },
    pectoral: [0.16, 0.4, 0.49, 0.25],
    falcate: true,
    pelvic: [0.52, 0.6, 0.64, 0.085],
    caudal: 0.12,
    dorsal: [0.34, 0.45],
    secondDorsal: [0.63, 0.73],
    eye: [0.08, 0.11],
    gills: [0.17, 0.26],
    tint: [0.98, 0.89, 0.77],
  },
  // Blunt, square snout on a heavy body; barred back. Warm grey-brown.
  tiger: {
    halfWidth: (s) => {
      if (s < 0.14) return 0.114 * Math.pow(Math.sin(((s / 0.14) * Math.PI) / 2), 0.45);
      if (s < 0.32) return 0.114 + 0.014 * smoothstep(0.14, 0.32, s);
      if (s < 0.86) return 0.028 + 0.1 * Math.pow(1 - (s - 0.32) / 0.54, 1.15);
      const k = (s - 0.86) / 0.14;
      return 0.028 * (1 - 0.45 * k);
    },
    pectoral: [0.16, 0.42, 0.52, 0.27],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.125,
    dorsal: [0.32, 0.46],
    secondDorsal: [0.71, 0.75],
    eye: [0.08, 0.12],
    gills: [0.19, 0.28],
    tint: [1.02, 0.95, 0.84],
  },
  // Short rounded head, body done by half-length, then a long ribbon of a
  // tail fin. Broad rounded pectorals, spotted sandy skin.
  zebra: {
    halfWidth: (s) => {
      if (s < 0.12) return 0.095 * Math.pow(Math.sin(((s / 0.12) * Math.PI) / 2), 0.7);
      if (s < 0.3) return 0.095 + 0.022 * smoothstep(0.12, 0.3, s);
      if (s < 0.58) return 0.03 + 0.087 * Math.pow(1 - (s - 0.3) / 0.28, 1.1);
      const k = (s - 0.58) / 0.42;
      return 0.03 * (1 - 0.5 * k * k) + 0.014 * Math.sin(k * Math.PI);
    },
    pectoral: [0.12, 0.32, 0.38, 0.22],
    falcate: false,
    pelvic: [0.42, 0.48, 0.51, 0.075],
    caudal: 0.095,
    dorsal: [0.35, 0.44],
    secondDorsal: [0.49, 0.53],
    eye: [0.06, 0.09],
    gills: [0.13, 0.2],
    tint: [1.08, 0.97, 0.74],
  },
  // Great hammerhead: a broader, nearly straight-edged cephalofoil with a notch at the centre,
  // a towering sickle first dorsal (drawn long and bright from above), and a cooler slate skin.
  greathammer: {
    halfWidth: (s) => {
      if (s < 0.05) return 0.048;
      if (s < 0.3) return 0.048 + 0.072 * smoothstep(0.05, 0.3, s);
      return classicHalfWidth(s) * 0.96;
    },
    head: { span: 0.21, sweep: 0.006, depth: 0.085, notch: 0.014 },
    pectoral: [0.16, 0.39, 0.5, 0.26],
    falcate: true,
    pelvic: [0.55, 0.62, 0.67, 0.085],
    caudal: 0.14,
    dorsal: [0.24, 0.45],
    secondDorsal: [0.68, 0.74],
    eye: null,
    gills: [0.15, 0.25],
    tint: [0.86, 0.93, 1.02],
  },
  // Shortfin mako: a long conical snout, a torpedo body that narrows hard to the tail stalk,
  // and a tall crescent tail. Metallic indigo back.
  mako: {
    halfWidth: (s) => {
      if (s < 0.18) return 0.105 * Math.pow(s / 0.18, 0.82);
      if (s < 0.34) return 0.105 + 0.012 * smoothstep(0.18, 0.34, s);
      if (s < 0.86) return 0.025 + 0.092 * Math.pow(1 - (s - 0.34) / 0.52, 1.25);
      const k = (s - 0.86) / 0.14;
      return 0.025 * (1 - 0.4 * k);
    },
    pectoral: [0.18, 0.41, 0.5, 0.24],
    falcate: true,
    pelvic: [0.58, 0.64, 0.68, 0.07],
    caudal: 0.145,
    dorsal: [0.33, 0.45],
    secondDorsal: [0.76, 0.79],
    eye: [0.11, 0.15],
    gills: [0.2, 0.3],
    tint: [0.78, 0.9, 1.2],
  },
  // Thresher: a compact body over the front half, then the upper tail lobe as a long whip
  // that's as long as the shark itself. Big eyes, long sickle pectorals, bronze-violet skin.
  thresher: {
    halfWidth: (s) => {
      if (s < 0.09) return 0.085 * Math.pow(s / 0.09, 0.72);
      if (s < 0.22) return 0.085 + 0.02 * smoothstep(0.09, 0.22, s);
      if (s < 0.5) return 0.022 + 0.083 * Math.pow(1 - (s - 0.22) / 0.28, 1.2);
      // The whip: thin, with a slight sickle swell before it tapers out.
      const k = (s - 0.5) / 0.5;
      return 0.022 * (1 - 0.65 * k) + 0.008 * Math.sin(k * Math.PI * 0.9);
    },
    pectoral: [0.12, 0.28, 0.37, 0.23],
    falcate: true,
    pelvic: [0.37, 0.42, 0.45, 0.055],
    caudal: 0.065,
    dorsal: [0.24, 0.33],
    secondDorsal: [0.45, 0.48],
    eye: [0.05, 0.1],
    gills: [0.11, 0.18],
    tint: [1.0, 0.9, 1.08],
  },
  // Nurse shark: a blunt, broad head, a heavy flattened body with both dorsals set far back,
  // rounded paddle pectorals, and a long low tail with no lower lobe. Tawny brown.
  nurse: {
    halfWidth: (s) => {
      if (s < 0.1) return 0.1 * Math.pow(Math.sin(((s / 0.1) * Math.PI) / 2), 0.45);
      if (s < 0.3) return 0.1 + 0.022 * smoothstep(0.1, 0.3, s);
      if (s < 0.74) return 0.028 + 0.094 * Math.pow(1 - (s - 0.3) / 0.44, 1.1);
      const k = (s - 0.74) / 0.26;
      return 0.028 * (1 - 0.45 * k * k) + 0.014 * Math.sin(k * Math.PI);
    },
    pectoral: [0.15, 0.35, 0.41, 0.2],
    falcate: false,
    pelvic: [0.45, 0.52, 0.55, 0.08],
    caudal: 0.095,
    dorsal: [0.5, 0.58],
    secondDorsal: [0.63, 0.69],
    eye: [0.05, 0.075],
    gills: [0.14, 0.22],
    tint: [1.1, 0.96, 0.76],
  },
};

const KINDS = Object.keys(SHAPES) as SharkKind[];

function inTriangle(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Visible cell grid, snapped to device pixels. Shared with the sidebar backdrop. */
export function paintGrid(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cw: number,
  ch: number,
  dpr: number,
  strokeStyle = "rgba(255,255,255,0.035)",
) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = strokeStyle;
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= Math.ceil(W / cw); c++) {
    const x = Math.round(c * cw * dpr) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, H * dpr);
  }
  for (let r = 0; r <= Math.ceil(H / ch); r++) {
    const y = Math.round(r * ch * dpr) + 0.5;
    g.moveTo(0, y);
    g.lineTo(W * dpr, y);
  }
  g.stroke();
}

export class AsciiRenderer {
  private ctx: CanvasRenderingContext2D;
  private bgDark: HTMLCanvasElement;
  private bgLight: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cw = 12;
  private ch = 18;
  private cols = 0;
  private rows = 0;
  private fontFamily = "ui-monospace, Menlo, monospace";

  // Theme & expanding glyph-matrix transition state.
  private lightMode = false;
  private transActive = false;
  private transFromLight = false;
  private transToLight = false;
  private transOriginX = 0;
  private transOriginY = 0;
  private transTime = 0;
  private transDuration = 1.05;
  private transMaxDist = 1000;
  private waveOuter = 0;
  private waveMid = 0;
  private waveInner = 0;
  private waveBand = 180;

  private dotKind = new Uint8Array(0); // 0 none, 1 blue, 2 green, 3 red, 4 pale
  private dotPhase = new Float32Array(0);
  private dotFreq = new Float32Array(0);
  private energy = new Float32Array(0);
  private energyTmp = new Float32Array(0);
  private heat = new Float32Array(0);
  private bucketOf = new Uint8Array(0);
  private bucketOrder = new Int32Array(0);
  private bucketCounts = new Int32Array(DOT_RGB.length * ALPHA_LEVELS + 1);
  private dotStylesDark: string[] = [];
  private dotStylesLight: string[] = [];

  private sharkFlag = new Uint8Array(0);
  private sharkShade = new Float32Array(0);
  private sharkKey = new Uint32Array(0);
  private sharkDepth = new Float32Array(0);
  private sharkKind = new Uint8Array(0);
  private sharkPalette = new Uint8Array(0);
  /** Cells darkened by a shark's shadow on the seabed. */
  private sharkShadow = new Uint8Array(0);
  private spine = new Float32Array(SHARK_NODES * 2);
  private arc = new Float32Array(SHARK_NODES);
  private arcTotal = 1;
  private shape = SHAPES.classic;
  private sharkId = 0;
  private finTipLeft = 0;
  private finTipRight = 0;
  private sharkRoll = 0;
  /** Minimum body half-width in px, so bodies never shrink below ~1.5 cells. */
  private minHalf = 6;
  /** Smoothed parallax camera offset in [-1, 1], driven by the pointer. */
  private camX = 0;
  private camY = 0;
  // Scratch outputs of sampleShark(), to avoid allocating per sample.
  private hitFlag = 0;
  private hitShade = 0;
  private hitS = 0;
  private hitV = 0;
  private hitDist = 0;

  /** Cells holding a fish this frame (frame stamp); dots skip them. */
  private fishStamp = new Uint32Array(0);
  private frameId = 0;
  /** Lower 2nd layer ('・') and upper 1st layer ('-') particle indices bucketed by brightness. */
  private dotLayerBuckets: number[][] = FISH_ALPHAS.map(() => []);
  private dashLayerBuckets: number[][] = FISH_ALPHAS.map(() => []);
  private fishStylesDark = FISH_ALPHAS.map((a) => `rgba(230,238,255,${a})`);
  private fishStylesLight = FISH_ALPHAS.map((a) => `rgba(26,42,60,${a})`);
  private dotParticleStylesDark = FISH_ALPHAS.map((a) => `rgba(186,204,236,${(a * 0.78).toFixed(3)})`);
  private dotParticleStylesLight = FISH_ALPHAS.map((a) => `rgba(42,62,86,${(a * 0.78).toFixed(3)})`);
  /** Precomputed 33-step smooth transition palettes (0 = dark mode, 32 = light mode) so particles never pop. */
  private dashParticleTransStyles: string[][] = [];
  private dotParticleTransStyles: string[][] = [];
  private bgTransToLightStyles: string[] = [];
  private bgTransToDarkStyles: string[] = [];

  // Portrait convergence state, offscreen glyph textures (dark & light) & 50%-glyph-scale (pCols × pRows) buffers.
  private portraitCanvas: HTMLCanvasElement;
  private portraitCanvasLight: HTMLCanvasElement;
  private portraitOffscreenW = 0;
  private portraitOffscreenH = 0;
  private pCw = 4;
  private pCh = 6;
  private pCols = 0;
  private pRows = 0;
  private portraitTarget = false;
  private portraitProgress = 0;
  private portraitDuration = 2.15;
  private portraitShade = new Float32Array(0);
  private portraitEdge = new Float32Array(0);
  private portraitMaskAlpha = new Float32Array(0);
  private portraitMeta = new Uint8Array(0);
  private portraitStartT = new Float32Array(0);
  private portraitActiveCells = new Int32Array(0);
  private portraitAnimatedCells = new Int32Array(0);
  private portraitFlightCells = new Int32Array(0);
  private portraitRowSpans: {
    row: number;
    cStart: number;
    cEnd: number;
    xStart: number;
    xEnd: number;
  }[] = [];
  private portraitRowMinCol = new Int16Array(0);
  private portraitRowMaxCol = new Int16Array(0);
  private portraitCenterCol = 0;
  private portraitCenterRow = 0;
  private portraitLeft = 0;
  private portraitTop = 0;
  private portraitWidth = 0;
  private portraitHeight = 0;
  private portraitRightEdge = 0;
  private portraitBottomEdge = 0;
  private portraitParticleAnchors: {
    x: number;
    y: number;
    layer: 0 | 1;
    orange: number;
    bucket: number;
    phase: number;
    reg: number;
    orbit: number;
  }[] = [];

  // Real-portrait radial glyph-matrix reveal state (triggered from click point inside portrait).
  private realPortraitImg: HTMLImageElement;
  private realPortraitLoaded = false;
  private realRevealTarget = false;
  private realRevealProgress = 0;
  private realRevealActive = false;
  private realRevealFromReal = false;
  private realRevealToReal = false;
  private realRevealOriginX = 0;
  private realRevealOriginY = 0;
  private realRevealTime = 0;
  private realRevealDuration = 0.92 / 0.30;
  private realRevealMaxDist = 600;
  private realWaveOuter = 0;
  private realWaveMid = 0;
  private realWaveInner = 0;
  private realWaveBand = 96;
  private realRevealDragging = false;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bgDark = document.createElement("canvas");
    this.bgLight = document.createElement("canvas");
    this.portraitCanvas = document.createElement("canvas");
    this.portraitCanvasLight = document.createElement("canvas");

    this.realPortraitImg = new Image();
    this.realPortraitImg.decoding = "async";
    const portraitCandidates = [
      "./images/Saayan.png",
      "/images/Saayan.png",
      "./images/portrait-real.webp",
      "/images/portrait-real.webp",
      "./portrait-real.webp",
      "/portrait-real.webp",
    ];
    let portraitTryIdx = 0;
    this.realPortraitImg.onload = () => {
      this.realPortraitLoaded = true;
    };
    this.realPortraitImg.onerror = () => {
      portraitTryIdx++;
      if (!this.realPortraitLoaded && portraitTryIdx < portraitCandidates.length) {
        this.realPortraitImg.src = portraitCandidates[portraitTryIdx];
      }
    };
    this.realPortraitImg.src = portraitCandidates[0];

    const STEPS = 32;
    for (let s = 0; s <= STEPS; s++) {
      const k = s / STEPS;
      this.bgTransToLightStyles.push(`rgba(244,241,234,${k.toFixed(3)})`);
      this.bgTransToDarkStyles.push(`rgba(0,0,0,${k.toFixed(3)})`);
    }

    for (let b = 0; b < FISH_ALPHAS.length; b++) {
      const a = FISH_ALPHAS[b];
      const dashSteps: string[] = [];
      const dotSteps: string[] = [];
      for (let s = 0; s <= STEPS; s++) {
        if (s === 0) {
          dashSteps.push(this.fishStylesDark[b]);
          dotSteps.push(this.dotParticleStylesDark[b]);
        } else if (s === STEPS) {
          dashSteps.push(this.fishStylesLight[b]);
          dotSteps.push(this.dotParticleStylesLight[b]);
        } else {
          const u = s / STEPS;
          const arch = Math.sin(u * Math.PI);
          const warm = 0.52 * arch;
          const dr = Math.round((230 + (26 - 230) * u) * (1 - warm) + 255 * warm);
          const dg = Math.round((238 + (42 - 238) * u) * (1 - warm) + 136 * warm);
          const db = Math.round((255 + (60 - 255) * u) * (1 - warm) + 38 * warm);
          const da = Math.min(1, a * (1 + 0.18 * arch));
          dashSteps.push(`rgba(${dr},${dg},${db},${da.toFixed(3)})`);

          const pr = Math.round((186 + (42 - 186) * u) * (1 - warm) + 245 * warm);
          const pg = Math.round((204 + (62 - 204) * u) * (1 - warm) + 132 * warm);
          const pb = Math.round((236 + (86 - 236) * u) * (1 - warm) + 42 * warm);
          const pa = Math.min(1, a * 0.78 * (1 + 0.18 * arch));
          dotSteps.push(`rgba(${pr},${pg},${pb},${pa.toFixed(3)})`);
        }
      }
      this.dashParticleTransStyles.push(dashSteps);
      this.dotParticleTransStyles.push(dotSteps);
    }

    for (let c = 0; c < DOT_RGB.length; c++) {
      const [r, g, b] = DOT_RGB[c];
      for (let l = 0; l < ALPHA_LEVELS; l++) {
        const a = (DOT_BASE_ALPHA[c] * (l + 1)) / ALPHA_LEVELS;
        this.dotStylesDark.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
        if (c === WAKE) {
          this.dotStylesLight.push(`rgba(20,122,168,${Math.min(0.85, a * 1.25).toFixed(3)})`);
        } else {
          this.dotStylesLight.push(`rgba(${Math.round(r * 0.65)},${Math.round(g * 0.65)},${Math.round(b * 0.65)},${a.toFixed(3)})`);
        }
      }
    }
  }

  get isLightMode() {
    return this.transActive ? this.transToLight : this.lightMode;
  }

  get isPortraitMode() {
    return this.portraitTarget;
  }

  get isRealPortraitRevealed() {
    return this.realRevealTarget;
  }

  get realPortraitProgress() {
    return this.realRevealProgress;
  }

  get portraitConvergenceProgress() {
    return this.portraitProgress;
  }

  get portraitRightPx() {
    return this.portraitRightEdge;
  }

  get portraitBottomPx() {
    return this.portraitBottomEdge;
  }

  get isTransitioning() {
    return (
      this.transActive ||
      this.realRevealActive ||
      this.realRevealDragging ||
      (this.portraitTarget ? this.portraitProgress < 1 : this.portraitProgress > 0) ||
      (this.realRevealTarget ? this.realRevealProgress < 1 : this.realRevealProgress > 0)
    );
  }

  /**
   * Toggles the animated ASCII glyph + particle portrait mode on or off.
   */
  togglePortrait(): boolean {
    this.portraitTarget = !this.portraitTarget;
    if (!this.portraitTarget) {
      this.realRevealTarget = false;
      this.realRevealActive = false;
      this.realRevealProgress = 0;
      this.realRevealDragging = false;
    }
    return this.portraitTarget;
  }

  /**
   * Toggles between the ASCII glyph portrait and the original (real) portrait via a radial
   * orange glyph-matrix expansion wave that spreads across the portrait from `(originX, originY)`.
   */
  toggleRealPortrait(originX?: number, originY?: number): boolean {
    this.realRevealDragging = false;
    const nextReal = !this.realRevealTarget;
    this.realRevealTarget = nextReal;
    this.realRevealFromReal = !nextReal;
    this.realRevealToReal = nextReal;

    const ox = originX ?? (this.portraitLeft + this.portraitWidth * 0.48);
    const oy = originY ?? (this.portraitTop + this.portraitHeight * 0.52);
    this.realRevealOriginX = ox;
    this.realRevealOriginY = oy;
    this.realRevealTime = 0;
    this.realRevealActive = true;

    const maxDx = Math.max(
      Math.abs(ox - this.portraitLeft),
      Math.abs(this.portraitRightEdge + this.pCw * 6 - ox),
    );
    const maxDy = Math.max(
      Math.abs(oy - this.portraitTop),
      Math.abs(this.portraitBottomEdge + this.pCh * 4 - oy),
    );
    this.realWaveBand = Math.max(112, Math.min(this.portraitWidth, this.portraitHeight) * 0.28);
    this.realRevealMaxDist = Math.hypot(maxDx, maxDy) + this.realWaveBand + this.pCw * 8;
    this.realWaveMid = 0;
    this.realWaveOuter = this.realWaveBand * 0.5;
    this.realWaveInner = -this.realWaveBand * 0.5;
    this.realRevealProgress = nextReal ? 0.001 : 0.999;
    return this.realRevealTarget;
  }

  setRealPortraitDrag(progress: number) {
    this.realRevealDragging = true;
    this.realRevealActive = false;
    this.realRevealProgress = clamp(progress, 0, 1);
  }

  commitRealPortraitDrag(targetReveal: boolean): boolean {
    this.realRevealDragging = false;
    this.realRevealActive = false;
    this.realRevealTarget = targetReveal;
    return this.realRevealTarget;
  }

  getPortraitBottomCenter() {
    return {
      x: Math.round(this.portraitLeft + this.portraitWidth * 0.5),
      bottomY: Math.min(this.height, this.portraitBottomEdge),
      topY: Math.round(this.portraitTop),
      height: Math.max(120, Math.round(this.portraitHeight)),
    };
  }

  /**
   * Returns true if the canvas-local coordinate `(x, y)` lies anywhere inside the portrait
   * (either on an active portrait glyph cell or within the smoothed portrait silhouette bounds)
   * while portrait mode is active.
   */
  isPointOnPortrait(x: number, y: number): boolean {
    if (!this.portraitTarget || this.portraitProgress < 0.25) return false;
    if (
      x < this.portraitLeft ||
      x > this.portraitRightEdge ||
      y < this.portraitTop ||
      y > this.portraitBottomEdge
    ) {
      return false;
    }
    const c = clamp(Math.floor(x / this.pCw), 0, this.pCols - 1);
    const r = clamp(Math.floor(y / this.pCh), 0, this.pRows - 1);
    const minC = this.portraitRowMinCol[r];
    const maxC = this.portraitRowMaxCol[r];
    if (minC >= 0 && c >= minC && c <= maxC) return true;

    // Also check a 3-cell radius around (c, r) in `portraitMeta` so outer hair curls & edges are clickable
    for (let dr = -3; dr <= 3; dr++) {
      const nr = r + dr;
      if (nr < 0 || nr >= this.pRows) continue;
      const rowOff = nr * this.pCols;
      for (let dc = -3; dc <= 3; dc++) {
        const nc = c + dc;
        if (nc < 0 || nc >= this.pCols) continue;
        if ((this.portraitMeta[rowOff + nc] & 7) !== 0) return true;
      }
    }
    return false;
  }

  /**
   * Returns true if the point `(x, y)` is currently showing the real portrait
   * (either stably when `!realRevealActive && realRevealProgress >= 0.5`, or on the real-portrait
   * side of the expanding radial wavefront when `realRevealActive` is true).
   */
  private isPointShowingRealPortrait(x: number, y: number, col?: number, row?: number): boolean {
    if (!this.realRevealActive) {
      return this.realRevealProgress >= 0.5;
    }
    const c = col ?? Math.floor(x / this.pCw);
    const r = row ?? Math.floor(y / this.pCh);
    const h = hash3(c, r, 79);
    const d = Math.hypot(x - this.realRevealOriginX, y - this.realRevealOriginY) + (h - 0.5) * this.pCw * 6.5;
    const insideWave = d <= this.realWaveMid;
    return this.realRevealToReal ? insideWave : !insideWave;
  }

  /**
   * Appends a closed jagged-circle polygon around `(realRevealOriginX, realRevealOriginY)`
   * at radius `realWaveMid` to `targetCtx`'s current path so the glyph portrait and real portrait
   * clip cleanly along the center of the expanding glyph matrix wavefront.
   */
  private traceRealRevealWavePath(targetCtx: CanvasRenderingContext2D) {
    const ox = this.realRevealOriginX;
    const oy = this.realRevealOriginY;
    const baseR = Math.max(0, this.realWaveMid);
    if (baseR <= 0.5) return;
    const steps = 96;
    const radialBand = Math.floor(baseR / (this.pCw * 3));
    for (let s = 0; s < steps; s++) {
      const angle = (s / steps) * Math.PI * 2;
      const jit = (hash3(s, radialBand, 79) - 0.5) * this.pCw * 5.5;
      const r = Math.max(0, baseR + jit);
      const px = ox + Math.cos(angle) * r;
      const py = oy + Math.sin(angle) * r;
      if (s === 0) {
        targetCtx.moveTo(px, py);
      } else {
        targetCtx.lineTo(px, py);
      }
    }
    targetCtx.closePath();
  }

  /**
   * Starts a glyph matrix expansion wave from (originX, originY) that spreads across
   * the entire screen to toggle between dark mode and light mode.
   */
  toggleTheme(originX: number, originY: number): boolean {
    const nextLight = !this.isLightMode;
    this.transFromLight = !nextLight;
    this.transToLight = nextLight;
    this.transOriginX = originX;
    this.transOriginY = originY;
    this.transTime = 0;
    this.transActive = true;
    const maxDx = Math.max(originX, this.width - originX);
    const maxDy = Math.max(originY, this.height - originY);
    this.waveBand = Math.max(185, Math.min(this.width, this.height) * 0.26);
    this.transMaxDist = Math.hypot(maxDx, maxDy) + this.waveBand + this.cw * 8;
    const startOffset = this.cw * 4;
    this.waveOuter = -startOffset;
    this.waveMid = -startOffset - this.waveBand * 0.5;
    this.waveInner = -startOffset - this.waveBand;
    return nextLight;
  }

  /**
   * Smooth [0, 1] transition progress for cell (col, row) from `from` theme (0) to `to` theme (1).
   */
  private cellWaveProgress(col: number, row: number): number {
    const cx = col * this.cw + this.cw * 0.5;
    const cy = row * this.ch + this.ch * 0.5;
    const d = Math.hypot(cx - this.transOriginX, cy - this.transOriginY);
    const jitter = (hash3(col, row, 41) - 0.5) * this.cw * 3.8;
    const dj = d + jitter;
    if (dj >= this.waveOuter) return 0;
    if (dj <= this.waveInner) return 1;
    const u = (this.waveOuter - dj) / this.waveBand;
    return smoothstep(0.12, 0.88, u);
  }

  /**
   * Continuous [0, 1] lightness blend (0 = dark mode, 1 = light mode) for any screen coordinate (x, y).
   * Used so floating particles smoothly crossfade across the wavefront without ever popping.
   */
  private getPointLightBlend(x: number, y: number): number {
    if (!this.transActive) return this.lightMode ? 1 : 0;
    const col = Math.floor(x / this.cw);
    const row = Math.floor(y / this.ch);
    const d = Math.hypot(x - this.transOriginX, y - this.transOriginY);
    const jitter = (hash3(col, row, 41) - 0.5) * this.cw * 2.2;
    const dj = d + jitter;
    let prog: number;
    if (dj >= this.waveOuter) {
      prog = 0;
    } else if (dj <= this.waveInner) {
      prog = 1;
    } else {
      const u = (this.waveOuter - dj) / this.waveBand;
      prog = smoothstep(0.08, 0.92, u);
    }
    return this.transToLight ? prog : 1 - prog;
  }

  private isCellLight(col: number, row: number): boolean {
    if (!this.transActive) return this.lightMode;
    const cx = col * this.cw + this.cw * 0.5;
    const cy = row * this.ch + this.ch * 0.5;
    const d = Math.hypot(cx - this.transOriginX, cy - this.transOriginY);
    const jitter = (hash3(col, row, 41) - 0.5) * this.cw * 3.8;
    const reached = d + jitter <= this.waveMid;
    return this.transToLight ? reached : !reached;
  }

  get cellWidth() {
    return this.cw;
  }

  get cellHeight() {
    return this.ch;
  }

  get portraitCellWidth() {
    return this.pCw;
  }

  get portraitCellHeight() {
    return this.pCh;
  }

  setFontFamily(family: string) {
    if (family && family !== this.fontFamily) {
      this.fontFamily = family;
      if (this.pCols > 0) this.paintPortraitOffscreen();
    }
  }

  refreshPortraitOffscreen() {
    if (this.pCols > 0) this.paintPortraitOffscreen();
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    // Small cells for smooth contours. Shark length is set in px by the world (from the
    // viewport, not the cell size), so finer cells add glyphs/detail instead of shrinking sharks.
    this.cw = clamp(Math.round(width / 200), 6, 9);
    this.ch = Math.round(this.cw * 1.42);
    this.minHalf = Math.max(this.cw * 0.95, this.ch * 0.62);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);

    // Portrait glyphs are reduced to 50% of their initial size (4× spatial cell density)
    // to make the portrait more detailed, defined, and recognizable.
    this.pCw = this.cw * 0.5;
    this.pCh = this.ch * 0.5;
    this.pCols = Math.ceil(width / this.pCw);
    this.pRows = Math.ceil(height / this.pCh);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bgDark.width = this.canvas.width;
    this.bgDark.height = this.canvas.height;
    this.bgLight.width = this.canvas.width;
    this.bgLight.height = this.canvas.height;

    const n = this.cols * this.rows;
    this.dotKind = new Uint8Array(n);
    this.dotPhase = new Float32Array(n);
    this.dotFreq = new Float32Array(n);
    this.energy = new Float32Array(n);
    this.energyTmp = new Float32Array(n);
    this.heat = new Float32Array(n);
    this.bucketOf = new Uint8Array(n);
    this.bucketOrder = new Int32Array(n);
    this.sharkFlag = new Uint8Array(n);
    this.sharkShade = new Float32Array(n);
    this.sharkKey = new Uint32Array(n);
    this.sharkDepth = new Float32Array(n);
    this.sharkKind = new Uint8Array(n);
    this.sharkPalette = new Uint8Array(n);
    this.sharkShadow = new Uint8Array(n);
    this.fishStamp = new Uint32Array(n);

    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = (i / this.cols) | 0;
      // No ambient dots: the grid stays clean. Only the wake lights cells.
      this.dotKind[i] = 0;
      this.dotPhase[i] = hash3(col, row, 23) * Math.PI * 2;
      this.dotFreq[i] = 0.3 + hash3(col, row, 37) * 1.1;
    }
    this.buildPortraitField();
    this.paintBackground();
  }

  /**
   * Maps the precomputed multi-scale portrait density, edge contour, and accent tables onto the
   * 50%-scale portrait ASCII grid (pCols × pRows), computes a high-resolution antialiased contour
   * mask for seamless light-mode edge blending, selects animated overlay glyphs & dispersed particle
   * anchors, and pre-renders both the dark-mode and light-mode offscreen portrait canvases.
   */
  private buildPortraitField() {
    const { width: W, height: H, pCols, pRows, pCw, pCh } = this;
    const n = pCols * pRows;
    this.portraitShade = new Float32Array(n);
    this.portraitEdge = new Float32Array(n);
    this.portraitMaskAlpha = new Float32Array(n);
    this.portraitMeta = new Uint8Array(n);
    this.portraitStartT = new Float32Array(n);
    this.portraitRowMinCol = new Int16Array(pRows).fill(-1);
    this.portraitRowMaxCol = new Int16Array(pRows).fill(-1);
    this.portraitRowSpans = [];

    // Position the portrait flush against the extreme left edge of the viewport (pLeft = 0)
    // and scale it up by ~10.5% (within 8–12%) while anchoring the bottom to the full grid bottom
    // (pRows * pCh) so the bottom row never clips above the viewport edge.
    const isCompact = W < 760;
    const maxPortraitW = isCompact ? W * 0.53 : W * 0.415;
    const maxPortraitH = isCompact ? H * 0.465 : H * 0.985;
    const pHeight = Math.min(maxPortraitH, maxPortraitW / PORTRAIT_ASPECT);
    const pWidth = pHeight * PORTRAIT_ASPECT;
    const pLeft = 0;
    const pBottom = isCompact ? Math.max(8, Math.round(H * 0.02)) + pHeight : pRows * pCh;
    const pTop = pBottom - pHeight;

    this.portraitLeft = pLeft;
    this.portraitTop = pTop;
    this.portraitWidth = pWidth;
    this.portraitHeight = pHeight;
    this.portraitRightEdge = Math.round(pLeft + pWidth);
    this.portraitBottomEdge = Math.round(pTop + pHeight);
    this.portraitCenterCol = Math.round((pLeft + pWidth * 0.5) / pCw);
    this.portraitCenterRow = Math.round((pTop + pHeight * 0.46) / pCh);

    const activeIndices: number[] = [];
    const animatedIndices: number[] = [];
    const flightIndices: number[] = [];
    const rawMinCol = new Int16Array(pRows).fill(-1);
    const rawMaxCol = new Int16Array(pRows).fill(-1);
    const rawCoverage = new Float32Array(n);
    let minActiveRow = pRows;
    let maxActiveRow = -1;

    const candidateAnchors: {
      cellIdx: number;
      c: number;
      r: number;
      x: number;
      y: number;
      layer: 0 | 1;
      orange: number;
      bucket: number;
      phase: number;
      reg: number;
      orbit: number;
      sortKey: number;
    }[] = [];

    for (let r = 0; r < pRows; r++) {
      const cy = r * pCh + pCh * 0.5;
      const rawV = (cy - pTop) / pHeight;
      if (rawV < 0 || rawV > 1.005) continue;
      const v = clamp(rawV, 0, 0.9999);
      const pfY = v * (PORTRAIT_ROWS - 1);
      const r0 = Math.floor(pfY);
      const r1 = Math.min(PORTRAIT_ROWS - 1, r0 + 1);
      const fy = pfY - r0;

      let rowMinC = -1;
      let rowMaxC = -1;

      for (let c = 0; c < pCols; c++) {
        const cx = c * pCw + pCw * 0.5;
        const u = (cx - pLeft) / pWidth;
        if (u < 0 || u >= 1) continue;
        const pfX = u * (PORTRAIT_COLS - 1);
        const c0 = Math.floor(pfX);
        const c1 = Math.min(PORTRAIT_COLS - 1, c0 + 1);
        const fx = pfX - c0;

        const idx00 = r0 * PORTRAIT_COLS + c0;
        const idx10 = r0 * PORTRAIT_COLS + c1;
        const idx01 = r1 * PORTRAIT_COLS + c0;
        const idx11 = r1 * PORTRAIT_COLS + c1;

        const m00 = PORTRAIT_META[idx00];
        const m10 = PORTRAIT_META[idx10];
        const m01 = PORTRAIT_META[idx01];
        const m11 = PORTRAIT_META[idx11];

        // Nearest sample for discrete zone classification, with priority for glasses (5) & orange accents.
        const nearIdx = (fy < 0.5 ? r0 : r1) * PORTRAIT_COLS + (fx < 0.5 ? c0 : c1);
        let meta = PORTRAIT_META[nearIdx];
        if ((meta & 7) === 0) {
          continue;
        }
        // Preserve thin glasses frame (reg 5) across sub-cell sampling
        if ((m00 & 7) === 5 || (m10 & 7) === 5 || (m01 & 7) === 5 || (m11 & 7) === 5) {
          const maxMeta = [m00, m10, m01, m11].find((m) => (m & 7) === 5)!;
          meta = (Math.max(meta >> 3, maxMeta >> 3) << 3) | 5;
        }
        // Strip orange accent weight inside the face/head/neck region so face glyphs match
        // the neighboring face glyph color scheme while shirt chevrons (reg === 6) stay orange.
        const isNeckSkin = r0 <= 168 && c0 >= 90 && c0 <= 154 && (meta >> 3) <= 4;
        if ((meta & 7) !== 6 || isNeckSkin) {
          meta &= 7;
        }

        // Bilinear interpolation over foreground neighbors for silky-smooth facial shading
        const w00 = (m00 & 7) > 0 ? (1 - fx) * (1 - fy) : 0;
        const w10 = (m10 & 7) > 0 ? fx * (1 - fy) : 0;
        const w01 = (m01 & 7) > 0 ? (1 - fx) * fy : 0;
        const w11 = (m11 & 7) > 0 ? fx * fy : 0;
        const wSum = w00 + w10 + w01 + w11;
        if (wSum <= 1e-4) continue;

        let shadeVal =
          (PORTRAIT_SHADE[idx00] * w00 +
            PORTRAIT_SHADE[idx10] * w10 +
            PORTRAIT_SHADE[idx01] * w01 +
            PORTRAIT_SHADE[idx11] * w11) /
          (wSum * 255);
        const edgeVal =
          (PORTRAIT_EDGE[idx00] * w00 +
            PORTRAIT_EDGE[idx10] * w10 +
            PORTRAIT_EDGE[idx01] * w01 +
            PORTRAIT_EDGE[idx11] * w11) /
          (wSum * 255);

        // Preserve crisp extremum on glasses rims and eye catchlights
        const reg = meta & 7;
        if (reg === 5 || (reg === 4 && edgeVal > 0.35)) {
          const nearShade = PORTRAIT_SHADE[nearIdx] / 255;
          shadeVal = shadeVal * 0.45 + nearShade * 0.55;
        }

        if (rowMinC < 0) rowMinC = c;
        rowMaxC = c;

        const i = r * pCols + c;
        const clampedShade = clamp(shadeVal, 0, 1);
        const clampedEdge = clamp(edgeVal, 0, 1);
        this.portraitShade[i] = clampedShade;
        this.portraitEdge[i] = clampedEdge;
        this.portraitMeta[i] = meta;
        rawCoverage[i] = clamp(wSum, 0, 1);
        activeIndices.push(i);

        // Compute staggered convergence launch window t0 in [0.02, 0.44]:
        // Eyes, glasses, smile & brows lock in earliest; curls and shirt cascade smoothly.
        const h = hash3(c, r, 61);
        const radial = Math.hypot(u - 0.5, (v - 0.45) * 1.15);
        let t0: number;
        if (reg === 4 || reg === 5) {
          t0 = 0.02 + 0.15 * h;
        } else if (reg === 3 || reg === 2) {
          t0 = 0.06 + 0.18 * clamp(radial, 0, 1) + 0.12 * h;
        } else if (reg === 1) {
          t0 = 0.09 + 0.22 * clamp(radial, 0, 1) + 0.14 * h;
        } else {
          t0 = 0.14 + 0.22 * clamp(radial, 0, 1) + 0.12 * h;
        }
        this.portraitStartT[i] = t0;

        const orangeW = (meta >> 3) / 31;

        // Curated subset of portrait glyphs (~4% of cells) animated on top of the offscreen portrait texture:
        // glasses rims, eye catchlights, smile contours, outer hair curls, orange shirt chevrons, and sparse shimmer points.
        const hAnim = hash3(c, r, 107);
        const isAnimatedGlyph =
          (reg === 5 && (clampedEdge > 0.38 || clampedShade > 0.65) && hAnim < 0.24) ||
          (reg === 4 && (clampedEdge > 0.44 || clampedShade > 0.72) && hAnim < 0.22) ||
          (orangeW > 0.16 && hAnim < 0.26) ||
          (reg === 1 && clampedEdge > 0.36 && hAnim < 0.06) ||
          hAnim < 0.018;
        if (isAnimatedGlyph) {
          animatedIndices.push(i);
        }

        // Subset of glyphs (~16% of cells) that visibly stream along curved trajectories during convergence/divergence
        if (isAnimatedGlyph || ((c + r * 3) % 6 === 0)) {
          flightIndices.push(i);
        }

        // Select contour, curl, beard, glasses, and chevron cells as floating particle anchors
        const hAnchor = hash3(c, r, 89);
        const isAnchor =
          (reg === 1 && (clampedEdge > 0.22 ? hAnchor < 0.16 : hAnchor < 0.04)) ||
          (reg === 5 && hAnchor < 0.24) ||
          (reg === 3 && hAnchor < 0.14) ||
          (reg === 4 && clampedEdge > 0.24 && hAnchor < 0.16) ||
          (orangeW > 0.25 && hAnchor < 0.22) ||
          (reg === 6 && clampedEdge > 0.32 && hAnchor < 0.06);

        if (isAnchor) {
          const layer: 0 | 1 =
            reg === 5 || orangeW > 0.2 || clampedShade > 0.56 || (reg === 1 && clampedEdge > 0.38) ? 1 : 0;
          const bucket = clamp(Math.floor(clampedShade * FISH_ALPHAS.length), 1, FISH_ALPHAS.length - 1);
          candidateAnchors.push({
            cellIdx: i,
            c,
            r,
            x: cx,
            y: cy,
            layer,
            orange: orangeW,
            bucket,
            phase: h * Math.PI * 2,
            reg,
            orbit: reg === 1 ? 1.85 : 1.15,
            sortKey: ((candidateAnchors.length * 2654435761) >>> 0) + hAnchor,
          });
        }
      }

      if (rowMinC >= 0 && rowMaxC >= rowMinC) {
        rawMinCol[r] = rowMinC;
        rawMaxCol[r] = rowMaxC;
        if (r < minActiveRow) minActiveRow = r;
        if (r > maxActiveRow) maxActiveRow = r;
      }
    }

    // Build a high-resolution, antialiased portrait contour mask (`this.portraitMaskAlpha`)
    // via a 2-pass separable Gaussian-like blur over `rawCoverage`, preserving the flush-left
    // lower shoulder edge and bottom viewport anchor while creating a smooth contour falloff
    // along the outer hair curls, head, neck, and right shoulder.
    if (maxActiveRow >= minActiveRow) {
      const horizBlur = new Float32Array(n);
      const R_BLUR = 11;
      const maxPortraitCol = Math.min(pCols - 1, Math.ceil((this.portraitRightEdge + pCw * 16) / pCw));

      for (let r = Math.max(0, minActiveRow - R_BLUR); r <= Math.min(pRows - 1, maxActiveRow); r++) {
        const flushLeftRow = rawMinCol[r] >= 0 && rawMinCol[r] <= 2;
        const rowOff = r * pCols;
        for (let c = 0; c <= maxPortraitCol; c++) {
          let sum = 0;
          let wSumBlur = 0;
          for (let dc = -R_BLUR; dc <= R_BLUR; dc++) {
            const w = R_BLUR + 1 - Math.abs(dc);
            const nc = c + dc;
            let val = 0;
            if (nc < 0) {
              val = flushLeftRow ? 1 : 0;
            } else if (nc < pCols) {
              val = rawCoverage[rowOff + nc];
            }
            sum += val * w;
            wSumBlur += w;
          }
          horizBlur[rowOff + c] = sum / wSumBlur;
        }
      }

      for (let k = 0; k < activeIndices.length; k++) {
        const idx = activeIndices[k];
        const c = idx % pCols;
        const r = (idx / pCols) | 0;
        let sum = 0;
        let wSumBlur = 0;
        for (let dr = -R_BLUR; dr <= R_BLUR; dr++) {
          const w = R_BLUR + 1 - Math.abs(dr);
          const nr = r + dr;
          let val = 0;
          if (nr > maxActiveRow) {
            // Keep bottom edge solid where the torso meets the bottom of the viewport
            val = horizBlur[maxActiveRow * pCols + c];
          } else if (nr >= 0 && nr < pRows) {
            val = horizBlur[nr * pCols + c];
          }
          sum += val * w;
          wSumBlur += w;
        }
        const blurred = sum / wSumBlur;
        // Normalize so interior cells (>= 0.86 blurred coverage) reach 1.0 and outer contour feathers smoothly to 0
        const norm = clamp((blurred - 0.14) / 0.72, 0, 1);
        this.portraitMaskAlpha[idx] = smoothstep(0, 1, norm) * rawCoverage[idx];
      }
    }

    // Let a sparse selection of existing contour particles disperse naturally beyond the silhouette
    // so the outer hair curls and shoulder edge blend organically into the surrounding grid.
    const centerPxX = pLeft + pWidth * 0.42;
    const centerPxY = pTop + pHeight * 0.48;
    for (let aIdx = 0; aIdx < candidateAnchors.length; aIdx++) {
      const anch = candidateAnchors[aIdx];
      const mAlpha = this.portraitMaskAlpha[anch.cellIdx];
      const hDisp = hash3(anch.c, anch.r, 151);
      if (mAlpha < 0.78 && (anch.reg === 1 || anch.reg === 6) && hDisp < 0.32) {
        const dx = anch.x - centerPxX;
        const dy = anch.y - centerPxY;
        const dist = Math.hypot(dx, dy) || 1;
        const outDist = 8 + hash3(anch.c, anch.r, 163) * 44;
        anch.x = clamp(anch.x + (dx / dist) * outDist, 3, W - 4);
        anch.y = clamp(anch.y + (dy / dist) * outDist * 0.85, 3, H - 4);
        anch.orbit = 4.2 + hash3(anch.c, anch.r, 173) * 5.2;
        anch.bucket = Math.max(0, anch.bucket - 1);
      }
    }

    // Reduce the size of the dark-mode background area covered by portrait glyphs by 15% and smooth its
    // vertical contour across rows to eliminate jagged stair-stepped lines along the edges.
    if (maxActiveRow >= minActiveRow) {
      const totalActiveRows = maxActiveRow - minActiveRow + 1;
      const bgStartRow = Math.min(maxActiveRow, minActiveRow + Math.round(totalActiveRows * 0.075));
      const smoothMin = new Float32Array(pRows);
      const smoothMax = new Float32Array(pRows);

      // Pass 1: Gaussian-like vertical box smoothing (±9 rows) over raw glyph row bounds
      for (let r = bgStartRow; r <= maxActiveRow; r++) {
        let sumMin = 0;
        let sumMax = 0;
        let wTotal = 0;
        for (let dr = -9; dr <= 9; dr++) {
          const nr = clamp(r + dr, minActiveRow, maxActiveRow);
          if (rawMinCol[nr] < 0) continue;
          const w = 10 - Math.abs(dr);
          sumMin += rawMinCol[nr] * w;
          sumMax += rawMaxCol[nr] * w;
          wTotal += w;
        }
        smoothMin[r] = wTotal > 0 ? sumMin / wTotal : 0;
        smoothMax[r] = wTotal > 0 ? sumMax / wTotal : 0;
      }

      // Pass 2: Shrink horizontal span by 15% (to 85% coverage) with a smooth rounded crown taper
      const insetXStart = new Float32Array(pRows);
      const insetXEnd = new Float32Array(pRows);
      const crownSpan = Math.max(8, Math.round(totalActiveRows * 0.12));
      for (let r = bgStartRow; r <= maxActiveRow; r++) {
        const sMin = smoothMin[r];
        const sMax = smoothMax[r];
        const spanW = Math.max(1, sMax - sMin + 1);
        const crownT = smoothstep(0, crownSpan, r - bgStartRow);
        const scale = 0.85 * (0.62 + 0.38 * crownT);
        const reducedW = spanW * scale;
        const totalInset = spanW - reducedW;

        if (sMin <= 2.5) {
          insetXStart[r] = 0;
          insetXEnd[r] = Math.max(pCw, (sMax + 1 - totalInset) * pCw);
        } else {
          const leftShare = clamp((sMin - 2.5) / 10, 0, 0.5);
          const cStartF = sMin + totalInset * leftShare;
          const cEndF = sMax + 1 - totalInset * (1 - leftShare);
          insetXStart[r] = Math.max(0, cStartF * pCw);
          insetXEnd[r] = Math.max(insetXStart[r] + pCw, cEndF * pCw);
        }
      }

      // Pass 3: Final vertical smoothing pass (±6 rows) on pixel coordinates so the contour path is completely free of kinks
      for (let r = bgStartRow; r <= maxActiveRow; r++) {
        let sx0 = 0;
        let sx1 = 0;
        let sw = 0;
        for (let dr = -6; dr <= 6; dr++) {
          const nr = clamp(r + dr, bgStartRow, maxActiveRow);
          const w = 7 - Math.abs(dr);
          sx0 += insetXStart[nr] * w;
          sx1 += insetXEnd[nr] * w;
          sw += w;
        }
        const xStart = sx0 / sw;
        const xEnd = sx1 / sw;
        const cStart = clamp(Math.ceil(xStart / pCw), 0, pCols - 1);
        const cEnd = clamp(Math.floor(xEnd / pCw) - 1, cStart, pCols - 1);
        this.portraitRowMinCol[r] = cStart;
        this.portraitRowMaxCol[r] = cEnd;
        this.portraitRowSpans.push({ row: r, cStart, cEnd, xStart, xEnd });
      }
    }

    this.portraitActiveCells = new Int32Array(activeIndices);
    this.portraitAnimatedCells = new Int32Array(animatedIndices);
    this.portraitFlightCells = new Int32Array(flightIndices);
    candidateAnchors.sort((a, b) => a.sortKey - b.sortKey);
    this.portraitParticleAnchors = candidateAnchors.slice(0, 560);

    this.paintPortraitOffscreen();
  }

  /**
   * Fills the 15%-reduced, vertically smoothed portrait background silhouette as a continuous
   * vector path (used only in dark mode to preserve the unchanged dark-mode appearance).
   */
  private fillPortraitBackgroundPath(targetCtx: CanvasRenderingContext2D, offsetX = 0, offsetY = 0) {
    const { portraitRowSpans, pCh } = this;
    const spanCount = portraitRowSpans.length;
    if (spanCount === 0) return;

    targetCtx.beginPath();
    const first = portraitRowSpans[0];
    const last = portraitRowSpans[spanCount - 1];
    const topMidX = (first.xStart + first.xEnd) * 0.5 + offsetX;
    targetCtx.moveTo(topMidX, first.row * pCh + offsetY);

    // Left contour top-to-bottom
    for (let i = 0; i < spanCount; i++) {
      const sp = portraitRowSpans[i];
      targetCtx.lineTo(sp.xStart + offsetX, (sp.row + 0.5) * pCh + offsetY);
    }
    targetCtx.lineTo(last.xStart + offsetX, (last.row + 1) * pCh + 2 + offsetY);
    targetCtx.lineTo(last.xEnd + offsetX, (last.row + 1) * pCh + 2 + offsetY);

    // Right contour bottom-to-top
    for (let i = spanCount - 1; i >= 0; i--) {
      const sp = portraitRowSpans[i];
      targetCtx.lineTo(sp.xEnd + offsetX, (sp.row + 0.5) * pCh + offsetY);
    }
    targetCtx.closePath();
    targetCtx.fill();
  }

  /**
   * Renders a single portrait glyph cell using the dedicated light-mode luminance palette and
   * antialiased contour falloff (deep charcoal for hair & shadows, slate and warm greys for
   * midtones, pale greys for highlights, minimal orange accents, and zero black silhouette backing).
   */
  private drawLightPortraitGlyphCell(
    targetCtx: CanvasRenderingContext2D,
    col: number,
    row: number,
    drawX: number,
    drawY: number,
    fillW: number,
    fillH: number,
    reg: number,
    s: number,
    e: number,
    orangeW: number,
    maskAlpha: number,
    fadeIn: number,
    charIdx: number,
    eraseUnderneath: boolean,
  ) {
    if (maskAlpha <= 0.025) return;

    // Keep high glyph density across the portrait; only dither the outermost fringe (< 0.68)
    const ditherVal = BAYER_4X4[((row & 3) << 2) | (col & 3)];
    if (maskAlpha < 0.68) {
      const densityKeep = Math.pow(maskAlpha / 0.68, 1.05);
      const edgeSample = 0.58 * hash3(col, row, 137) + 0.42 * ditherVal;
      if (edgeSample > densityKeep) return;
    }

    // High contour opacity across the portrait so glyphs stand out strongly in light mode
    const contourOpacity = smoothstep(0.02, 0.62, maskAlpha) * fadeIn;
    if (contourOpacity <= 0.02) return;

    // Darker features, midtones & edges carry crisp uppercase glyphs for strong visual weight in light mode
    const dither = ditherVal * 0.18;
    const useUpper = s - dither < 0.68 || e > 0.34 || reg === 5;
    const glyph = useUpper ? NAME_UPPER[charIdx] : NAME_LOWER[charIdx];

    // High-contrast, darkened light-mode glyph palette by anatomical region & luminance `s`:
    // - Hair (1) & Beard/Brows (3): deep ink-black to rich dark charcoal (#06090e – #262e3a)
    // - Glasses (5): jet-black/deep-charcoal frame (#05080d) with dark slate specular glints
    // - Eyes, Nose & Smile (4): deep ink shadows/lashes, dark charcoal-slate midtones, medium-dark warm slate highlights
    // - Skin (2): rich espresso-charcoal shadows, dark warm umber/slate midtones (#2c2a27 – #504c47), crisp dark-graphite highlights (#524e48 – #726c64)
    // - Clothing (6): deep charcoal-navy folds, dark slate midtones, crisp medium-dark slate highlights
    let fgR: number;
    let fgG: number;
    let fgB: number;
    let baseAlpha: number;
    let washAlpha = 0;

    if (reg === 1 || reg === 3) {
      // Hair, beard, mustache & brows: deep ink-black in curl valleys, rich dark charcoal on lit curl ridges
      fgR = 6 + s * 32;
      fgG = 9 + s * 36;
      fgB = 14 + s * 42;
      baseAlpha = 0.99 - s * 0.06;
      washAlpha = (1 - s * 0.52) * 0.26;
    } else if (reg === 5) {
      // Glasses: razor-sharp jet-black/charcoal rims with crisp dark slate specular glints
      if (s < 0.64) {
        const k = s / 0.64;
        fgR = 5 + k * 20;
        fgG = 8 + k * 24;
        fgB = 13 + k * 30;
        baseAlpha = 1.0;
        washAlpha = 0.28 * (1 - k * 0.35);
      } else {
        const k = (s - 0.64) / 0.36;
        fgR = 30 + k * 42;
        fgG = 38 + k * 46;
        fgB = 48 + k * 50;
        baseAlpha = 0.95 - k * 0.07;
        washAlpha = 0.13;
      }
    } else if (reg === 4) {
      // Eyes, nose contour & toothy smile: deep ink pupils/lashes/lip line, dark warm slate midtones, crisp medium-dark slate teeth
      if (s < 0.48) {
        const k = s / 0.48;
        fgR = 8 + k * 28;
        fgG = 11 + k * 30;
        fgB = 16 + k * 36;
        baseAlpha = 0.99;
        washAlpha = 0.25 * (1 - k * 0.4);
      } else if (s < 0.72) {
        const k = (s - 0.48) / 0.24;
        fgR = 36 + k * 34;
        fgG = 38 + k * 34;
        fgB = 44 + k * 34;
        baseAlpha = 0.95 - k * 0.05;
        washAlpha = 0.15 * (1 - k * 0.5);
      } else {
        // Teeth & eye catchlights: distinct medium-dark warm slate so every glyph stays clearly legible on #f4f1ea
        const k = (s - 0.72) / 0.28;
        fgR = 74 + k * 34;
        fgG = 72 + k * 34;
        fgB = 70 + k * 32;
        baseAlpha = 0.88 - k * 0.08;
        washAlpha = 0.05;
      }
    } else if (reg === 2) {
      // Facial & neck skin: deep charcoal jawline shadows, dark warm umber-slate midtones, dark-graphite highlights
      if (s < 0.38) {
        const k = s / 0.38;
        fgR = 18 + k * 26;
        fgG = 19 + k * 25;
        fgB = 23 + k * 25;
        baseAlpha = 0.98 - k * 0.03;
        washAlpha = 0.22 * (1 - k * 0.35);
      } else if (s < 0.68) {
        const k = (s - 0.38) / 0.30;
        fgR = 44 + k * 36;
        fgG = 42 + k * 34;
        fgB = 39 + k * 31;
        baseAlpha = 0.94 - k * 0.05;
        washAlpha = 0.14 * (1 - k * 0.45);
      } else {
        const k = (s - 0.68) / 0.32;
        fgR = 80 + k * 34;
        fgG = 76 + k * 32;
        fgB = 70 + k * 30;
        baseAlpha = 0.88 - k * 0.08;
        washAlpha = 0.06 * (1 - k * 0.5);
      }
    } else {
      // Clothing / patterned shirt (reg === 6): deep charcoal-navy folds, dark slate midtones, crisp medium-dark slate bands
      if (s < 0.40) {
        const k = s / 0.40;
        fgR = 12 + k * 26;
        fgG = 16 + k * 30;
        fgB = 22 + k * 36;
        baseAlpha = 0.98 - k * 0.03;
        washAlpha = 0.24 * (1 - k * 0.35);
      } else if (s < 0.70) {
        const k = (s - 0.40) / 0.30;
        fgR = 38 + k * 34;
        fgG = 46 + k * 36;
        fgB = 58 + k * 38;
        baseAlpha = 0.94 - k * 0.05;
        washAlpha = 0.14 * (1 - k * 0.45);
      } else {
        const k = (s - 0.70) / 0.30;
        fgR = 72 + k * 36;
        fgG = 80 + k * 36;
        fgB = 92 + k * 36;
        baseAlpha = 0.88 - k * 0.08;
        washAlpha = 0.06;
      }
    }

    // Rich dark burnt terracotta-orange accents strictly on shirt chevrons (reg === 6)
    if (reg === 6 && orangeW > 0.12) {
      const ob = clamp((orangeW - 0.12) * 0.95, 0, 0.78);
      fgR = fgR * (1 - ob) + (166 + 24 * s) * ob;
      fgG = fgG * (1 - ob) + (54 + 24 * s) * ob;
      fgB = fgB * (1 - ob) + (10 + 12 * s) * ob;
      baseAlpha = Math.max(baseAlpha, 0.94);
      washAlpha = Math.max(washAlpha, 0.14 * ob);
    }

    // Extra contour crispness along internal anatomical edges (glasses, eyes, smile, nose, curls)
    if (e > 0.36 && maskAlpha > 0.60) {
      const edgeDarken = (e - 0.36) * 0.42;
      fgR *= 1 - edgeDarken;
      fgG *= 1 - edgeDarken;
      fgB *= 1 - edgeDarken;
      baseAlpha = Math.min(1.0, baseAlpha + 0.10);
    }

    const rInt = clamp(Math.round(fgR), 0, 255);
    const gInt = clamp(Math.round(fgG), 0, 255);
    const bInt = clamp(Math.round(fgB), 0, 255);
    const finalAlpha = clamp(baseAlpha * contourOpacity, 0, 1.0);

    // When animating selected overlay cells on top of the cached light portrait, cleanly reset the cell to #f4f1ea first
    const interiorFeather = smoothstep(0.45, 0.88, maskAlpha);
    if (eraseUnderneath && interiorFeather > 0.20) {
      targetCtx.fillStyle = LIGHT_BG_COLOR;
      targetCtx.fillRect(drawX, drawY, fillW, fillH);
    }

    // Richer tonal paper wash inside the portrait interior so features have clear volume and presence in light mode
    const effWash = washAlpha * interiorFeather * fadeIn;
    if (effWash > 0.010) {
      targetCtx.fillStyle = `rgba(${rInt},${gInt},${bInt},${effWash.toFixed(3)})`;
      targetCtx.fillRect(drawX, drawY, fillW, fillH);
    }

    targetCtx.fillStyle = `rgba(${rInt},${gInt},${bInt},${finalAlpha.toFixed(3)})`;
    targetCtx.fillText(glyph, drawX + this.pCw * 0.5, drawY + this.pCh * 0.5 + 0.5);
  }

  /**
   * Pre-renders the complete, detailed 50%-glyph portrait onto both `this.portraitCanvas` (dark mode,
   * unchanged) and `this.portraitCanvasLight` (light mode, luminance-mapped charcoal/slate/warm-grey
   * palette with antialiased contour falloff and no black silhouette background).
   */
  private paintPortraitOffscreen() {
    const {
      dpr,
      width: W,
      height: H,
      pCols,
      pCw,
      pCh,
      portraitActiveCells,
      portraitShade,
      portraitEdge,
      portraitMaskAlpha,
      portraitMeta,
      portraitRowMinCol,
      portraitRowMaxCol,
      portraitCenterCol,
      portraitCenterRow,
    } = this;
    if (pCols === 0 || W === 0 || H === 0) return;

    this.portraitOffscreenW = Math.min(W, Math.ceil(this.portraitRightEdge + pCw * 6));
    this.portraitOffscreenH = H;
    const physW = Math.max(1, Math.round(this.portraitOffscreenW * dpr));
    const physH = Math.max(1, Math.round(this.portraitOffscreenH * dpr));
    this.portraitCanvas.width = physW;
    this.portraitCanvas.height = physH;
    this.portraitCanvasLight.width = physW;
    this.portraitCanvasLight.height = physH;

    const pCtx = this.portraitCanvas.getContext("2d");
    const pLightCtx = this.portraitCanvasLight.getContext("2d");
    if (!pCtx || !pLightCtx) return;

    const portraitFontPx = Math.max(4, Math.round(pCh * 0.78));
    const fontSpec = `600 ${portraitFontPx}px ${this.fontFamily}`;
    const fillW = Math.ceil(pCw + 0.5);
    const fillH = Math.ceil(pCh + 0.5);
    const nameLen = NAME_UPPER.length;

    // ── A. Dark-Mode Offscreen Portrait (Unchanged) ───────────────────────
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pCtx.clearRect(0, 0, this.portraitOffscreenW, this.portraitOffscreenH);
    pCtx.fillStyle = "#000000";
    this.fillPortraitBackgroundPath(pCtx, 0, 0);
    pCtx.font = fontSpec;
    pCtx.textAlign = "center";
    pCtx.textBaseline = "middle";

    // ── B. Light-Mode Offscreen Portrait (No Black Silhouette Backing) ────
    pLightCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pLightCtx.clearRect(0, 0, this.portraitOffscreenW, this.portraitOffscreenH);
    pLightCtx.font = `700 ${portraitFontPx}px ${this.fontFamily}`;
    pLightCtx.textAlign = "center";
    pLightCtx.textBaseline = "middle";

    for (let k = 0; k < portraitActiveCells.length; k++) {
      const i = portraitActiveCells[k];
      const col = i % pCols;
      const row = (i / pCols) | 0;
      const drawX = col * pCw;
      const drawY = row * pCh;

      const meta = portraitMeta[i];
      const reg = meta & 7;
      const orangeW = (meta >> 3) / 31;
      const s = clamp(portraitShade[i], 0.03, 1.0);
      const e = portraitEdge[i];
      const maskAlpha = portraitMaskAlpha[i];

      const charIdx = (((col - portraitCenterCol + (row - portraitCenterRow) * 5) % nameLen) + nameLen) % nameLen;
      const dither = BAYER_4X4[((row & 3) << 2) | (col & 3)] * 0.22;
      const useUpper = s + dither > 0.48 || (e > 0.52 && s > 0.32);
      const glyph = useUpper ? NAME_UPPER[charIdx] : NAME_LOWER[charIdx];

      // 1. Render onto Dark-Mode Offscreen Canvas
      const tr = 0.78 + 0.21 * s;
      const tg = 0.88 + 0.13 * s;
      const tb = 1.05 - 0.01 * s;
      const level = 16 + Math.pow(s, 1.08) * 234;
      const bgMul = reg >= 2 && reg <= 5 ? 0.36 : 0.20;

      const minC = portraitRowMinCol[row];
      const maxC = portraitRowMaxCol[row];
      const insideCoreBg = minC >= 0 && col >= minC + 1 && col <= maxC - 1;

      if (orangeW > 0.08) {
        const ob = Math.min(1, orangeW * 1.25);
        const fgR = Math.min(255, Math.round(level * tr * (1 - ob) + (178 + 77 * s) * ob));
        const fgG = Math.min(255, Math.round(level * tg * (1 - ob) + (64 + 106 * s) * ob));
        const fgB = Math.min(255, Math.round(level * tb * (1 - ob) + (10 + 50 * s) * ob));
        if (insideCoreBg) {
          pCtx.fillStyle = `rgb(${Math.min(255, Math.round(fgR * (bgMul * 0.78)))},${Math.min(255, Math.round(fgG * (bgMul * 0.72)))},${Math.min(255, Math.round(fgB * (bgMul * 0.65)))})`;
          pCtx.fillRect(drawX, drawY, fillW, fillH);
        }
        pCtx.fillStyle = `rgb(${fgR},${fgG},${fgB})`;
        pCtx.fillText(glyph, drawX + pCw * 0.5, drawY + pCh * 0.5 + 0.5);
      } else {
        const fgR = Math.min(255, Math.round(level * tr));
        const fgG = Math.min(255, Math.round(level * tg));
        const fgB = Math.min(255, Math.round(level * tb));
        if (insideCoreBg) {
          pCtx.fillStyle = `rgb(${Math.min(255, Math.round(fgR * bgMul))},${Math.min(255, Math.round(fgG * bgMul))},${Math.min(255, Math.round(fgB * bgMul))})`;
          pCtx.fillRect(drawX, drawY, fillW, fillH);
        }
        pCtx.fillStyle = `rgb(${fgR},${fgG},${fgB})`;
        pCtx.fillText(glyph, drawX + pCw * 0.5, drawY + pCh * 0.5 + 0.5);
      }

      // 2. Render onto Light-Mode Offscreen Canvas
      this.drawLightPortraitGlyphCell(
        pLightCtx,
        col,
        row,
        drawX,
        drawY,
        fillW,
        fillH,
        reg,
        s,
        e,
        orangeW,
        maskAlpha,
        1.0,
        charIdx,
        false,
      );
    }
  }

  private paintBackground() {
    const { width: W, height: H, dpr, cw, ch } = this;
    const gDark = this.bgDark.getContext("2d");
    if (gDark) {
      gDark.setTransform(dpr, 0, 0, dpr, 0, 0);
      gDark.fillStyle = DARK_BG_COLOR;
      gDark.fillRect(0, 0, W, H);
      paintGrid(gDark, W, H, cw, ch, dpr, "rgba(255,255,255,0.035)");
    }
    const gLight = this.bgLight.getContext("2d");
    if (gLight) {
      gLight.setTransform(dpr, 0, 0, dpr, 0, 0);
      gLight.fillStyle = LIGHT_BG_COLOR;
      gLight.fillRect(0, 0, W, H);
      paintGrid(gLight, W, H, cw, ch, dpr, "rgba(22,34,48,0.065)");
    }
  }

  render(world: World, dt: number) {
    const { ctx, dpr, cols, rows, cw, ch } = this;
    if (cols === 0) return;
    const t = world.time;

    if (this.portraitTarget && this.portraitProgress < 1) {
      this.portraitProgress = Math.min(1, this.portraitProgress + dt / this.portraitDuration);
    } else if (!this.portraitTarget && this.portraitProgress > 0) {
      this.portraitProgress = Math.max(0, this.portraitProgress - dt / this.portraitDuration);
    }
    world.portraitConvergence = this.portraitProgress;

    if (this.realRevealActive) {
      this.realRevealTime += dt;
      if (this.realRevealTime >= this.realRevealDuration) {
        this.realRevealActive = false;
        this.realRevealProgress = this.realRevealToReal ? 1 : 0;
      } else {
        const p = clamp(this.realRevealTime / this.realRevealDuration, 0, 1);
        const ease = 1 - Math.pow(1 - p, 1.55);
        this.realWaveMid = ease * this.realRevealMaxDist;
        this.realWaveOuter = this.realWaveMid + this.realWaveBand * 0.5;
        this.realWaveInner = this.realWaveMid - this.realWaveBand * 0.5;
        this.realRevealProgress = this.realRevealToReal ? ease : 1 - ease;
      }
    } else if (!this.realRevealDragging) {
      if (this.realRevealTarget && this.realRevealProgress < 1) {
        this.realRevealProgress = Math.min(1, this.realRevealProgress + dt / this.realRevealDuration);
      } else if (!this.realRevealTarget && this.realRevealProgress > 0) {
        this.realRevealProgress = Math.max(0, this.realRevealProgress - dt / this.realRevealDuration);
      }
    }

    if (this.transActive) {
      this.transTime += dt;
      if (this.transTime >= this.transDuration) {
        this.transActive = false;
        this.lightMode = this.transToLight;
      } else {
        const p = clamp(this.transTime / this.transDuration, 0, 1);
        const ease = 1 - Math.pow(1 - p, 2.15);
        const startOffset = cw * 4;
        this.waveOuter = -startOffset + ease * (this.transMaxDist + startOffset);
        this.waveMid = this.waveOuter - this.waveBand * 0.5;
        this.waveInner = this.waveOuter - this.waveBand;
      }
    }

    this.consumeEvents(world);
    this.updateCamera(world, dt);
    if (this.portraitProgress < 0.72) {
      this.rasterizeSharks(world.sharks, t);
    } else {
      this.sharkFlag.fill(0);
      this.sharkShadow.fill(0);
    }
    this.depositWake(world);
    this.diffuse(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.transActive) {
      ctx.drawImage(this.lightMode ? this.bgLight : this.bgDark, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      const fromBg = this.transFromLight ? this.bgLight : this.bgDark;
      const toBg = this.transToLight ? this.bgLight : this.bgDark;
      ctx.drawImage(fromBg, 0, 0);
      const coreR = Math.max(0, this.waveInner - cw * 3);
      if (coreR > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.transOriginX * dpr, this.transOriginY * dpr, coreR * dpr, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(toBg, 0, 0);
        ctx.restore();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Smoothly crossfade ASCII grid cells across the wavefront band.
      const boundR = Math.max(0, this.waveOuter + cw * 3);
      const rMin = Math.max(0, Math.floor((this.transOriginY - boundR) / ch));
      const rMax = Math.min(rows - 1, Math.ceil((this.transOriginY + boundR) / ch));
      const cMin = Math.max(0, Math.floor((this.transOriginX - boundR) / cw));
      const cMax = Math.min(cols - 1, Math.ceil((this.transOriginX + boundR) / cw));
      const innerR2 = Math.max(0, coreR - cw * 2) ** 2;
      const outerR2 = boundR ** 2;
      const bgSteps = this.transToLight ? this.bgTransToLightStyles : this.bgTransToDarkStyles;
      const maxStep = bgSteps.length - 1;
      for (let r = rMin; r <= rMax; r++) {
        const cy = r * ch + ch * 0.5 - this.transOriginY;
        const cy2 = cy * cy;
        for (let c = cMin; c <= cMax; c++) {
          const cx = c * cw + cw * 0.5 - this.transOriginX;
          const d2 = cx * cx + cy2;
          if (d2 < innerR2 || d2 > outerR2) continue;
          const prog = this.cellWaveProgress(c, r);
          if (prog <= 0.005) continue;
          const step = Math.round(prog * maxStep);
          ctx.fillStyle = bgSteps[step];
          ctx.fillRect(c * cw, r * ch, cw, ch);
        }
      }
    }

    this.markFish(world);
    this.drawDots(t);

    ctx.font = `600 ${Math.round(ch * 0.78)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (this.transActive) {
      this.drawMatrixWave(t);
    }
    this.drawHeat();
    if (this.portraitProgress < 0.72) {
      this.drawSharks(t);
    }
    if (this.portraitProgress > 0.001) {
      this.drawPortrait(world, t);
    }
    this.drawFish(world);
  }

  /**
   * Draws the expanding orange glyph matrix wavefront that originates at the toggle button
   * and spreads across the whole screen during a dark/light mode transition.
   */
  private drawMatrixWave(t: number) {
    const {
      ctx,
      cols,
      rows,
      cw,
      ch,
      waveInner,
      waveOuter,
      waveBand,
      transOriginX,
      transOriginY,
      fishStamp,
      frameId,
      sharkFlag,
    } = this;
    if (waveOuter <= 0) return;
    const rMin = Math.max(0, Math.floor((transOriginY - waveOuter - ch) / ch));
    const rMax = Math.min(rows - 1, Math.ceil((transOriginY + waveOuter + ch) / ch));
    const cMin = Math.max(0, Math.floor((transOriginX - waveOuter - cw) / cw));
    const cMax = Math.min(cols - 1, Math.ceil((transOriginX + waveOuter + cw) / cw));
    const nameLen = NAME_UPPER.length;
    const shadeCount = ORANGE_GLYPH_SHADES.length;

    for (let r = rMin; r <= rMax; r++) {
      const cy = r * ch + ch * 0.5 - transOriginY;
      for (let c = cMin; c <= cMax; c++) {
        const cx = c * cw + cw * 0.5 - transOriginX;
        const h = hash3(c, r, 73);
        const d = Math.hypot(cx, cy) + (h - 0.5) * cw * 4.5;
        if (d < waveInner || d > waveOuter) continue;

        const u = (waveOuter - d) / waveBand;
        const env = Math.sin(u * Math.PI);
        if (env < h * 0.58) continue;

        const x = c * cw;
        const y = r * ch;
        ctx.fillStyle = `rgba(255,108,24,${(0.18 * env).toFixed(3)})`;
        ctx.fillRect(x, y, cw, ch);

        const cellIdx = r * cols + c;
        if (fishStamp[cellIdx] === frameId || sharkFlag[cellIdx] !== 0) continue;

        const shadeIdx = (c * 3 + r * 5 + Math.floor(t * 16 + h * 9)) % shadeCount;
        const charIdx = (c + r * 6 + Math.floor(t * 24 + h * 15)) % nameLen;
        const glyph = (h > 0.42 ? NAME_UPPER : NAME_LOWER)[charIdx];
        ctx.fillStyle = ORANGE_GLYPH_SHADES[shadeIdx];
        ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
      }
    }
  }

  // ── simulation → field ──────────────────────────────────────────────

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private stamp(field: Float32Array, x: number, y: number, radius: number, amount: number) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }

  private consumeEvents(world: World) {
    for (const e of world.events) {
      if (e.kind === "eat") {
        this.stamp(this.heat, e.x, e.y, 2, 1);
        this.stamp(this.energy, e.x, e.y, 3, 0.9);
      } else {
        this.stamp(this.energy, e.x, e.y, 6, 1.4);
      }
    }
    world.events.length = 0;
  }

  /** Ease a parallax camera toward the pointer; near sharks shift more than far ones. */
  private updateCamera(world: World, dt: number) {
    const p = world.pointer;
    const tx = p.active && this.width ? (p.x / this.width) * 2 - 1 : 0;
    const ty = p.active && this.height ? (p.y / this.height) * 2 - 1 : 0;
    const k = Math.min(1, dt * 1.2);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
  }

  private depositWake(world: World) {
    const { energy } = this;
    // A faint trail: the field should read as water moved by the swimmers, not compete with them.
    for (const f of world.fish) {
      if (!f.alive) continue;
      const i = this.cellIndex(f.x, f.y);
      if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.004 + f.alarm * 0.02);
    }
    for (const sh of world.sharks) {
      // Only the sweeping tail sheds a wake, scaled by depth so distant sharks leave less.
      for (let k = SHARK_NODES - 4; k < SHARK_NODES; k++) {
        const i = this.cellIndex(sh.nodes[k * 2], sh.nodes[k * 2 + 1]);
        if (i >= 0) energy[i] = Math.min(1.6, energy[i] + (0.035 + sh.speed * 0.0007) * sh.depth);
      }
    }
    if (world.pointer.active) {
      this.stamp(energy, world.pointer.x, world.pointer.y, 1, 0.08);
    }
  }

  /** Blur + decay so wakes spread out like ripples and fade. */
  private diffuse(dt: number) {
    const { cols, rows, energy, energyTmp: tmp, heat } = this;
    const decay = Math.exp(-dt * 1.5);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? energy[i - 1] : energy[i];
        const rt = c < cols - 1 ? energy[i + 1] : energy[i];
        const u = r > 0 ? energy[i - cols] : energy[i];
        const d = r < rows - 1 ? energy[i + cols] : energy[i];
        tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.energy = tmp;
    this.energyTmp = energy;
    const heatDecay = Math.exp(-dt * 2.2);
    for (let i = 0; i < heat.length; i++) heat[i] *= heatDecay;
  }

  // ── sharks ──────────────────────────────────────────────────────────

  /**
   * Classify one point against the current shark (spine/arc already built).
   * Body coordinates: s along the spine (0 snout → 1 tail), v across it.
   * Writes hit* fields and returns whether the point is on the shark.
   */
  private sampleShark(px: number, py: number, L: number) {
    const { spine, arc } = this;
    const N = SHARK_NODES;
    let best = Infinity;
    let bestS = 0;
    let bestSign = 1;
    let bestNx = 0;
    let bestNy = 0;
    for (let k = 0; k < N - 1; k++) {
      const ax = spine[k * 2];
      const ay = spine[k * 2 + 1];
      const sx = spine[(k + 1) * 2] - ax;
      const sy = spine[(k + 1) * 2 + 1] - ay;
      const len2 = sx * sx + sy * sy || 1;
      // The last segment is extended past the tail tip so the caudal lobes can reach
      // beyond the spine (s > 1) and keep following the tail as it sweeps.
      const hi = k === N - 2 ? 1 + (L * TAIL_EXTENSION) / Math.sqrt(len2) : 1;
      const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, hi);
      const qx = ax + sx * u;
      const qy = ay + sy * u;
      const d2 = (px - qx) ** 2 + (py - qy) ** 2;
      if (d2 < best) {
        best = d2;
        const len = Math.sqrt(len2);
        bestS = (arc[k] + u * len) / this.arcTotal;
        bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
        bestNx = (-sy / len) * bestSign;
        bestNy = (sx / len) * bestSign;
      }
    }

    const a = Math.sqrt(best);
    const s = bestS;
    const u = s * L;
    const shape = this.shape;
    // Never thinner than ~1.5 cells, so small/distant sharks keep a solid body; the
    // floor fades out at the snout tip (stays pointed) and into the tail fork.
    const floor = this.minHalf * smoothstep(0, 0.1, s) * (1 - smoothstep(0.9, 1, s));
    const w = s >= 1 ? 0 : Math.max(shape.halfWidth(s) * L, floor);
    // How much this side of the body faces the light (screen-up, slightly left): +1 lit, -1 underside.
    const lightSide = bestNx * LIGHT_X + bestNy * LIGHT_Y;
    this.hitDist = a;
    this.hitS = s;
    this.hitV = a * bestSign;

    const head = this.shape.head;
    if (head && u < L * (head.sweep + head.depth + head.notch)) {
      // Cephalofoil: a wide wing across the snout, its tips swept back toward the eyes,
      // and on a great hammerhead a shallow notch in the middle of the front edge.
      const span = L * head.span;
      const r = a / span;
      const front = L * head.sweep * r * r + L * head.notch * Math.max(0, 1 - r / 0.14);
      // Full depth almost to the tips, so the wing reads as a solid bar rather than a thin line.
      const depth = L * head.depth * (1 - 0.2 * r * r * r * r);
      if (r <= 1 && u >= front && u <= front + depth) {
        this.hitFlag = FLAG_BODY;
        this.hitShade = 0.62 - 0.2 * r + (u < front + L * 0.012 ? 0.1 : 0);
        return true;
      }
    }

    if (a <= w) {
      const across = a / (w || 1);
      // Rounded back lit from above: a bright dorsal surface, midtone flanks, and the
      // side turned away from the light falling into a dark underside. Whole-body roll
      // during turns subtly shifts the dorsal highlight toward the outside of the turn.
      const facing = lightSide * across - this.sharkRoll * bestSign * across * 0.28;
      let shade = 0.6 - across * across * 0.36 + facing * 0.38;
      let flag = FLAG_BODY;
      // First dorsal fin (and on a lemon shark, the nearly equal second dorsal) seen from above:
      // a raised wedge that sweeps back past its base, at least half a cell wide so it never breaks up.
      const dSpan = shape.dorsal[1] - shape.dorsal[0];
      const dt = (s - shape.dorsal[0]) / (dSpan * 1.2);
      const dorsalHalf = dt > 0 && dt < 1 ? 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(dt, 0.7)), 0.6) : 0;
      const dorsalPx = dorsalHalf > 0.06 ? Math.max(dorsalHalf * w, this.cw * 0.55) : dorsalHalf * w;
      const d2Span = shape.secondDorsal[1] - shape.secondDorsal[0];
      const dt2 = (s - shape.secondDorsal[0]) / (d2Span * 1.2);
      const d2Half =
        shape === SHAPES.lemon && dt2 > 0 && dt2 < 1
          ? 0.28 * Math.pow(Math.sin(Math.PI * Math.pow(dt2, 0.7)), 0.6)
          : 0;
      const d2Px = d2Half > 0.06 ? Math.max(d2Half * w, this.cw * 0.5) : d2Half * w;
      if (a < dorsalPx || a < d2Px) {
        flag = FLAG_RIDGE;
        shade = 1;
      } else {
        // The fin casts a short shadow onto the side away from the light.
        if ((dorsalPx > 0 && a < dorsalPx + w * 0.22 && lightSide <= 0) || (d2Px > 0 && a < d2Px + w * 0.2 && lightSide <= 0)) {
          shade *= 0.55;
        }
        if (s > shape.secondDorsal[0] && s < shape.secondDorsal[1] && across < 0.4) {
          shade = Math.max(shade, 0.78);
        } else if (s > shape.gills[0] && s < shape.gills[1] && across > 0.58) {
          // Five gill slits.
          if (Math.floor(((s - shape.gills[0]) / (shape.gills[1] - shape.gills[0])) * 5) % 2 === 0) shade *= 0.45;
        } else if (s < 0.05) {
          // Slightly lighter snout tip.
          shade = Math.max(shade, 0.66);
        } else if (shape === SHAPES.zebra && s > 0.08 && s < 0.55 && (across < 0.1 || Math.abs(across - 0.6) < 0.08)) {
          // Zebra sharks carry pale ridges down the back.
          shade = Math.max(shade, 0.76);
        } else if (shape === SHAPES.whaleshark && this.whaleSpot(s, a * bestSign, L, across)) {
          // Whale sharks carry longitudinal ridges and a grid of pale dorsal spots.
          shade = Math.min(1, shade + 0.28);
        } else if (this.marked(s, a * bestSign, L, across)) {
          flag = FLAG_MARK;
        }
      }
      this.hitFlag = flag;
      this.hitShade = clamp(shade, 0, 1);
      return true;
    }

    const tip = Math.max(bestSign > 0 ? this.finTipRight : this.finTipLeft, this.cw * 2.2);
    const [p0, p1, p2] = shape.pectoral;
    if (
      inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&
      // Falcate (sickle) fins get a gently concave trailing edge; shallow enough that
      // the fin stays one solid piece at small sizes.
      !(shape.falcate && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.42), tip * 0.78, L * p2, tip))
    ) {
      this.hitFlag = this.marked(s, a * bestSign, L, 0) ? FLAG_MARK : FLAG_FIN;
      this.hitShade = 0.52 + 0.18 * (1 - clamp(a / tip, 0, 1)) + 0.1 * lightSide;
      return true;
    }
    const [v0, v1, v2, vr] = shape.pelvic;
    const pelvicReach = Math.max(L * vr, this.cw * 1.3);
    if (inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, pelvicReach)) {
      this.hitFlag = FLAG_FIN;
      this.hitShade = 0.44 + 0.08 * lightSide;
      return true;
    }
    if (shape.caudal > 0) {
      // Forked caudal fin: two crescent lobes swept back from the peduncle, with a clear
      // notch between them. Each lobe is a quad (root, bulging leading edge, tip, notch).
      const span = Math.max(L * shape.caudal, this.cw * 2.1);
      const rootU = L * 0.78;
      const tipU = L * (1 + TAIL_EXTENSION * 0.75);
      const notchU = L * 0.94;
      const leadU = L * 0.89;
      if (
        inTriangle(u, a, rootU, 0, leadU, span * 0.68, tipU, span) ||
        inTriangle(u, a, rootU, 0, tipU, span, notchU, 0)
      ) {
        this.hitFlag = FLAG_FIN;
        this.hitShade = 0.58 + 0.1 * lightSide - 0.1 * clamp(a / span, 0, 1);
        return true;
      }
    }
    return false;
  }

  /** Whale shark dorsal pattern: pale longitudinal ridges and checkerboard spots behind the gills. */
  private whaleSpot(s: number, v: number, L: number, across: number) {
    if (s < 0.14 || s > 0.86 || across > 0.88) return false;
    if (Math.abs(across - 0.36) < 0.045 || Math.abs(across - 0.68) < 0.045) return true;
    const gu = (s * L) / (L * 0.052);
    const gv = v / (L * 0.042);
    const cu = Math.floor(gu);
    const cv = Math.floor(gv);
    return (gu - cu - 0.5) ** 2 + (gv - cv - 0.5) ** 2 < 0.085;
  }

  /** Whether a body point (s along, v across) falls on a dark marking. */
  private marked(s: number, v: number, L: number, across: number) {
    if (this.shape === SHAPES.tiger) {
      // Wavy vertical bars over the back half, fading out toward the head.
      if (s < 0.2 || s > 0.9 || across > 0.85) return false;
      const wobble = 0.35 * Math.sin((v / L) * 25 + s * 5);
      const bar = Math.sin(s * Math.PI * 2 * 9 + wobble);
      return bar > 0.65 - 0.5 * smoothstep(0.2, 0.42, s) + 0.4 * smoothstep(0.8, 0.9, s);
    }
    if (this.shape === SHAPES.zebra) {
      // Leopard spots on a jittered grid, so they ride along with the skin.
      if (s < 0.07) return false;
      const gu = (s * L) / (L * 0.06);
      const gv = v / (L * 0.045);
      const cu = Math.floor(gu);
      const cv = Math.floor(gv);
      const jx = hash3(cu, cv, this.sharkId) * 0.5 + 0.25;
      const jy = hash3(cu, cv, this.sharkId + 11) * 0.5 + 0.25;
      return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < 0.08;
    }
    return false;
  }

  /**
   * Build a smooth, undulating render spine from the sim spine, then
   * supersample every cell in the shark's bounding box against the shape.
   * Fully covered cells become solid skin; partial cells become edge glyphs.
   */
  private rasterizeSharks(sharks: Shark[], _t: number) {
    const { sharkFlag, sharkShade, sharkKey, sharkDepth, sharkKind, sharkPalette, sharkShadow, spine, arc, cw, ch, cols, rows } = this;
    sharkFlag.fill(0);
    sharkShadow.fill(0);

    for (const sh of sharks) {
      const L = sh.length;
      const N = SHARK_NODES;
      const n = sh.nodes;
      const loco = SHARK_LOCOMOTION[sh.kind];
      this.shape = SHAPES[sh.kind];
      this.sharkId = sh.id;
      this.sharkRoll = sh.roll;
      const kindIndex = KINDS.indexOf(sh.kind);
      const paletteIndex = (sh.id - 1) % SHARK_PALETTES.length;

      // Parallax: near sharks shift against the pointer more than distant ones.
      const parX = -this.camX * (sh.depth - 0.5) * 30;
      const parY = -this.camY * (sh.depth - 0.5) * 20;

      // Whole-body travelling wave, y(s,t) = A(s) * sin(phase - lag(s)), shared by every part of the shark:
      //  - lag(s) grows linearly and reaches exactly PI at the pelvic fins, so the head and upper
      //    body are always half a cycle out of phase with the pelvic region: when the hips swing
      //    one way the head swings the other (the S-shaped body of a swimming shark).
      //  - A(s) starts at a clear head swing, dips to a minimum at a node (where the body swings
      //    least), then grows through the pelvic region and peduncle to the full tail sweep. The
      //    head swing shrinks with frontStiffness (stiff great white vs flexible lemon shark).
      const sPelvic = (this.shape.pelvic[0] + this.shape.pelvic[1]) / 2;
      const lagPerS = Math.PI / sPelvic;
      const nodeAt = loco.swayNode ?? 0.3;
      const headSwing = loco.tailAmp * (loco.headSway ?? 0.85 - 0.5 * loco.frontStiffness);
      const nodeAmp = 0.22 * headSwing;
      for (let k = 0; k < N; k++) {
        const s = k / (N - 1);
        const a = Math.max(0, k - 1);
        const b = Math.min(N - 1, k + 1);
        let tx = n[a * 2] - n[b * 2];
        let ty = n[a * 2 + 1] - n[b * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        // Smooth amplitude envelope (zero slope at the node, so no kink in the body line).
        const env =
          s < nodeAt
            ? nodeAmp + (headSwing - nodeAmp) * (1 - s / nodeAt) ** 2
            : nodeAmp + (loco.tailAmp - nodeAmp) * Math.pow((s - nodeAt) / (1 - nodeAt), loco.waveExp);
        const off = L * sh.strokeAmp * env * Math.sin(sh.phase - lagPerS * s);
        spine[k * 2] = n[k * 2] - ty * off + parX;
        spine[k * 2 + 1] = n[k * 2 + 1] + tx * off + parY;
      }
      arc[0] = 0;
      for (let k = 1; k < N; k++) {
        arc[k] =
          arc[k - 1] +
          Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
      }
      this.arcTotal = arc[N - 1] || 1;

      // Pectoral fins act as rigid hydrofoils/stabilizers (no continuous bird-like flapping):
      // during turns, whole-body banking foreshortens the inside fin and spreads the outside fin.
      const bank = clamp(sh.roll, -0.35, 0.35);
      const reachFin = this.shape.pectoral[3];
      this.finTipRight = L * reachFin * (1 - bank);
      this.finTipLeft = L * reachFin * (1 + bank);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < N; k++) {
        minX = Math.min(minX, spine[k * 2]);
        maxX = Math.max(maxX, spine[k * 2]);
        minY = Math.min(minY, spine[k * 2 + 1]);
        maxY = Math.max(maxY, spine[k * 2 + 1]);
      }
      const reach = L * 0.4;
      const c0 = Math.max(0, Math.floor((minX - reach) / cw));
      const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
      const r0 = Math.max(0, Math.floor((minY - reach) / ch));
      const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
      if (c0 > c1 || r0 > r1) continue;

      const skipBeyond = reach + Math.hypot(cw, ch);
      const shadowDc = Math.round((L * 0.035) / cw) + 1;
      const shadowDr = Math.round((L * 0.02) / ch) + 1;
      const anchorCol = Math.round(spine[6] / cw);
      const anchorRow = Math.round(spine[7] / ch);
      const nameLen = NAME_UPPER.length;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;
          const centerHit = this.sampleShark(x + cw / 2, y + ch / 2, L);
          if (!centerHit && this.hitDist > skipBeyond) continue;
          const flag = this.hitFlag;
          const shade = this.hitShade;
          const s = this.hitS;
          const v = this.hitV;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (this.sampleShark(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, L)) hits++;
          }
          if (hits === 0) continue;
          const coverage = hits / 5;

          const i = r * cols + c;
          // Sequential letter index anchored to the shark's torso grid cell so every row across
          // the shark body continuously spells "SAAYANCHOWDHURY" / "saayanchowdhury" left-to-right.
          const charIdx = (((c - anchorCol) + (r - anchorRow) * 6) % nameLen + nameLen) % nameLen;
          sharkKey[i] = charIdx;
          sharkDepth[i] = sh.depth;
          sharkKind[i] = kindIndex;
          sharkPalette[i] = paletteIndex;

          // Subtle mottled dorsal variation (as in real shark hide): slight organic lighter/darker
          // patches anchored to the skin so the surface feels matte and natural rather than flat.
          const mottle = (hash3(Math.round((s * L) / (cw * 2.2)), Math.round(v / (cw * 2.2)), sh.id + 19) - 0.5) * 0.08;
          // Solid when the centre is on the shark, or when most of the cell is covered (so
          // narrow fins and tail tips fill with solid glyphs instead of disintegrating into punctuation).
          const solid = centerHit ? coverage >= 0.4 : coverage >= 0.6;
          if (solid) {
            sharkFlag[i] = centerHit ? flag : FLAG_FIN;
            sharkShade[i] = centerHit ? clamp(shade + mottle, 0, 1) : 0.48;
            const sc = c + shadowDc;
            const sr = r + shadowDr;
            if (sc < cols && sr < rows) sharkShadow[sr * cols + sc] = 1;
          } else {
            sharkFlag[i] = FLAG_EDGE;
            sharkShade[i] = coverage;
          }
        }
      }
    }
  }

  private drawSharks(_t: number) {
    const {
      ctx,
      cols,
      rows,
      cw,
      ch,
      sharkFlag,
      sharkShade,
      sharkKey,
      sharkDepth,
      sharkKind,
      sharkPalette,
      portraitProgress,
    } = this;
    const n = cols * rows;
    const rgb = (l: number, r: number, g: number, b: number) =>
      `rgb(${Math.min(255, Math.round(l * r))},${Math.min(255, Math.round(l * g))},${Math.min(255, Math.round(l * b))})`;
    for (let i = 0; i < n; i++) {
      const flag = sharkFlag[i];
      if (!flag) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      if (portraitProgress > 0.001) {
        const detachThreshold = 0.04 + 0.62 * hash3(col, row, 53);
        if (portraitProgress >= detachThreshold) continue;
      }
      const x = col * cw;
      const y = row * ch;
      const charIdx = sharkKey[i] % NAME_UPPER.length;
      const shade = sharkShade[i];
      const depth = sharkDepth[i];
      const dim = 0.65 + 0.35 * depth;

      // Multi-tone colour ramp per shark: blend from shadow (low) → midtone (mid) → gold/bright highlight (high),
      // combined with the species' own tint so each shark has its own distinct multi-tone colour scheme.
      const pal = SHARK_PALETTES[sharkPalette[i]];
      const spTint = SHAPES[KINDS[sharkKind[i]]].tint;
      let pr: number, pg: number, pb: number;
      if (shade < 0.5) {
        const k = shade * 2;
        pr = pal.low[0] + (pal.mid[0] - pal.low[0]) * k;
        pg = pal.low[1] + (pal.mid[1] - pal.low[1]) * k;
        pb = pal.low[2] + (pal.mid[2] - pal.low[2]) * k;
      } else {
        const k = (shade - 0.5) * 2;
        pr = pal.mid[0] + (pal.high[0] - pal.mid[0]) * k;
        pg = pal.mid[1] + (pal.high[1] - pal.mid[1]) * k;
        pb = pal.mid[2] + (pal.high[2] - pal.mid[2]) * k;
      }
      // Subtle blend with species tint (stronger when non-classic species are chosen).
      const tr = pr * (0.7 + 0.3 * spTint[0]);
      const tg = pg * (0.7 + 0.3 * spTint[1]);
      const tb = pb * (0.7 + 0.3 * spTint[2]);

      if (flag === FLAG_EDGE) {
        // Anti-aliased silhouette edge using lowercase/uppercase name letters (no punctuation).
        const edgeGlyph = shade >= 0.5 ? NAME_UPPER[charIdx] : NAME_LOWER[charIdx];
        const cellLight = this.isCellLight(col, row);
        const edgeLevel = cellLight ? (44 + (1 - shade) * 38) * dim : (68 + shade * 62) * dim;
        ctx.fillStyle = rgb(edgeLevel, tr, tg, tb);
        ctx.fillText(edgeGlyph, x + cw / 2, y + ch / 2 + 1);
        continue;
      }

      const band = clamp(Math.floor(shade * TONE_LEVELS.length), 0, TONE_LEVELS.length - 1);
      let level: number;
      let glyph: string;
      const color: string | null = null;
      if (flag === FLAG_RIDGE) {
        level = 198;
        glyph = NAME_UPPER[charIdx];
      } else if (flag === FLAG_MARK) {
        level = 38;
        glyph = NAME_LOWER[charIdx];
      } else if (flag === FLAG_FIN) {
        // Fins and tail are darker charcoal / slate than the main dorsal body (as in the reference).
        level = TONE_LEVELS[band] * 0.78;
        glyph = band >= 3 ? NAME_UPPER[charIdx] : NAME_LOWER[charIdx];
      } else {
        level = TONE_LEVELS[band];
        glyph = band >= 2 ? NAME_UPPER[charIdx] : NAME_LOWER[charIdx];
      }
      level *= dim;

      const cellLight = this.isCellLight(col, row);
      if (cellLight) {
        // In light mode, give the body block a slightly deeper matte dorsal fill so the
        // shark silhouette stands out crisply against the warm light canvas (#f4f1ea).
        ctx.fillStyle = rgb(level * 0.44, tr, tg, tb);
        ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = color ?? rgb(Math.min(242, level * 1.16), tr, tg, tb);
        ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
      } else {
        // A matte dark-slate / brownish-charcoal block under each glyph gives the silhouette
        // solid mass (#1A2A3A – #4B3F36 range); the glyph on top carries the subtle dorsal tone.
        ctx.fillStyle = rgb(level * 0.34, tr, tg, tb);
        ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = color ?? rgb(level, tr, tg, tb);
        ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
      }
    }
  }

  /**
   * Blits the pre-rendered offscreen glyph portrait (`this.portraitCanvas` in dark mode or
   * `this.portraitCanvasLight` in light mode) and animates only selected feature/shimmer glyphs
   * on top (plus streaming flight glyphs during convergence and nearby particles in `drawFish`).
   */
  private drawPortrait(world: World, t: number) {
    const {
      ctx,
      cols,
      rows,
      pCols,
      pRows,
      pCw,
      pCh,
      width: W,
      height: H,
      lightMode,
      transActive,
      transToLight,
      transOriginX,
      transOriginY,
      waveMid,
      portraitProgress,
      portraitAnimatedCells,
      portraitFlightCells,
      portraitRowMinCol,
      portraitRowMaxCol,
      portraitShade,
      portraitEdge,
      portraitMaskAlpha,
      portraitMeta,
      portraitStartT,
      portraitCenterCol,
      portraitCenterRow,
      energy,
      camX,
      camY,
    } = this;
    const sharks = world.sharks;
    const sharkCount = sharks.length;
    const nameLen = NAME_UPPER.length;
    const isCompact = W < 760;

    // Gentle living breathing harmonic & subtle camera parallax once converged
    const breathPhase = Math.sin(t * 1.55);
    const breathY = breathPhase * 1.15;
    const baseShiftX = Math.min(0, -camX * 2.2);
    const baseShiftY = isCompact
      ? (-camY * 1.6 + breathY * 0.65)
      : Math.max(0, -camY * 1.6 + breathY * 0.65);

    // Radial orange glyph-matrix expansion state for toggling between glyph portrait and original portrait
    const maxCol = Math.min(pCols - 1, Math.ceil((this.portraitRightEdge + pCw * 4) / pCw));
    const showGlyphPortrait = this.realRevealActive || this.realRevealProgress < 0.999;
    const showRealPortrait = (this.realRevealActive || this.realRevealProgress > 0.001) && this.realPortraitLoaded;

    // 1. In dark mode only, fade in the 15%-reduced smooth black background during initial convergence
    const blackBgFade = smoothstep(0.08, 0.48, portraitProgress);
    const offscreenAlpha = smoothstep(0.16, 0.92, portraitProgress);
    if (!lightMode && !transActive && blackBgFade > 0.005 && offscreenAlpha < 0.995) {
      ctx.fillStyle = `rgba(0,0,0,${(blackBgFade * (1 - offscreenAlpha)).toFixed(3)})`;
      this.fillPortraitBackgroundPath(ctx, baseShiftX, baseShiftY);
    }

    // 2. Blit the pre-rendered offscreen glyph portrait texture (dark or light mode, or split across the theme wave)
    const skipGlyphOffscreen =
      this.realRevealActive && !this.realRevealToReal && this.realWaveMid <= 0.5;
    if (offscreenAlpha > 0.005 && showGlyphPortrait && !skipGlyphOffscreen && this.portraitOffscreenW > 0) {
      ctx.save();
      if (this.realRevealActive && this.realWaveMid > 0.5) {
        if (this.realRevealToReal) {
          // Real portrait is expanding inside the wave -> clip glyph portrait to OUTSIDE the wave
          ctx.beginPath();
          ctx.rect(0, 0, W, H);
          this.traceRealRevealWavePath(ctx);
          ctx.clip("evenodd");
        } else {
          // Glyph portrait is expanding inside the wave -> clip glyph portrait to INSIDE the wave
          ctx.beginPath();
          this.traceRealRevealWavePath(ctx);
          ctx.clip();
        }
      }
      if (offscreenAlpha < 0.999) {
        ctx.globalAlpha = offscreenAlpha;
      }

      if (!transActive) {
        ctx.drawImage(
          lightMode ? this.portraitCanvasLight : this.portraitCanvas,
          baseShiftX,
          baseShiftY,
          this.portraitOffscreenW,
          this.portraitOffscreenH,
        );
      } else {
        const fromCanvas = this.transFromLight ? this.portraitCanvasLight : this.portraitCanvas;
        const toCanvas = transToLight ? this.portraitCanvasLight : this.portraitCanvas;
        const rClip = Math.max(0, waveMid);

        // Outside the expanding wavefront: draw `fromCanvas`
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        if (rClip > 0) {
          ctx.arc(transOriginX, transOriginY, rClip, 0, Math.PI * 2, true);
        }
        ctx.clip();
        ctx.drawImage(fromCanvas, baseShiftX, baseShiftY, this.portraitOffscreenW, this.portraitOffscreenH);
        ctx.restore();

        // Inside the expanding wavefront: draw `toCanvas`
        if (rClip > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(transOriginX, transOriginY, rClip, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(toCanvas, baseShiftX, baseShiftY, this.portraitOffscreenW, this.portraitOffscreenH);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 3. Animate only selected glyphs on top of the offscreen glyph portrait
    const portraitFontPx = Math.max(4, Math.round(pCh * 0.78));
    ctx.font = `600 ${portraitFontPx}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fillW = Math.ceil(pCw + 0.5);
    const fillH = Math.ceil(pCh + 0.5);

    if (showGlyphPortrait) {
      const isTransitioningFlight = portraitProgress < 0.995;
      const cellList = isTransitioningFlight ? portraitFlightCells : portraitAnimatedCells;

      for (let k = 0; k < cellList.length; k++) {
        const i = cellList[k];
        const t0 = portraitStartT[i];
        const cellP = clamp((portraitProgress - t0) / 0.54, 0, 1);
        if (cellP <= 0.001) continue;

        const easeP = smoothstep(0, 1, cellP);
        const col = i % pCols;
        const row = (i / pCols) | 0;

        let drawX = col * pCw + baseShiftX;
        let drawY = row * pCh + baseShiftY;

        if (this.isPointShowingRealPortrait(drawX + pCw * 0.5, drawY + pCh * 0.5, col, row)) {
          continue;
        }

        const meta = portraitMeta[i];
        const reg = meta & 7;
        const orangeW = reg === 6 ? (meta >> 3) / 31 : 0;
        const s0 = portraitShade[i];
        const e = portraitEdge[i];
        const maskAlpha = portraitMaskAlpha[i];

        // While in flight (0 < easeP < 0.995), interpolate along a curved swirl trajectory from the assigned shark's spine
        if (easeP < 0.995 && sharkCount > 0) {
          const sh = sharks[(col * 3 + row * 5) % sharkCount];
          const nodeIdx = ((col * 7 + row * 11) % SHARK_NODES) * 2;
          const sx = sh.nodes[nodeIdx];
          const sy = sh.nodes[nodeIdx + 1];
          const dx = drawX - sx;
          const dy = drawY - sy;
          const dist = Math.hypot(dx, dy) || 1;
          const hSwirl = hash3(col, row, 97) - 0.5;
          const arcOffset = Math.sin(easeP * Math.PI) * hSwirl * Math.min(155, dist * 0.55);
          const perpX = -dy / dist;
          const perpY = dx / dist;
          drawX = sx + dx * easeP + perpX * arcOffset;
          drawY = sy + dy * easeP + perpY * arcOffset;
        }

        // Organic shimmer wave & wake energy modulation on selected overlay glyphs
        const shimmerWave =
          Math.sin(col * 0.045 - row * 0.035 + t * 2.15) * Math.cos(col * 0.02 + row * 0.045 - t * 1.35);
        const eCell = Math.min(rows - 1, row >> 1) * cols + Math.min(cols - 1, col >> 1);
        const wakeBoost = Math.min(0.18, energy[eCell] * 0.14);
        const shimmerAmp = reg >= 2 && reg <= 5 ? 0.028 : 0.045;
        const s = clamp(s0 + shimmerWave * shimmerAmp * easeP + wakeBoost, 0.03, 1.0);
        const fadeIn = smoothstep(0, 0.22, cellP);

        const cellIsLight = this.isCellLight(col >> 1, row >> 1);
        if (cellIsLight) {
          const lightShift = maskAlpha > 0.72 && e > 0.44 ? Math.floor(t * 3.2 + hash3(col, row, 31) * 6) : 0;
          const charIdx = (((col - portraitCenterCol + (row - portraitCenterRow) * 5 + lightShift) % nameLen) + nameLen) % nameLen;
          this.drawLightPortraitGlyphCell(
            ctx,
            col,
            row,
            drawX,
            drawY,
            fillW,
            fillH,
            reg,
            s,
            e,
            orangeW,
            maskAlpha,
            fadeIn,
            charIdx,
            easeP >= 0.995 && offscreenAlpha > 0.5,
          );
          continue;
        }

        // Dark-mode selected overlay glyph rendering
        const minC = portraitRowMinCol[row];
        const maxC = portraitRowMaxCol[row];
        const insideCoreBg = minC >= 0 && col >= minC + 1 && col <= maxC - 1;
        const shimmerShift = insideCoreBg && e > 0.44 ? Math.floor(t * 3.2 + hash3(col, row, 31) * 6) : 0;
        const charIdx = (((col - portraitCenterCol + (row - portraitCenterRow) * 5 + shimmerShift) % nameLen) + nameLen) % nameLen;
        const dither = BAYER_4X4[((row & 3) << 2) | (col & 3)] * 0.22;
        const useUpper = s + dither > 0.48 || (e > 0.52 && s > 0.32);
        const glyph = useUpper ? NAME_UPPER[charIdx] : NAME_LOWER[charIdx];

        const tr = 0.78 + 0.21 * s;
        const tg = 0.88 + 0.13 * s;
        const tb = 1.05 - 0.01 * s;
        const level = (16 + Math.pow(s, 1.08) * 234) * fadeIn;
        const bgMul = reg >= 2 && reg <= 5 ? 0.36 : 0.20;

        if (orangeW > 0.08) {
          const ob = Math.min(1, orangeW * 1.25 * (0.9 + 0.1 * Math.sin(t * 2.8 + col * 0.06)));
          const fgR = Math.min(255, Math.round(level * tr * (1 - ob) + (178 + 77 * s) * ob));
          const fgG = Math.min(255, Math.round(level * tg * (1 - ob) + (64 + 106 * s) * ob));
          const fgB = Math.min(255, Math.round(level * tb * (1 - ob) + (10 + 50 * s) * ob));
          if (insideCoreBg) {
            ctx.fillStyle = `rgb(${Math.min(255, Math.round(fgR * (bgMul * 0.78)))},${Math.min(255, Math.round(fgG * (bgMul * 0.72)))},${Math.min(255, Math.round(fgB * (bgMul * 0.65)))})`;
            ctx.fillRect(drawX, drawY, fillW, fillH);
          }
          ctx.fillStyle = `rgb(${fgR},${fgG},${fgB})`;
          ctx.fillText(glyph, drawX + pCw * 0.5, drawY + pCh * 0.5 + 0.5);
        } else {
          const fgR = Math.min(255, Math.round(level * tr));
          const fgG = Math.min(255, Math.round(level * tg));
          const fgB = Math.min(255, Math.round(level * tb));
          if (insideCoreBg) {
            ctx.fillStyle = `rgb(${Math.min(255, Math.round(fgR * bgMul))},${Math.min(255, Math.round(fgG * bgMul))},${Math.min(255, Math.round(fgB * bgMul))})`;
            ctx.fillRect(drawX, drawY, fillW, fillH);
          }
          ctx.fillStyle = `rgb(${fgR},${fgG},${fgB})`;
          ctx.fillText(glyph, drawX + pCw * 0.5, drawY + pCh * 0.5 + 0.5);
        }
      }
    }

    // 4. Render the original (real) portrait on its side of the radial wavefront
    const skipRealPortrait =
      this.realRevealActive && this.realRevealToReal && this.realWaveMid <= 0.5;
    if (showRealPortrait && !skipRealPortrait && offscreenAlpha > 0.005) {
      ctx.save();
      if (this.realRevealActive && this.realWaveMid > 0.5) {
        if (this.realRevealToReal) {
          // Real portrait is expanding inside the wave -> clip real portrait to INSIDE the wave
          ctx.beginPath();
          this.traceRealRevealWavePath(ctx);
          ctx.clip();
        } else {
          // Glyph portrait is expanding inside the wave -> clip real portrait to OUTSIDE the wave
          ctx.beginPath();
          ctx.rect(0, 0, W, H);
          this.traceRealRevealWavePath(ctx);
          ctx.clip("evenodd");
        }
      }
      if (offscreenAlpha < 0.999) {
        ctx.globalAlpha = offscreenAlpha;
      }

      if (!lightMode && !transActive) {
        ctx.fillStyle = "#000000";
        this.fillPortraitBackgroundPath(ctx, baseShiftX, baseShiftY);
      } else if (transActive) {
        const rClip = Math.max(0, waveMid);
        ctx.save();
        ctx.beginPath();
        if (transToLight) {
          // Dark mode is outside the theme wave
          ctx.rect(0, 0, W, H);
          if (rClip > 0) ctx.arc(transOriginX, transOriginY, rClip, 0, Math.PI * 2, true);
        } else if (rClip > 0) {
          // Dark mode is inside the theme wave
          ctx.arc(transOriginX, transOriginY, rClip, 0, Math.PI * 2);
        }
        ctx.clip();
        ctx.fillStyle = "#000000";
        this.fillPortraitBackgroundPath(ctx, baseShiftX, baseShiftY);
        ctx.restore();
      }

      const natW = this.realPortraitImg.naturalWidth || 768;
      const natH = this.realPortraitImg.naturalHeight || 916;
      // If uncropped 1086x1448 source is loaded, crop the top 153px of transparent padding so aspect (1086x1295 = 0.8386) matches the glyph portrait (0.83843)
      const srcY = natH / natW > 1.25 ? Math.round(natH * (153 / 1448)) : 0;
      const srcH = natH - srcY;
      ctx.drawImage(
        this.realPortraitImg,
        0,
        srcY,
        natW,
        srcH,
        this.portraitLeft + baseShiftX,
        this.portraitTop + baseShiftY,
        this.portraitWidth,
        this.portraitHeight + 2,
      );
      ctx.restore();
    }

    // 5. Draw the radial expanding orange glyph matrix wavefront spreading across the portrait from the click point
    //    at 30% of the default speed and with 7 symmetric glyph size bands across the wave:
    //    smallest (1.0x) -> smaller (1.25x) -> small (1.75x) -> largest (2.25x) -> small (1.75x) -> smaller (1.25x) -> smallest (1.0x)
    if (this.realRevealActive && this.realWaveOuter > 0) {
      const ox = this.realRevealOriginX;
      const oy = this.realRevealOriginY;
      const outerBound = this.realWaveOuter + pCh * 4;
      const innerBound = Math.max(0, this.realWaveInner - pCh * 4);
      const rWaveMin = Math.max(0, Math.floor((oy - outerBound) / pCh));
      const rWaveMax = Math.min(pRows - 1, Math.ceil((oy + outerBound) / pCh));
      const cWaveMin = Math.max(0, Math.floor((ox - outerBound) / pCw));
      const cWaveMax = Math.min(maxCol, Math.ceil((ox + outerBound) / pCw));
      const shadeCount = ORANGE_GLYPH_SHADES.length;

      // 4 size tiers corresponding to:
      // tier 0: smallest (1.00x) — bands 0 & 6
      // tier 1: smaller  (1.25x, +25%) — bands 1 & 5
      // tier 2: small    (1.75x, +75%) — bands 2 & 4
      // tier 3: largest  (2.25x, +125%) — band 3 (center crest)
      const TIER_SCALES = [1.0, 1.25, 1.75, 2.25];
      const BAND_TO_TIER = [0, 1, 2, 3, 2, 1, 0];
      const tierBuckets: {
        x: number;
        y: number;
        env: number;
        shadeIdx: number;
        glyph: string;
      }[][] = [[], [], [], []];

      for (let r = rWaveMin; r <= rWaveMax; r++) {
        const cy = r * pCh + pCh * 0.5 + baseShiftY;
        const dy = cy - oy;
        for (let c = cWaveMin; c <= cWaveMax; c++) {
          const idx = r * pCols + c;
          if ((portraitMeta[idx] & 7) === 0) continue;
          const cx = c * pCw + pCw * 0.5 + baseShiftX;
          const dx = cx - ox;
          const rawDist = Math.hypot(dx, dy);
          if (rawDist < innerBound || rawDist > outerBound) continue;

          const h = hash3(c, r, 79);
          const effDist = rawDist + (h - 0.5) * pCw * 5.2;
          if (effDist < this.realWaveInner || effDist > this.realWaveOuter) continue;

          const u = clamp((this.realWaveOuter - effDist) / this.realWaveBand, 0, 0.9999);
          const env = Math.sin(u * Math.PI);
          if (env < h * 0.42) continue;

          const bandIdx = Math.min(6, Math.max(0, Math.floor(u * 7)));
          const tier = BAND_TO_TIER[bandIdx];

          // Thin denser cells slightly in the larger glyph tiers so 1.75x and 2.25x glyphs read cleanly without crowding
          if (tier === 3 && ((r + c) & 1) !== 0 && h > 0.35) continue;
          if (tier === 2 && h > 0.72) continue;

          const x = c * pCw + baseShiftX;
          const y = r * pCh + baseShiftY;
          const shadeIdx = (c * 3 + r * 5 + Math.floor(t * 5.4 + h * 9)) % shadeCount;
          const charIdx = (c + r * 6 + Math.floor(t * 7.8 + h * 15)) % nameLen;
          const glyph = (h > 0.4 ? NAME_UPPER : NAME_LOWER)[charIdx];

          tierBuckets[tier].push({ x, y, env, shadeIdx, glyph });
        }
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let tier = 0; tier < 4; tier++) {
        const bucket = tierBuckets[tier];
        if (!bucket.length) continue;
        const scale = TIER_SCALES[tier];
        const fontPx = (portraitFontPx * scale).toFixed(2);
        ctx.font = `600 ${fontPx}px ${this.fontFamily}`;
        const cellWScaled = fillW * scale;
        const cellHScaled = fillH * scale;

        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          const centerX = item.x + pCw * 0.5;
          const centerY = item.y + pCh * 0.5;
          ctx.fillStyle = `rgba(255,108,24,${(0.28 * item.env).toFixed(3)})`;
          ctx.fillRect(
            centerX - cellWScaled * 0.5,
            centerY - cellHScaled * 0.5,
            cellWScaled,
            cellHScaled,
          );
          ctx.fillStyle = ORANGE_GLYPH_SHADES[item.shadeIdx];
          ctx.fillText(item.glyph, centerX, centerY + 0.5);
        }
      }
    }

  }

  // ── fish, dots, heat ────────────────────────────────────────────────

  /**
   * Bucket floating particles into two depth layers by brightness:
   *   - 2nd layer below ('・'): deeper particles (depth < 0.78)
   *   - 1st layer above ('-'): nearer particles (depth >= 0.78)
   * Drawn at continuous floating-point coordinates so motion is locked to 60 fps with zero grid-snap stutter.
   */
  private markFish(world: World) {
    const { fishStamp, dotLayerBuckets, dashLayerBuckets, sharkFlag } = this;
    const frame = ++this.frameId;
    for (const bucket of dotLayerBuckets) bucket.length = 0;
    for (const bucket of dashLayerBuckets) bucket.length = 0;

    const fish = world.fish;
    for (let idx = 0; idx < fish.length; idx++) {
      const f = fish[idx];
      if (!f.alive) continue;
      const parX = -this.camX * (f.depth - 0.5) * 18;
      const parY = -this.camY * (f.depth - 0.5) * 12;
      const cell = this.cellIndex(f.x + parX, f.y + parY);
      if (cell < 0 || sharkFlag[cell]) continue;
      fishStamp[cell] = frame;
      const glint = clamp(Math.abs(f.turn) / 3.5, 0, 1);
      const v = 0.3 + (0.4 * (f.depth - 0.55)) / 0.45 + 0.3 * Math.max(glint, f.alarm);
      const b = clamp(Math.floor(v * FISH_ALPHAS.length), 0, FISH_ALPHAS.length - 1);
      if (f.depth < 0.78) {
        dotLayerBuckets[b].push(idx);
      } else {
        dashLayerBuckets[b].push(idx);
      }
    }
  }

  private drawFish(world: World) {
    const {
      ctx,
      dotLayerBuckets,
      dashLayerBuckets,
      transActive,
      lightMode,
      camX,
      camY,
      portraitProgress,
      portraitParticleAnchors,
    } = this;
    const fish = world.fish;
    const t = world.time;
    const anchorCount = portraitParticleAnchors.length;
    const converging = portraitProgress > 0.001 && anchorCount > 0;
    const breathY = Math.sin(t * 1.55) * 1.15;

    const isOvertakenByRealPortrait = (x: number, y: number) => {
      if (!this.realRevealActive && this.realRevealProgress <= 0.001) return false;
      if (x > this.portraitRightEdge + this.cw * 2 || y < this.portraitTop - this.ch * 2) return false;
      const pc = clamp(Math.floor(x / this.pCw), 0, this.pCols - 1);
      const pr = clamp(Math.floor(y / this.pCh), 0, this.pRows - 1);
      if ((this.portraitMeta[pr * this.pCols + pc] & 7) === 0) return false;
      return this.isPointShowingRealPortrait(x, y, pc, pr);
    };

    // Discrete time and cell-snapping so floaty particles move discretely at the same FPS/grid cadence as glyph sharks
    const cw = this.cw;
    const ch = this.ch;
    const tDiscrete = Math.floor(t * 12) / 12;
    const discreteBreathY = Math.sin(tDiscrete * 1.55) * 1.15;
    const snapToGrid = (px: number, py: number) => ({
      x: Math.floor(px / cw) * cw + cw * 0.5,
      y: Math.floor(py / ch) * ch + ch * 0.5 + 1,
    });

    // Helper to compute discrete grid-snapped particle position for particle index `idx`
    const getParticlePos = (idx: number, ox: number, oy: number) => {
      if (!converging) return snapToGrid(ox, oy);
      const anchor = portraitParticleAnchors[idx % anchorCount];
      const delay = (idx % 23) * 0.015;
      const localP = clamp((portraitProgress - delay) / (1 - delay), 0, 1);
      const easeP = smoothstep(0, 1, localP);
      const orbitAmp = anchor.orbit;
      const tx = anchor.x + Math.cos(tDiscrete * 2.1 + anchor.phase) * orbitAmp - camX * 4;
      const ty = anchor.y + Math.sin(tDiscrete * 1.7 + anchor.phase) * orbitAmp + discreteBreathY - camY * 3;
      const dx = tx - ox;
      const dy = ty - oy;
      const dist = Math.hypot(dx, dy) || 1;
      const swirl = Math.sin(easeP * Math.PI) * (((idx & 1) === 0 ? 1 : -1) * Math.min(95, dist * 0.38));
      return snapToGrid(
        ox + dx * easeP + (-dy / dist) * swirl,
        oy + dy * easeP + (dx / dist) * swirl,
      );
    };

    // 1. Draw the 2nd layer below using the '・' symbol at smooth 60 fps coordinates.
    for (let b = 0; b < dotLayerBuckets.length; b++) {
      const bucket = dotLayerBuckets[b];
      if (!bucket.length) continue;
      if (!transActive) {
        ctx.fillStyle = lightMode ? this.dotParticleStylesLight[b] : this.dotParticleStylesDark[b];
        for (const idx of bucket) {
          const f = fish[idx];
          const ox = f.x - camX * (f.depth - 0.5) * 18;
          const oy = f.y - camY * (f.depth - 0.5) * 12;
          const pos = getParticlePos(idx, ox, oy);
          if (converging && isOvertakenByRealPortrait(pos.x, pos.y)) continue;
          ctx.fillText("・", pos.x, pos.y);
        }
      } else {
        const transStyles = this.dotParticleTransStyles[b];
        const maxStep = transStyles.length - 1;
        for (const idx of bucket) {
          const f = fish[idx];
          const ox = f.x - camX * (f.depth - 0.5) * 18;
          const oy = f.y - camY * (f.depth - 0.5) * 12;
          const pos = getParticlePos(idx, ox, oy);
          if (converging && isOvertakenByRealPortrait(pos.x, pos.y)) continue;
          const blend = this.getPointLightBlend(pos.x, pos.y);
          ctx.fillStyle = transStyles[Math.round(blend * maxStep)];
          ctx.fillText("・", pos.x, pos.y);
        }
      }
    }

    // 2. Draw the 1st layer above using the '-' symbol at smooth 60 fps coordinates.
    for (let b = 0; b < dashLayerBuckets.length; b++) {
      const bucket = dashLayerBuckets[b];
      if (!bucket.length) continue;
      if (!transActive) {
        ctx.fillStyle = lightMode ? this.fishStylesLight[b] : this.fishStylesDark[b];
        for (const idx of bucket) {
          const f = fish[idx];
          const ox = f.x - camX * (f.depth - 0.5) * 18;
          const oy = f.y - camY * (f.depth - 0.5) * 12;
          const pos = getParticlePos(idx, ox, oy);
          if (converging && isOvertakenByRealPortrait(pos.x, pos.y)) continue;
          ctx.fillText("-", pos.x, pos.y);
        }
      } else {
        const transStyles = this.dashParticleTransStyles[b];
        const maxStep = transStyles.length - 1;
        for (const idx of bucket) {
          const f = fish[idx];
          const ox = f.x - camX * (f.depth - 0.5) * 18;
          const oy = f.y - camY * (f.depth - 0.5) * 12;
          const pos = getParticlePos(idx, ox, oy);
          if (converging && isOvertakenByRealPortrait(pos.x, pos.y)) continue;
          const blend = this.getPointLightBlend(pos.x, pos.y);
          ctx.fillStyle = transStyles[Math.round(blend * maxStep)];
          ctx.fillText("-", pos.x, pos.y);
        }
      }
    }

    // 3. Supplemental portrait contour & curl particles ('・' and '-') that stream from the sharks
    //    to trace the loose curly hair wisps, glasses frames, beard texture, orange shirt chevrons,
    //    and sparse particles dispersing beyond the silhouette.
    if (converging && world.sharks.length > 0) {
      const sharks = world.sharks;
      const startIdx = Math.min(fish.length, anchorCount);
      for (let idx = startIdx; idx < anchorCount; idx++) {
        const anchor = portraitParticleAnchors[idx];
        const delay = 0.08 + (idx % 19) * 0.018;
        const localP = clamp((portraitProgress - delay) / (0.88 - delay), 0, 1);
        if (localP <= 0.01) continue;
        const easeP = smoothstep(0, 1, localP);
        const sh = sharks[idx % sharks.length];
        const nodeIdx = ((idx * 5) % SHARK_NODES) * 2;
        const sx = sh.nodes[nodeIdx];
        const sy = sh.nodes[nodeIdx + 1];
        const orbitAmp = anchor.orbit;
        const tx = anchor.x + Math.cos(tDiscrete * 2.2 + anchor.phase) * orbitAmp - camX * 5;
        const ty = anchor.y + Math.sin(tDiscrete * 1.8 + anchor.phase) * orbitAmp + discreteBreathY - camY * 3.5;
        const rawPx = sx + (tx - sx) * easeP;
        const rawPy = sy + (ty - sy) * easeP;
        const px = Math.floor(rawPx / cw) * cw + cw * 0.5;
        const py = Math.floor(rawPy / ch) * ch + ch * 0.5 + 1;
        if (isOvertakenByRealPortrait(px, py)) continue;

        const ptLight = this.isCellLight(Math.floor(px / this.cw), Math.floor(py / this.ch));
        if (anchor.orange > 0.24) {
          ctx.fillStyle = ptLight ? "rgba(162,54,12,0.88)" : ORANGE_GLYPH_SHADES[idx % ORANGE_GLYPH_SHADES.length];
        } else if (ptLight) {
          ctx.fillStyle =
            anchor.layer === 1
              ? this.fishStylesLight[anchor.bucket]
              : this.dotParticleStylesLight[anchor.bucket];
        } else {
          ctx.fillStyle =
            anchor.layer === 1
              ? this.fishStylesDark[anchor.bucket]
              : this.dotParticleStylesDark[anchor.bucket];
        }
        ctx.fillText(anchor.layer === 1 ? "-" : "・", px, py);
      }
    }
  }

  private drawHeat() {
    const { ctx, heat, cols, cw, ch } = this;
    for (let i = 0; i < heat.length; i++) {
      const h = heat[i];
      if (h < 0.08) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      ctx.fillStyle = h > 0.5 ? `rgba(255,120,60,${h.toFixed(2)})` : `rgba(220,40,40,${(h * 1.6).toFixed(2)})`;
      ctx.fillText(h > 0.6 ? "*" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
    }
  }

  /**
   * Every cell's dot twinkles on its own clock, is modulated by slow
   * caustic light bands, and flares cyan where the wake field is strong.
   * Dots are bucketed by colour/alpha so each bucket is one fillStyle.
   */
  private drawDots(t: number) {
    const { ctx, cols, rows, cw, ch, dotKind, dotPhase, dotFreq, energy, sharkFlag, sharkShadow, fishStamp, frameId } = this;
    const { bucketOf, bucketOrder, bucketCounts, transActive, lightMode } = this;
    const n = cols * rows;
    const SKIP = bucketCounts.length - 1;
    bucketCounts.fill(0);

    for (let i = 0; i < n; i++) {
      const e = energy[i];
      const kind = dotKind[i];
      if (sharkFlag[i]) {
        bucketOf[i] = SKIP;
        continue;
      }
      const col = i % cols;
      const row = (i / cols) | 0;
      if (this.portraitProgress > 0.25) {
        const pRow = Math.min(this.pRows - 1, row << 1);
        const pCol = Math.min(this.pCols - 1, col << 1);
        if (this.isCellLight(col, row)) {
          if (this.portraitMaskAlpha[pRow * this.pCols + pCol] > 0.62) {
            bucketOf[i] = SKIP;
            continue;
          }
        } else {
          const minC = this.portraitRowMinCol[pRow];
          if (minC >= 0 && pCol >= minC && pCol <= this.portraitRowMaxCol[pRow]) {
            bucketOf[i] = SKIP;
            continue;
          }
        }
      }
      if (sharkShadow[i] && this.isCellLight(col, row)) {
        ctx.fillStyle = "rgba(22,34,48,0.075)";
        ctx.fillRect(col * cw, row * ch, cw, ch);
      }
      if (fishStamp[i] === frameId || (kind === 0 && e < 0.45)) {
        bucketOf[i] = SKIP;
        continue;
      }
      let bucket: number;
      if (e > 0.45) {
        const level = clamp(Math.floor((e - 0.45) * 5), 0, ALPHA_LEVELS - 1);
        bucket = WAKE * ALPHA_LEVELS + level;
      } else {
        // Dots stay bright and crisp; the twinkle is a gentle breathe, not a fade.
        const twinkle = 0.5 + 0.5 * Math.sin(t * dotFreq[i] + dotPhase[i]);
        const caustic = 0.85 + 0.15 * Math.sin(col * 0.11 + t * 0.35) * Math.sin(row * 0.17 - t * 0.27);
        let v = clamp((0.55 + 0.45 * twinkle) * caustic + e * 2, 0, 1);
        if (sharkShadow[i]) v *= 0.2;
        bucket = (kind - 1) * ALPHA_LEVELS + clamp(Math.floor(v * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
      }
      bucketOf[i] = bucket;
      bucketCounts[bucket]++;
    }

    // Counting sort cells by bucket.
    const starts = new Int32Array(bucketCounts.length);
    for (let b = 1; b < bucketCounts.length; b++) starts[b] = starts[b - 1] + bucketCounts[b - 1];
    const cursor = starts.slice();
    for (let i = 0; i < n; i++) {
      const b = bucketOf[i];
      if (b !== SKIP) bucketOrder[cursor[b]++] = i;
    }

    // Wake dots stay small and soft (half alpha) so they trail the swimmers without competing.
    const size = Math.max(2, Math.round(cw * 0.22));
    for (let b = 0; b < SKIP; b++) {
      const count = bucketCounts[b];
      if (!count) continue;
      const start = starts[b];
      if (!transActive) {
        ctx.fillStyle = lightMode ? this.dotStylesLight[b] : this.dotStylesDark[b];
        for (let k = start; k < start + count; k++) {
          const i = bucketOrder[k];
          const col = i % cols;
          const row = (i / cols) | 0;
          ctx.fillRect(Math.round(col * cw + cw * 0.66 - size / 2), Math.round(row * ch + ch * 0.64 - size / 2), size, size);
        }
      } else {
        const darkStyle = this.dotStylesDark[b];
        const lightStyle = this.dotStylesLight[b];
        for (let k = start; k < start + count; k++) {
          const i = bucketOrder[k];
          const col = i % cols;
          const row = (i / cols) | 0;
          ctx.fillStyle = this.isCellLight(col, row) ? lightStyle : darkStyle;
          ctx.fillRect(Math.round(col * cw + cw * 0.66 - size / 2), Math.round(row * ch + ch * 0.64 - size / 2), size, size);
        }
      }
    }
  }
}
