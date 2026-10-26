/**
 * Artificial-life sim for the hero: tiny fish schools and the sharks that hunt them.
 *
 * Fish: Reynolds boids (separation / alignment / cohesion) in Couzin-style
 * zones, with a blind spot behind each fish. Alarm spreads from fish to fish
 * through the school (a "wave of agitation"), so a whole school bolts even
 * when only its edge can see the shark. Fleeing fish break sideways around the
 * shark's path, which gives the fountain effect seen in real bait balls.
 *
 * Sharks: Reynolds steering (wander + pursuit + separation) on a
 * follow-the-leader spine. Hunger builds over time and drops when they eat.
 * They prefer fish in sparse spots, since dense schools confuse predators,
 * so stragglers get picked off. Eaten fish come back later as new schools
 * swimming in from the edges, which keeps the population steady.
 */
import { angleDiff, clamp, current, rand, randInt, smoothstep, TAU } from "./math";
import { pickSpecies, SPECIES } from "./species";

export const SHARK_NODES = 20;

export type SharkKind =
  | "classic"
  | "greatwhite"
  | "hammerhead"
  | "whaleshark"
  | "lemon"
  | "zebra"
  | "tiger"
  | "greathammer"
  | "mako"
  | "thresher"
  | "nurse";

/**
 * Which sharks to put in the water. Each shark is drawn at its real-world scale; `size` is an
 * optional multiplier on that length (default 1).
 */
export type SharkSpec = { kind: SharkKind; size?: number };

/**
 * Average adult length in metres, used to scale every shark against the others.
 * Great white, hammerhead (scalloped), lemon and whale shark follow the size-comparison chart;
 * the remaining species use typical adult averages.
 */
export const SHARK_LENGTH_M: Record<SharkKind, number> = {
  greatwhite: 5.625,
  hammerhead: 4.375,
  lemon: 3.5,
  whaleshark: 10,
  classic: 4.5,
  tiger: 3.5,
  greathammer: 4.5,
  mako: 3,
  thresher: 4.5,
  zebra: 2.5,
  nurse: 2.5,
};

/** Maximum number of sharks allowed in the ocean at any time. */
export const MAX_SHARKS = 4;

/** Every shark except the whale shark is drawn 30% larger than its real-scale length. */
const NON_WHALE_SCALE = 1.3;

// The landing hero: 4 distinct species at different depths/sizes:
// Great white, hammerhead, whale shark, and lemon shark.
const DEFAULT_SHARKS: SharkSpec[] = [
  { kind: "whaleshark" },
  { kind: "greatwhite" },
  { kind: "hammerhead" },
  { kind: "lemon" },
];

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
  /** 0 calm → 1 panicking. Spreads to neighbours. */
  alarm: number;
  alive: boolean;
  respawnAt: number;
  /** Tail-beat phase. */
  phase: number;
  /** Smoothed angular velocity (rad/s); hard turns flash silver. */
  turn: number;
  /** 0.55 far → 1 near. */
  depth: number;
  /** Rotation sense shared by a school when it mills into a bait ball. */
  millDir: 1 | -1;
}

export interface SharkLocomotion {
  /** Base cruise speed in px/s (before size scaling) and length multiplier. */
  cruiseBase: number;
  cruiseLengthK: number;
  /** Speed multiplier during hunting acceleration bursts. */
  burstMult: number;
  /** Tail-beat frequency in Hz during ordinary cruise (phase advances by 2π · f · dt). */
  tailFreqHz: number;
  /** Additional Hz per px/s of speed above/below cruise. */
  tailSpeedHz: number;
  /** Forward-body stiffness: 0 → flexible front torso, 1 → very rigid head & front torso. */
  frontStiffness: number;
  /** Spine fraction s (behind the pelvic region) where the sinusoidal tail wave begins. */
  tailStart: number;
  /** Exponent p of the tail wave envelope A(u) = aTail · u^p over u in [0, 1]. */
  waveExp: number;
  /** Head/snout lateral recoil amplitude as a fraction of length (a0). */
  headAmp: number;
  /** Tail-tip lateral sweep amplitude as a fraction of length (aTail). */
  tailAmp: number;
  /** Spatial wavenumber k (radians of phase lag across the tail section u in [0, 1]). */
  waveNumber: number;
  /**
   * Head swing amplitude as a fraction of tailAmp (default 0.85 - 0.5 * frontStiffness). The head
   * sits half a wavelength out of phase with the pelvic region, so the upper body always swings
   * against the hips, and this sets how far.
   */
  headSway?: number;
  /** Spine fraction s of the lateral-motion node, where the body swings least (default 0.3). */
  swayNode?: number;
  /** Maximum per-joint bend angle (rad) on the follow-the-leader spine. */
  maxSpineBend: number;
  /** How quickly the rear spine straightens back behind the head after a turn. */
  spineStraighten: number;
  /** Cruising turn agility (rad/s) and minimum turning-radius factor (larger = wider turns). */
  turnAgility: number;
  turnRadiusK: number;
  /** Straight-course hold duration range [min, max] in seconds between turns. */
  courseHold: [number, number];
  /** Whole-body roll/bank sensitivity during turns (foreshortens inside fin, shifts dorsal light). */
  bankFactor: number;
  /** Minimum stroke envelope during periodic unpowered glides (1 = continuous, <1 = glides). */
  glideFloor: number;
  /** Period (s) of the cruise/glide cycle. */
  glidePeriod: number;
}

/**
 * One shared swimming style for every shark: the whale shark's slow, heavy, deliberate cruise
 * (0.35–0.65 Hz tail beat, wide gentle turns, long unpowered glides, and a whole-body S-wave with
 * the head swinging against the hips). All species use it, so they differ only in shape and size.
 */
const WHALE_SHARK_MOTION: SharkLocomotion = {
  cruiseBase: 10,
  cruiseLengthK: 0.042,
  burstMult: 1.15,
  tailFreqHz: 0.62,
  tailSpeedHz: 0.0025,
  frontStiffness: 0.84,
  tailStart: 0.59,
  waveExp: 1.35,
  headAmp: 0.001,
  tailAmp: 0.074,
  waveNumber: 2.1,
  headSway: 0.44,
  swayNode: 0.32,
  maxSpineBend: 0.045,
  spineStraighten: 1.7,
  turnAgility: 0.34,
  turnRadiusK: 0.32,
  courseHold: [4.5, 7.0],
  bankFactor: 0.24,
  glideFloor: 0.45,
  glidePeriod: 11.0,
};

/** Every kind uses the same motion profile. */
export const SHARK_LOCOMOTION: Record<SharkKind, SharkLocomotion> = {
  classic: WHALE_SHARK_MOTION,
  greatwhite: WHALE_SHARK_MOTION,
  hammerhead: WHALE_SHARK_MOTION,
  whaleshark: WHALE_SHARK_MOTION,
  lemon: WHALE_SHARK_MOTION,
  zebra: WHALE_SHARK_MOTION,
  tiger: WHALE_SHARK_MOTION,
  greathammer: WHALE_SHARK_MOTION,
  mako: WHALE_SHARK_MOTION,
  thresher: WHALE_SHARK_MOTION,
  nurse: WHALE_SHARK_MOTION,
};

export interface Shark {
  id: number;
  kind: SharkKind;
  length: number;
  /** Spine positions, snout first: [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  heading: number;
  speed: number;
  /** Tail-beat phase; drives the body wave in the renderer. */
  phase: number;
  /** Smoothed tail-stroke amplitude envelope (0.45 during a glide → 1.3 during a burst). */
  strokeAmp: number;
  /** 0 cruising → 1 full acceleration lunge. Rises quickly, recovers slowly. */
  burst: number;
  /** Smoothed angular velocity (rad/s); the shark banks its fins into turns. */
  turn: number;
  /** Smoothed whole-body roll angle (-1..1) during turns and hammerhead banking. */
  roll: number;
  /** Target heading held along a straight glide path between turns. */
  courseHeading: number;
  /** World time when the shark will pick its next straight course (every 3–7 s). */
  nextTurnAt: number;
  hunger: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  target: Fish | null;
  retargetAt: number;
  /** Whether the shark's snout has entered the viewport on its current diagonal transit. */
  hasEntered: boolean;
  /** 0 far / dim → 1 near / bright. */
  depth: number;
}

export interface WorldEvent {
  kind: "eat" | "splash";
  x: number;
  y: number;
}

const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const BLIND_COS = -0.6; // ~127° either side of the heading is visible

/**
 * Lemon shark and Whale shark move primarily from bottom-left to top-right;
 * all other species (Great White, Hammerhead, etc.) move top-right to bottom-left.
 */
function isBottomLeftToTopRight(kind: SharkKind): boolean {
  return kind === "lemon" || kind === "whaleshark";
}

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  sharks: Shark[] = [];
  events: WorldEvent[] = [];
  pointer = { x: 0, y: 0, active: false };
  /** 0 = normal ocean mode, 0..1 = converging into / holding ASCII portrait mode. */
  portraitConvergence = 0;

  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  private perception = 60;
  /** Per-species personal space in px (x, y). */
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketCount = new Uint16Array(0);
  private bucketNext = new Int32Array(0);
  private lastSpawn = 0;
  private fishStepAccum = 0;
  private tmp = { x: 0, y: 0 };

  /** fishCount overrides the area-based population (the sidebar wants a single small school). */
  constructor(
    private sharkSpecs: SharkSpec[] = DEFAULT_SHARKS,
    private fishCount?: number,
  ) {}

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // Spacing is set in grid cells so every fish lands in its own cell.
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;

    if (first || this.fish.length === 0) {
      this.seed();
      return;
    }
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    // Real-world scale (+30% larger): every shark is its average adult length (metres) times one
    // shared px-per-metre factor taken from the viewport, so a 10 m whale shark is always ~3.6x a
    // 2.8 m lemon shark whatever the screen size (independent of the ASCII cell size).
    const pxPerMeter = clamp(minSide * 0.0845, 31.2, 83.2);
    const specs = this.sharkSpecs.slice(0, MAX_SHARKS);
    const sharkCount = specs.length;
    const lengths = specs.map(
      ({ kind, size }) =>
        SHARK_LENGTH_M[kind] * pxPerMeter * (size ?? 1) * (kind === "whaleshark" ? 1 : NON_WHALE_SCALE),
    );
    const longest = Math.max(...lengths, 1);

    const primaryBLtoTR = Math.atan2(-H, W);
    const primaryTRtoBL = Math.atan2(H, -W);
    let blIndex = 0;
    let trIndex = 0;

    this.sharks = [];
    for (let i = 0; i < sharkCount; i++) {
      const { kind } = specs[i];
      const length = lengths[i];
      const blToTr = isBottomLeftToTopRight(kind);
      const primaryHeading = blToTr ? primaryBLtoTR : primaryTRtoBL;

      // Place sharks in well-separated diagonal lanes so they never overlap at startup:
      // Lemon & Whale shark travel Bottom-Left -> Top-Right; Great White & Hammerhead travel Top-Right -> Bottom-Left.
      let x: number;
      let y: number;
      if (blToTr) {
        const slot = blIndex++;
        x = W * (slot === 0 ? 0.24 : 0.56);
        y = H * (slot === 0 ? 0.62 : 0.84);
      } else {
        const slot = trIndex++;
        x = W * (slot === 0 ? 0.76 : 0.44);
        y = H * (slot === 0 ? 0.38 : 0.16);
      }

      const heading = primaryHeading;
      const nodes = new Float32Array(SHARK_NODES * 2);
      const seg = length / (SHARK_NODES - 1);
      for (let n = 0; n < SHARK_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      const loco = SHARK_LOCOMOTION[kind];
      this.sharks.push({
        id: i + 1,
        kind,
        length,
        nodes,
        heading,
        speed: loco.cruiseBase + length * loco.cruiseLengthK,
        phase: rand(0, TAU),
        strokeAmp: 1,
        burst: 0,
        turn: 0,
        roll: 0,
        courseHeading: heading,
        nextTurnAt: rand(loco.courseHold[0], loco.courseHold[1]),
        hunger: rand(0.25, 0.75),
        wander: 0,
        orbitDir: blToTr ? 1 : -1,
        orbitRadius: minSide * 0.3,
        target: null,
        retargetAt: 0,
        hasEntered: true,
        depth: clamp(0.6 + 0.4 * (length / longest), 0.6, 1),
      });
    }
    // Smaller (farther) sharks draw first so the big one swims over them.
    this.sharks.sort((a, b) => a.length - b.length);

    const total = this.fishCount ?? clamp(Math.round((W * H) / 3200), 130, 440);
    this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies();
      const sp = SPECIES[species];
      const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
      const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.06, W * 0.94);
      const cy = rand(H * 0.08, H * 0.92);
      // Mostly level headings: fish cruise sideways far more than up or down.
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir,
        });
      }
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }

  splash(x: number, y: number) {
    this.events.push({ kind: "splash", x, y });
    const r = 240;
    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - x;
      const dy = f.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      // Flash expansion: everybody nearby bolts straight out.
      const k = (1 - d / r) * 260;
      f.vx += (dx / d) * k;
      f.vy += (dy / d) * k;
      f.alarm = 1;
    }
  }

  step(dt: number) {
    this.time += dt;
    this.fishStepAccum += dt;
    // Step floaty particles in discrete time quanta (~12 fps) matching the discrete cell-stepping rate of the glyph sharks
    const FISH_DISCRETE_DT = 1 / 12;
    if (this.fishStepAccum >= FISH_DISCRETE_DT) {
      const steps = Math.min(3, Math.floor(this.fishStepAccum / FISH_DISCRETE_DT));
      this.fishStepAccum -= steps * FISH_DISCRETE_DT;
      for (let s = 0; s < steps; s++) {
        this.rebuildHash();
        this.stepFish(FISH_DISCRETE_DT);
      }
    }
    this.stepSharks(dt);
    this.respawn();
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
    }
  }

  private bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  private stepFish(dt: number) {
    const { fish, sharks, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      const sp = SPECIES[f.species];
      // Alarmed fish want more room: the school flashes apart around a
      // shark and closes back up once the threat fades.
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;

      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;

      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                // Blind zone directly behind the fish.
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  // Elliptical personal space: wide along x, tight along y.
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    // Different species keep their own schools.
                    const k = ((1 - d / foreignSep) / d) * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + (cx / n) * cohesionK;
        ay += (avy / n - f.vy) * alignK + (cy / n) * cohesionK;
        if (sp.mill > 0) {
          // Circle the local centre: the school spins into a bait ball.
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * f.millDir * sp.mill * (1 - f.alarm);
          ay += (cx / cl) * f.millDir * sp.mill * (1 - f.alarm);
        }
      }

      // Predators. Distance is measured to the nearest point along the front
      // half of the shark, so fish also give the flanks a wide berth.
      let fear = 0;
      for (const sh of sharks) {
        const fearR = sh.length * 0.6 + 60;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 12; k += 3) {
          const nx = sh.nodes[k * 2];
          const ny = sh.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        // Fountain effect: break to whichever side of the shark's path you're on.
        const shx = Math.cos(sh.heading);
        const shy = Math.sin(sh.heading);
        const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
        ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w));
      }

      if (pointer.active) {
        const pr = 130;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FISH_FLEE_K * w;
          ay += (dy / d) * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }

      // Alarm: direct threat sets it, neighbours pass it along (slightly
      // weaker each hop), and it fades on its own.
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;

      // Soft walls.
      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;

      // Ambient current and smooth individual drift (no frame-to-frame random velocity noise).
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + Math.cos(f.phase * 0.35 + i) * sp.jitter * 0.35;
      ay += cur.y * 0.5 + Math.sin(f.phase * 0.35 + i) * sp.jitter * 0.35;
      // Swim level, except when bolting from danger.
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);

      // Relax toward a preferred speed that rises with panic.
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;

      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x = clamp(f.x + f.vx * dt, -60, W + 60);
      f.y = clamp(f.y + f.vy * dt, -60, H + 60);
    }
  }

  /**
   * Re-enters a shark from its origin corner once 100% of its body, fins, and tail have
   * completely exited the viewport. Places the snout outside the entry border so zero pixels
   * pop in abruptly, and angles the entry heading so the shark curves smoothly as it enters.
   */
  private reenterShark(sh: Shark) {
    const { width: W, height: H, sharks, time } = this;
    const loco = SHARK_LOCOMOTION[sh.kind];
    const blToTr = isBottomLeftToTopRight(sh.kind);
    const primaryDiag = blToTr ? Math.atan2(-H, W) : Math.atan2(H, -W);
    const entryPad = sh.length * 0.14 + 34;

    // Candidate entry points outside the Bottom-Left (for Lemon & Whale Shark)
    // or Top-Right (for Great White & Hammerhead) edges.
    const candidates: { x: number; y: number; entryOffset: number }[] = blToTr
      ? [
          { x: -entryPad, y: H * 0.54, entryOffset: 0.36 },
          { x: -entryPad, y: H * 0.70, entryOffset: 0.34 },
          { x: -entryPad, y: H * 0.84, entryOffset: 0.30 },
          { x: W * 0.16, y: H + entryPad, entryOffset: -0.36 },
          { x: W * 0.32, y: H + entryPad, entryOffset: -0.34 },
          { x: W * 0.46, y: H + entryPad, entryOffset: -0.30 },
        ]
      : [
          { x: W + entryPad, y: H * 0.46, entryOffset: 0.36 },
          { x: W + entryPad, y: H * 0.30, entryOffset: 0.34 },
          { x: W + entryPad, y: H * 0.16, entryOffset: 0.30 },
          { x: W * 0.84, y: -entryPad, entryOffset: -0.36 },
          { x: W * 0.68, y: -entryPad, entryOffset: -0.34 },
          { x: W * 0.54, y: -entryPad, entryOffset: -0.30 },
        ];

    let bestCand = candidates[0];
    let bestClearance = -Infinity;
    for (const cand of candidates) {
      let minD = Infinity;
      for (const other of sharks) {
        if (other === sh) continue;
        for (let k = 0; k < SHARK_NODES; k += 3) {
          const d = Math.hypot(cand.x - other.nodes[k * 2], cand.y - other.nodes[k * 2 + 1]);
          if (d < minD) minD = d;
        }
      }
      const jittered = minD + rand(-18, 18);
      if (jittered > bestClearance) {
        bestClearance = jittered;
        bestCand = cand;
      }
    }

    const destX = blToTr ? W * rand(0.76, 0.92) : W * rand(0.08, 0.24);
    const destY = blToTr ? H * rand(0.08, 0.26) : H * rand(0.74, 0.92);
    const targetDiag = Math.atan2(destY - bestCand.y, destX - bestCand.x);
    const courseHeading = primaryDiag + clamp(angleDiff(primaryDiag, targetDiag), -0.18, 0.18);
    const entryHeading = courseHeading + bestCand.entryOffset;

    sh.heading = entryHeading;
    sh.courseHeading = courseHeading;
    sh.turn = 0;
    sh.roll = 0;
    sh.hasEntered = false;
    sh.nextTurnAt = time + rand(loco.courseHold[0], loco.courseHold[1]);

    const seg = sh.length / (SHARK_NODES - 1);
    for (let n = 0; n < SHARK_NODES; n++) {
      sh.nodes[n * 2] = bestCand.x - Math.cos(entryHeading) * seg * n;
      sh.nodes[n * 2 + 1] = bestCand.y - Math.sin(entryHeading) * seg * n;
    }
  }

  private stepSharks(dt: number) {
    const { sharks, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    const primaryBLtoTR = Math.atan2(-H, W);
    const primaryTRtoBL = Math.atan2(H, -W);

    for (const sh of sharks) {
      const L = sh.length;
      const nodes = sh.nodes;
      const loco = SHARK_LOCOMOTION[sh.kind];
      const blToTr = isBottomLeftToTopRight(sh.kind);
      const primaryDiag = blToTr ? primaryBLtoTR : primaryTRtoBL;

      // Compute the full bounding box of all 20 spine nodes so a shark only wraps after
      // 100% of its body, caudal fin extension, pectoral fins, and shadow have exited the screen.
      let minNodeX = Infinity;
      let maxNodeX = -Infinity;
      let minNodeY = Infinity;
      let maxNodeY = -Infinity;
      for (let k = 0; k < SHARK_NODES; k++) {
        const nx = nodes[k * 2];
        const ny = nodes[k * 2 + 1];
        if (nx < minNodeX) minNodeX = nx;
        if (nx > maxNodeX) maxNodeX = nx;
        if (ny < minNodeY) minNodeY = ny;
        if (ny > maxNodeY) maxNodeY = ny;
      }
      const exitPad = L * 0.25 + 45;
      const vxDir = Math.cos(sh.heading);
      const vyDir = Math.sin(sh.heading);
      const fullyExited =
        (maxNodeX < -exitPad && vxDir <= 0) ||
        (minNodeX > W + exitPad && vxDir >= 0) ||
        (maxNodeY < -exitPad && vyDir <= 0) ||
        (minNodeY > H + exitPad && vyDir >= 0);
      if (fullyExited) {
        this.reenterShark(sh);
      }

      const hx = nodes[0];
      const hy = nodes[1];
      if (!sh.hasEntered && hx >= 28 && hx <= W - 28 && hy >= 28 && hy <= H - 28) {
        sh.hasEntered = true;
      }
      sh.hunger = Math.min(1, sh.hunger + dt * 0.03);

      // Acceleration lunge: a hungry shark with prey ahead speeds up (higher tail-beat frequency
      // and amplitude, scaled by the species' burstMult), then eases back to cruise slowly.
      if (time >= sh.retargetAt) {
        sh.target = sh.hunger > 0.35 ? this.findPrey(sh) : null;
        sh.retargetAt = time + rand(0.35, 0.6);
      }
      const burstGoal = sh.target && sh.target.alive ? 1 : 0;
      sh.burst += (burstGoal - sh.burst) * Math.min(1, dt * (burstGoal > sh.burst ? 1.6 : 0.6));

      // 1. Strict shark-to-shark collision avoidance:
      // Check forward lookahead points and body points against every other shark's spine.
      // When approaching the safety gap, pick a clean avoidance direction so the shark curves
      // first, aligns onto the new straight course, and holds it for the defined 3–7 s period.
      const fx = Math.cos(sh.heading);
      const fy = Math.sin(sh.heading);
      const f1x = hx + fx * L * 0.32;
      const f1y = hy + fy * L * 0.32;
      const f2x = hx + fx * L * 0.64;
      const f2y = hy + fy * L * 0.64;
      const mhx = nodes[8];
      const mhy = nodes[9];

      let avoiding = false;
      let yieldSlowdown = 1;
      for (const other of sharks) {
        if (other === sh) continue;
        const minGap = (L + other.length) * 0.34 + 62;
        const senseRange = (L + other.length) * 0.64 + 115;
        let bestD = Infinity;
        let awayX = 0;
        let awayY = 0;
        let closeOx = 0;
        let closeOy = 0;

        for (let k = 0; k < SHARK_NODES; k += 2) {
          const ox = other.nodes[k * 2];
          const oy = other.nodes[k * 2 + 1];
          const d0 = Math.hypot(hx - ox, hy - oy);
          if (d0 < bestD) {
            bestD = d0;
            awayX = hx - ox;
            awayY = hy - oy;
            closeOx = ox;
            closeOy = oy;
          }
          const d1 = Math.hypot(f1x - ox, f1y - oy);
          if (d1 < bestD) {
            bestD = d1;
            awayX = f1x - ox;
            awayY = f1y - oy;
            closeOx = ox;
            closeOy = oy;
          }
          const d2 = Math.hypot(f2x - ox, f2y - oy);
          if (d2 < bestD) {
            bestD = d2;
            awayX = f2x - ox;
            awayY = f2y - oy;
            closeOx = ox;
            closeOy = oy;
          }
          const d3 = Math.hypot(mhx - ox, mhy - oy);
          if (d3 < bestD) {
            bestD = d3;
            awayX = mhx - ox;
            awayY = mhy - oy;
            closeOx = ox;
            closeOy = oy;
          }
        }

        // Only steer away if the other shark is ahead of or alongside our front half.
        const toOx = closeOx - hx;
        const toOy = closeOy - hy;
        const forwardDot = toOx * fx + toOy * fy;
        if (bestD < senseRange && bestD > 1e-3 && forwardDot > -L * 0.2) {
          avoiding = true;
          const awayCross = fx * awayY - fy * awayX;
          const sameFlow = isBottomLeftToTopRight(other.kind) === blToTr;
          const turnSign =
            Math.abs(awayCross) > 14
              ? awayCross > 0
                ? 1
                : -1
              : sameFlow
                ? sh.id < other.id
                  ? -1
                  : 1
                : 1;
          const urgency = clamp(1 - (bestD - minGap * 0.7) / (senseRange - minGap * 0.7), 0, 1);
          const turnStep = 0.46 + urgency * 0.42;
          // Keep every turn strictly under 90° (MAX_TURN_ANGLE ≈ 79°) both from current heading
          // and from the shark's primary diagonal corridor so return turns also stay under 90°.
          const MAX_TURN_ANGLE = Math.PI * 0.44;
          let candidateCourse = sh.heading + turnSign * turnStep;
          if (Math.abs(angleDiff(primaryDiag, candidateCourse)) > MAX_TURN_ANGLE) {
            candidateCourse =
              primaryDiag + clamp(angleDiff(primaryDiag, candidateCourse), -MAX_TURN_ANGLE, MAX_TURN_ANGLE);
          }

          // Update courseHeading only if we aren't already turning away sufficiently in that direction.
          const currentDiff = angleDiff(sh.heading, sh.courseHeading) * turnSign;
          if (currentDiff < turnStep * 0.75) {
            sh.courseHeading = sh.heading + clamp(angleDiff(sh.heading, candidateCourse), -MAX_TURN_ANGLE, MAX_TURN_ANGLE);
            sh.nextTurnAt = time + rand(loco.courseHold[0], loco.courseHold[1]);
          }
          if (bestD < minGap && forwardDot > 0) {
            yieldSlowdown = Math.min(yieldSlowdown, 0.68);
          }
        }
      }

      // Hard cap (< 90° = π/2 rad) on any turn taken inside the screen.
      const MAX_IN_SCREEN_TURN = Math.PI * 0.44;

      // 2. Non-exit screen boundary check:
      // Sharks are allowed to exit freely through their destination corner (Top-Right for Lemon/Whale,
      // Bottom-Left for Great White/Hammerhead), but if an avoidance maneuver steers them toward a
      // non-exit wall early, they curve back toward their destination corridor (clamped to < 90°).
      const edgeMargin = Math.min(L * 0.26, minSide * 0.13);
      let needBoundaryTurn = false;
      if (!avoiding && sh.hasEntered) {
        if (blToTr) {
          const hitLeft = hx < edgeMargin && fx < 0.15;
          const hitBottom = hy > H - edgeMargin && fy > -0.15;
          needBoundaryTurn = hitLeft || hitBottom;
        } else {
          const hitRight = hx > W - edgeMargin && fx > -0.15;
          const hitTop = hy < edgeMargin && fy < 0.15;
          needBoundaryTurn = hitRight || hitTop;
        }
        if (needBoundaryTurn) {
          const inwardCourse =
            sh.heading + clamp(angleDiff(sh.heading, primaryDiag), -MAX_IN_SCREEN_TURN, MAX_IN_SCREEN_TURN);
          if (Math.abs(angleDiff(sh.courseHeading, inwardCourse)) > 0.18) {
            sh.courseHeading = inwardCourse;
            sh.nextTurnAt = time + rand(loco.courseHold[0], loco.courseHold[1]);
          }
        }
      }

      // 3. Scheduled path-following timer (3–7 s):
      // During the defined timespan, the shark holds its straight path without curving.
      // When the timer expires, if a previous collision avoidance turn diverted the shark off its
      // primary diagonal flow, it curves smoothly back onto its primary diagonal direction (clamped
      // to < 90°) and then locks into straight path following again. If already aligned, it stays straight.
      if (this.portraitConvergence > 0.05 && !avoiding) {
        const targetX = W * (0.38 + (sh.id % 4) * 0.08);
        const targetY = H * (0.28 + (sh.id % 4) * 0.16);
        const toCenterAngle = Math.atan2(targetY - hy, targetX - hx);
        const distToCenter = Math.hypot(targetX - hx, targetY - hy);
        if (distToCenter > minSide * 0.22) {
          sh.courseHeading =
            sh.heading + clamp(angleDiff(sh.heading, toCenterAngle), -MAX_IN_SCREEN_TURN, MAX_IN_SCREEN_TURN);
        }
      } else if (!avoiding && !needBoundaryTurn && time >= sh.nextTurnAt) {
        if (Math.abs(angleDiff(sh.courseHeading, primaryDiag)) > 0.16) {
          const targetDiag = primaryDiag + rand(-0.05, 0.05);
          sh.courseHeading =
            sh.heading + clamp(angleDiff(sh.heading, targetDiag), -MAX_IN_SCREEN_TURN, MAX_IN_SCREEN_TURN);
        } else {
          sh.courseHeading = sh.heading;
        }
        sh.nextTurnAt = time + rand(loco.courseHold[0], loco.courseHold[1]);
      }

      // Enforce that no in-screen turn ever exceeds MAX_IN_SCREEN_TURN (< 90°).
      if (this.portraitConvergence <= 0.05) {
        sh.courseHeading =
          primaryDiag + clamp(angleDiff(primaryDiag, sh.courseHeading), -MAX_IN_SCREEN_TURN, MAX_IN_SCREEN_TURN);
      }
      sh.courseHeading =
        sh.heading + clamp(angleDiff(sh.heading, sh.courseHeading), -MAX_IN_SCREEN_TURN, MAX_IN_SCREEN_TURN);

      // 4. Turn execution vs straight path following:
      // When a direction change is needed, the shark curves its body first by rotating its heading
      // smoothly toward courseHeading. Once aligned, turn rate locks to 0 so the body stays straight.
      const maxAgility = avoiding
        ? loco.turnAgility * 2.1
        : needBoundaryTurn
          ? loco.turnAgility * 1.5
          : loco.turnAgility * 1.15;
      const radiusK = avoiding ? loco.turnRadiusK * 0.72 : loco.turnRadiusK;
      const agility = Math.min(maxAgility, sh.speed / (L * radiusK));
      const err = angleDiff(sh.heading, sh.courseHeading);
      const isTurning = Math.abs(err) > 0.008;

      if (isTurning) {
        const wantRate = clamp(err * 2.2, -agility, agility);
        sh.turn += (wantRate - sh.turn) * Math.min(1, dt * 6.2);
        const stepAngle = sh.turn * dt;
        if (Math.abs(stepAngle) >= Math.abs(err) && stepAngle * err > 0) {
          sh.heading = sh.courseHeading;
          sh.turn = 0;
        } else {
          sh.heading += stepAngle;
        }
      } else {
        sh.heading = sh.courseHeading;
        sh.turn = 0;
      }

      // Coordinated banking / whole-body roll during turns; returns to 0 on straight paths.
      const targetRoll = isTurning ? clamp(sh.turn * loco.bankFactor, -0.45, 0.45) : 0;
      sh.roll += (targetRoll - sh.roll) * Math.min(1, dt * 5.0);

      // Periodic cruise/glide envelope: whale sharks alternate steady slow strokes with calm glides.
      const glideCycle = 0.5 + 0.5 * Math.sin((time * TAU) / loco.glidePeriod + sh.id * 2.1);
      const targetStroke =
        (loco.glideFloor + (1 - loco.glideFloor) * smoothstep(0.18, 0.68, glideCycle)) * (1 + 0.3 * sh.burst);
      sh.strokeAmp += (targetStroke - sh.strokeAmp) * Math.min(1, dt * 1.8);

      // Speed coupled directly to species biomechanics and stroke envelope.
      const cruise = (loco.cruiseBase + L * loco.cruiseLengthK) * (0.84 + 0.16 * sh.strokeAmp);
      const targetSpeed = cruise * yieldSlowdown * (1 + (loco.burstMult - 1) * sh.burst);
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * 1.4);

      // Tail-beat phase advances at species frequency in Hz (2π · f · dt).
      const freqHz =
        (loco.tailFreqHz + (sh.speed - cruise) * loco.tailSpeedHz) * (0.72 + 0.28 * sh.strokeAmp);
      sh.phase += dt * TAU * Math.max(0.28, freqHz);

      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;

      // 5. Spine kinematics:
      // - While turning (entering screen, avoiding collision, or resuming diagonal), the spine curves
      //   smoothly along the turn arc without kinking at the pelvis.
      // - Once aligned on the straight path, the entire spine (including the pelvic region) straightens
      //   into exact collinear alignment with sh.heading and stays completely uncurved.
      const seg = L / (SHARK_NODES - 1);
      const straightenRate = isTurning ? Math.min(1, dt * 1.5) : Math.min(1, dt * 8.5);
      let prevAngle = sh.heading + Math.PI;
      for (let k = 1; k < SHARK_NODES; k++) {
        const px = nodes[(k - 1) * 2];
        const py = nodes[(k - 1) * 2 + 1];
        let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
        const rawBend = clamp(angleDiff(prevAngle, angle), -loco.maxSpineBend, loco.maxSpineBend);
        const nextBend = rawBend * (1 - straightenRate);
        angle = !isTurning && Math.abs(nextBend) < 0.003 ? prevAngle : prevAngle + nextBend;
        nodes[k * 2] = px + Math.cos(angle) * seg;
        nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }

      // Feed when fish cross the snout along the shark's path.
      if (sh.hunger > 0.15) {
        const mouthR = L * 0.05 + 8;
        const mx = nodes[0];
        const my = nodes[1];
        for (const f of this.fish) {
          if (!f.alive) continue;
          if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
            f.alive = false;
            f.respawnAt = time + rand(3, 8);
            sh.hunger = Math.max(0, sh.hunger - 0.16);
            this.events.push({ kind: "eat", x: f.x, y: f.y });
          }
        }
      }
    }
  }

  /**
   * Pick prey in the shark's forward cone, preferring close fish in sparse
   * buckets (stragglers) over fish buried in a dense school.
   */
  private findPrey(sh: Shark): Fish | null {
    const range = sh.length * 0.9 + 160;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    const fx = Math.cos(sh.heading);
    const fy = Math.sin(sh.heading);
    let best: Fish | null = null;
    let bestScore = Infinity;
    let currentScore = Infinity;

    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - hx;
      const dy = f.y - hy;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 1e-3) continue;
      const cos = (dx * fx + dy * fy) / d;
      if (cos < 0.2) continue;
      const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
      const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
      if (f === sh.target) currentScore = score;
    }
    // Stick with the current target unless something is clearly better.
    if (sh.target && currentScore < bestScore * 1.3) return sh.target;
    return best;
  }

  private respawn() {
    const { time, width: W, height: H } = this;
    const due: Fish[] = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    if (due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;

    // A new school swims in from a random edge.
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
    const species = pickSpecies();
    const sp = SPECIES[species];
    const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    for (const f of due.slice(0, sp.schoolSize[1])) {
      f.alive = true;
      f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(-1, 1) * this.perception;
      f.y = y + rand(-1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
}
