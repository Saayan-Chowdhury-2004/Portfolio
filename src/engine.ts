import { clamp, hash3, smoothstep } from "./math";
import { BrutalistPortfolioUI } from "./portfolioColumns";
import { AsciiRenderer } from "./renderer";
import { World, type SharkSpec } from "./world";

const STEP = 1 / 60;
const MAX_STEPS = 4;
const CURSOR_STYLE_ID = "ink-brush-custom-cursor-style";
const CUSTOM_CURSOR_CSS = "none";

/**
 * Custom ink brushstroke cursor extracted directly from `cursor.jpg` (with white background removed
 * to transparency and a subtle light perimeter halo for visibility across dark and light modes).
 * Hotspot is at the top-left pointer tip `(1, 3)`.
 */
const INK_CURSOR_DATA_URI = "data:image/png;base64,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";

/**
 * CMF Orange palette (Nothing CMF signature vibrant orange #FF5500 / #FF5714)
 * with empty-glyph cell tones (no text characters inside the dock icons).
 */
const CMF_ORANGE_CELL_PALETTE = [
  { bg: "#ff5500", seam: "#d44200" },
  { bg: "#f75000", seam: "#cc3e00" },
  { bg: "#ff6012", seam: "#d94700" },
  { bg: "#eb4800", seam: "#c23900" },
];

/**
 * Dark charcoal/ink empty-glyph palette for the 8-ray Sun toggle button on the light-orange glyph dock
 * (no text characters inside the icon).
 */
const SUN_DARK_CELL_PALETTE = [
  { bg: "#1c1815", seam: "#38302a" },
  { bg: "#241f1b", seam: "#423932" },
  { bg: "#161311", seam: "#302924" },
];

/**
 * Wires World + AsciiRenderer + BrutalistPortfolioUI to a canvas: fixed-timestep loop, resize,
 * pointer input, pausing off-screen, prefers-reduced-motion, the custom ink brushstroke cursor
 * (`cursor.jpg`), and a single borderless, perimeter-gradient light-orange glyph dock
 * lengthened by 2px at the top and 3px at the bottom.
 */
export class OceanEngine {
  private world: World;
  private renderer: AsciiRenderer;
  private portfolioUI: BrutalistPortfolioUI;
  private dockEl: HTMLElement;
  private dockCanvas!: HTMLCanvasElement;
  private toggleBtn!: HTMLButtonElement;
  private toggleCanvas!: HTMLCanvasElement;
  private portraitBtn!: HTMLButtonElement;
  private portraitBtnCanvas!: HTMLCanvasElement;
  private cursorOverlayEl: HTMLImageElement | null = null;

  private sunBaseAngleRad = 0;
  private sunSpinStartAngleRad = 0;
  private sunSpinTargetAngleRad = 0;
  private sunSpinStartTime = 0;
  private sunSpinDurationMs = 1050;
  private sunSpinActive = false;
  private glyphTick = 0;
  private lastButtonShimmerAt = 0;

  private raf = 0;
  private last = 0;
  private visible = true;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, sharks?: SharkSpec[]) {
    this.world = new World(sharks);
    this.renderer = new AsciiRenderer(canvas);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.portfolioUI = new BrutalistPortfolioUI(this.canvas.parentElement ?? document.body, () => {
      this.schedule();
    });
    this.dockEl = this.createControlDock();
    this.applyCustomInkCursor();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("mousemove", this.onMouseMoveCursor, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("click", this.onClick);
    document.documentElement.addEventListener("pointerenter", this.onPointerEnter, { passive: true });
    document.documentElement.addEventListener("mouseenter", this.onMouseEnterCursor, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    document.documentElement.addEventListener("mouseleave", this.onPointerLeave);
    document.addEventListener("mouseleave", this.onPointerLeave);
    window.addEventListener("mouseout", this.onWindowMouseOut);
    window.addEventListener("blur", this.onPointerLeave);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, refresh offscreen portrait & dock UI.
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed) {
        this.renderer.refreshPortraitOffscreen();
        this.renderGlyphDockAndButtons(performance.now());
        if (this.reducedMotion.matches) this.drawStill();
      }
    });
    this.schedule();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.portfolioUI.destroy();
    this.dockEl.remove();
    this.cursorOverlayEl?.remove();
    this.cursorOverlayEl = null;
    document.getElementById(CURSOR_STYLE_ID)?.remove();
    this.canvas.style.cursor = "";
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("mousemove", this.onMouseMoveCursor);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("click", this.onClick);
    document.documentElement.removeEventListener("pointerenter", this.onPointerEnter);
    document.documentElement.removeEventListener("mouseenter", this.onMouseEnterCursor);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    document.documentElement.removeEventListener("mouseleave", this.onPointerLeave);
    document.removeEventListener("mouseleave", this.onPointerLeave);
    window.removeEventListener("mouseout", this.onWindowMouseOut);
    window.removeEventListener("blur", this.onPointerLeave);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  /**
   * Applies the custom ink brushstroke cursor (`cursor.jpg`) globally across the entire screen
   * (including the extreme left, right, and bottom edges of the viewport and the dock area)
   * by suppressing the native OS cursor (`cursor: none !important`) and rendering a hardware-accelerated
   * fixed overlay layer (`z-index: 2147483647`) that never triggers Chromium's edge/taskbar cursor fallback.
   */
  private applyCustomInkCursor(): void {
    let styleEl = document.getElementById(CURSOR_STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = CURSOR_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        overscroll-behavior: none !important;
      }
      *, *::before, *::after,
      :root, html, body, canvas,
      nav, nav:hover, nav *,
      .bp-control-dock, .bp-control-dock:hover, .bp-control-dock *,
      button, button:hover, button:focus, button:focus-visible, button:active, button *,
      a, a:hover,
      .bp-portfolio-root, .bp-portfolio-root * {
        cursor: none !important;
      }
      .bp-custom-ink-cursor {
        position: fixed;
        top: 0;
        left: 0;
        width: 32px;
        height: 32px;
        pointer-events: none !important;
        user-select: none !important;
        z-index: 2147483647;
        will-change: transform, opacity;
        transform: translate3d(-100px, -100px, 0);
        display: block;
        opacity: 0;
        visibility: hidden;
      }
    `;
    document.documentElement.style.setProperty("cursor", "none", "important");
    document.body.style.setProperty("cursor", "none", "important");
    this.canvas.style.setProperty("cursor", "none", "important");

    if (!this.cursorOverlayEl) {
      const img = document.createElement("img");
      img.className = "bp-custom-ink-cursor";
      img.src = INK_CURSOR_DATA_URI;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.draggable = false;
      img.onerror = () => {
        if (!img.dataset.fallback) {
          img.dataset.fallback = "1";
          img.src = "./images/cursor.png";
        }
      };
      document.body.appendChild(img);
      this.cursorOverlayEl = img;
    }
  }

  private hideCustomCursor(): void {
    if (!this.cursorOverlayEl) return;
    this.cursorOverlayEl.style.opacity = "0";
    this.cursorOverlayEl.style.visibility = "hidden";
  }

  private showCustomCursor(): void {
    if (!this.cursorOverlayEl) return;
    this.cursorOverlayEl.style.opacity = "1";
    this.cursorOverlayEl.style.visibility = "visible";
  }

  private updateCustomCursorPosition(clientX: number, clientY: number): void {
    if (!this.cursorOverlayEl) return;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1920;
    const vh = window.innerHeight || document.documentElement.clientHeight || 1080;
    if (clientX < 0 || clientY < 0 || clientX > vw || clientY > vh) {
      this.hideCustomCursor();
      return;
    }
    this.showCustomCursor();
    const cx = clamp(clientX, 0, Math.max(0, vw - 6));
    const cy = clamp(clientY, 0, Math.max(0, vh - 6));
    this.cursorOverlayEl.style.transform = `translate3d(${(cx - 1).toFixed(1)}px, ${(cy - 2).toFixed(1)}px, 0)`;
  }

  private onMouseMoveCursor = (e: MouseEvent) => {
    this.updateCustomCursorPosition(e.clientX, e.clientY);
  };

  private onPointerEnter = (e: PointerEvent) => {
    if (e.pointerType !== "touch") {
      this.updateCustomCursorPosition(e.clientX, e.clientY);
    }
  };

  private onMouseEnterCursor = (e: MouseEvent) => {
    this.updateCustomCursorPosition(e.clientX, e.clientY);
  };

  private onWindowMouseOut = (e: MouseEvent) => {
    const toEl = e.relatedTarget || (e as unknown as { toElement?: EventTarget | null }).toElement;
    if (!toEl) {
      this.onPointerLeave();
    }
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.onPointerLeave();
    }
  };

  /**
   * Builds the single compact light-orange glyph dock:
   *   1. Dock buttons reduced in size by 25% (`25.5×25.5px` vs `34×34px`).
   *   2. Shifted 2 pixels towards the right (`right: "12px"`).
   *   3. Lengthened by 2 pixels at the top (`top: "16px"`, `paddingTop: "8px"`) and 3 pixels at the bottom (`paddingBottom: "9px"`).
   *   4. Soft vanishing gradient around all four borders of the dock.
   *   5. Zero characters inside the dock icons (rotating 8-ray Sun button and Orange Profile button are formed of pure empty glyph cells).
   */
  private createControlDock(): HTMLElement {
    const dock = document.createElement("nav");
    dock.className = "bp-control-dock";
    dock.setAttribute("aria-label", "Portfolio Controls");
    Object.assign(dock.style, {
      position: "fixed",
      top: "16px",
      right: "12px",
      zIndex: "50",
      width: "41px",
      padding: "8px 3.5px 9px 3.5px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      background: "transparent",
      border: "none",
      borderRadius: "4px",
      boxShadow: "none",
      overflow: "hidden",
      userSelect: "none",
      boxSizing: "border-box",
    });

    // Empty-glyph matrix canvas forming the light-orange dock body with a vanishing gradient around its borders
    const dockCanvas = document.createElement("canvas");
    dockCanvas.setAttribute("aria-hidden", "true");
    Object.assign(dockCanvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "0",
      display: "block",
    });
    this.dockCanvas = dockCanvas;
    dock.appendChild(dockCanvas);

    dock.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    dock.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // 1. Sun Toggle Button — Dark & Light Mode Toggle (reduced by 25%: 25.5x25.5px)
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.setAttribute("aria-label", "Toggle light and dark mode");
    Object.assign(toggleBtn.style, {
      position: "relative",
      zIndex: "1",
      width: "25.5px",
      height: "25.5px",
      padding: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "transparent",
      border: "none",
      outline: "none",
      borderRadius: "0",
      boxShadow: "none",
      transition: "transform 0.15s ease",
    });

    const toggleCanvas = document.createElement("canvas");
    toggleCanvas.setAttribute("aria-hidden", "true");
    Object.assign(toggleCanvas.style, {
      width: "25.5px",
      height: "25.5px",
      display: "block",
      pointerEvents: "none",
      transition: "transform 0.15s ease",
    });
    this.toggleCanvas = toggleCanvas;
    toggleBtn.appendChild(toggleCanvas);

    toggleBtn.addEventListener("pointerenter", () => {
      toggleCanvas.style.transform = "scale(1.07)";
    });
    toggleBtn.addEventListener("pointerleave", () => {
      toggleCanvas.style.transform = "scale(1)";
    });
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const btnRect = toggleBtn.getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();
      const originX = btnRect.left + btnRect.width * 0.5 - canvasRect.left;
      const originY = btnRect.top + btnRect.height * 0.5 - canvasRect.top;
      this.renderer.toggleTheme(originX, originY);

      // Rotate the sun button smoothly across the entire 1.05s theme transition
      const now = performance.now();
      this.sunSpinStartAngleRad = this.getCurrentSunAngleRad(now);
      this.sunSpinTargetAngleRad = this.sunSpinStartAngleRad + Math.PI;
      this.sunSpinStartTime = now;
      this.sunSpinDurationMs = 1050;
      this.sunSpinActive = true;

      this.renderGlyphDockAndButtons(now);
      this.syncPortfolioUI(0);
      this.schedule();
    });

    // 2. Orange Profile Button — My Profile Toggle (reduced by 25%: 25.5x25.5px, no characters)
    const portraitBtn = document.createElement("button");
    portraitBtn.type = "button";
    portraitBtn.setAttribute("aria-label", "My Profile");
    Object.assign(portraitBtn.style, {
      position: "relative",
      zIndex: "1",
      width: "25.5px",
      height: "25.5px",
      padding: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "transparent",
      border: "none",
      outline: "none",
      borderRadius: "0",
      boxShadow: "none",
      transition: "transform 0.15s ease",
    });

    const portraitBtnCanvas = document.createElement("canvas");
    portraitBtnCanvas.setAttribute("aria-hidden", "true");
    Object.assign(portraitBtnCanvas.style, {
      width: "25.5px",
      height: "25.5px",
      display: "block",
      pointerEvents: "none",
      transition: "transform 0.15s ease",
    });
    this.portraitBtnCanvas = portraitBtnCanvas;
    portraitBtn.appendChild(portraitBtnCanvas);

    portraitBtn.addEventListener("pointerenter", () => {
      portraitBtnCanvas.style.transform = "scale(1.07)";
    });
    portraitBtn.addEventListener("pointerleave", () => {
      portraitBtnCanvas.style.transform = "scale(1)";
    });
    portraitBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.renderer.togglePortrait();
      this.glyphTick += 3;
      this.renderGlyphDockAndButtons(performance.now());
      this.syncPortfolioUI(0);
      this.schedule();
    });

    this.toggleBtn = toggleBtn;
    this.portraitBtn = portraitBtn;
    dock.appendChild(toggleBtn);
    dock.appendChild(portraitBtn);

    for (const el of [dock, dockCanvas, toggleBtn, toggleCanvas, portraitBtn, portraitBtnCanvas]) {
      el.style.setProperty("cursor", CUSTOM_CURSOR_CSS, "important");
    }

    (this.canvas.parentElement ?? document.body).appendChild(dock);
    return dock;
  }

  private getCurrentSunAngleRad(now: number): number {
    if (!this.sunSpinActive) {
      return this.sunBaseAngleRad;
    }
    const elapsed = now - this.sunSpinStartTime;
    if (elapsed >= this.sunSpinDurationMs) {
      this.sunSpinActive = false;
      this.sunBaseAngleRad = this.sunSpinTargetAngleRad % (Math.PI * 2);
      return this.sunBaseAngleRad;
    }
    const t = clamp(elapsed / this.sunSpinDurationMs, 0, 1);
    const ease = smoothstep(0, 1, t);
    return this.sunSpinStartAngleRad + (this.sunSpinTargetAngleRad - this.sunSpinStartAngleRad) * ease;
  }

  /**
   * Renders the dock background, the 8-ray Sun button, and the Orange Profile button
   * without any text characters inside the icons.
   */
  private renderGlyphDockAndButtons(now: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pCw = Math.max(3.2, this.renderer.portraitCellWidth || 4);
    const pCh = Math.max(4.5, this.renderer.portraitCellHeight || 5.5);

    this.renderDockGlyphCanvas(dpr, pCw, pCh);
    this.renderSunButtonCanvas(dpr, pCw, pCh, now);
    this.renderProfileButtonCanvas(dpr, pCw, pCh);
  }

  /**
   * Renders the light-orange dock surface as a matrix of portrait-sized empty glyphs
   * (`pCw × pCh`) with reduced corner curvature and a smooth perimeter gradient around all 4 borders.
   * Dock length is increased by 2px at the top and 3px at the bottom (total height 74px).
   */
  private renderDockGlyphCanvas(dpr: number, pCw: number, pCh: number): void {
    const dockW = 41;
    const dockH = this.dockEl.offsetHeight || 74;
    const physW = Math.round(dockW * dpr);
    const physH = Math.round(dockH * dpr);
    if (this.dockCanvas.width !== physW || this.dockCanvas.height !== physH) {
      this.dockCanvas.width = physW;
      this.dockCanvas.height = physH;
    }

    const ctx = this.dockCanvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, dockW, dockH);

    const cols = Math.max(8, Math.round(dockW / (pCw * 0.9)));
    const rows = Math.max(13, Math.round(dockH / (pCh * 0.9)));
    const cellW = dockW / cols;
    const cellH = dockH / rows;

    for (let r = 0; r < rows; r++) {
      const u = rows > 1 ? r / (rows - 1) : 0.5;
      // Warm light-orange vertical ramp complementing the portfolio palette
      const baseR = 249 - u * 6;
      const baseG = 207 - u * 14;
      const baseB = 173 - u * 20;

      // Vertical border distance (in cells) from top/bottom edges
      const distR = Math.min(r + 0.5, rows - 0.5 - r);
      const alphaR = smoothstep(0.0, 2.35, distR);

      for (let c = 0; c < cols; c++) {
        // Reduced corner curvature: omit the single extreme corner cell at each of the 4 corners
        if ((r === 0 || r === rows - 1) && (c === 0 || c === cols - 1)) {
          continue;
        }

        // Horizontal border distance (in cells) from left/right edges
        const distC = Math.min(c + 0.5, cols - 0.5 - c);
        const alphaC = smoothstep(0.0, 2.15, distC);

        // Perimeter border gradient: soft vanishing alpha falloff + warm apricot tint around the borders
        const borderFactor = clamp(alphaR * alphaC, 0, 1);
        const hCell = hash3(c, r, 31);

        // Organic glyph-cell fade at the outermost perimeter cells
        const cellAlpha = clamp(0.18 + 0.82 * borderFactor - (1 - borderFactor) * (hCell * 0.12), 0.08, 0.98);

        const tx = c * cellW;
        const ty = r * cellH;
        const shift = (hCell - 0.5) * 5;

        // Warm edge glow around the perimeter borders transitioning into the light-orange interior
        const edgeWarmth = 1 - borderFactor;
        const cr = clamp(Math.round(baseR + shift + edgeWarmth * 6), 0, 255);
        const cg = clamp(Math.round(baseG + shift - edgeWarmth * 24), 0, 255);
        const cb = clamp(Math.round(baseB + shift - edgeWarmth * 42), 0, 255);

        // Contiguous fill (+0.35px overlap) so there are no dark cross-hatching gaps
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${cellAlpha.toFixed(3)})`;
        ctx.fillRect(tx, ty, Math.min(dockW - tx, cellW + 0.35), Math.min(dockH - ty, cellH + 0.35));

        // Subtle tone-on-tone inner empty-glyph facet matching the column empty-glyph aesthetic
        ctx.strokeStyle = `rgba(210, 144, 92, ${(cellAlpha * 0.34).toFixed(3)})`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(tx + 0.35, ty + 0.35, Math.max(1, cellW - 0.7), Math.max(1, cellH - 0.7));
      }
    }
  }

  /**
   * Renders the 8-ray Sun toggle button (`image_5231d9.png`) reduced by 25% (`25.5×25.5px` vs `34×34px`)
   * with zero text characters inside.
   */
  private renderSunButtonCanvas(
    dpr: number,
    pCw: number,
    pCh: number,
    now: number
  ): void {
    const btnSize = 25.5;
    const phys = Math.round(btnSize * dpr);
    if (this.toggleCanvas.width !== phys || this.toggleCanvas.height !== phys) {
      this.toggleCanvas.width = phys;
      this.toggleCanvas.height = phys;
    }

    const ctx = this.toggleCanvas.getContext("2d");
    if (!ctx) return;
    const scale = phys / btnSize;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, btnSize, btnSize);

    const cx = btnSize * 0.5;
    const cy = btnSize * 0.5;
    const angleOffset = this.getCurrentSunAngleRad(now);

    // Spoke dimensions reduced by 25% to match the 25.5x25.5 button size
    const rayW = clamp(pCw * 0.9 * 0.75, 2.4, 3.0);
    const cellLen = clamp(pCh * 0.86 * 0.9 * 0.75, 2.7, 3.22);
    const innerR = 4.95;

    for (let k = 0; k < 8; k++) {
      const rayAngle = k * (Math.PI / 4) + angleOffset;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rayAngle);

      // Each ray consists of 2 stacked empty glyph cells radially outward from `innerR` (no characters)
      for (let cellIdx = 0; cellIdx < 2; cellIdx++) {
        const x = -rayW * 0.5;
        const y = -(innerR + (cellIdx + 1) * cellLen);
        const pal =
          SUN_DARK_CELL_PALETTE[(k * 3 + cellIdx + this.glyphTick) % SUN_DARK_CELL_PALETTE.length];

        ctx.fillStyle = pal.bg;
        ctx.fillRect(x, y, rayW, cellLen + 0.2);

        ctx.strokeStyle = pal.seam;
        ctx.lineWidth = 0.45;
        ctx.strokeRect(x + 0.2, y + 0.2, Math.max(0.8, rayW - 0.4), Math.max(0.8, cellLen - 0.4));
      }

      ctx.restore();
    }
  }

  /**
   * Renders the Orange Profile button icon reduced by 25% (`25.5×25.5px` vs `34×34px`)
   * on a grid of empty glyph cells with zero text characters inside.
   */
  private renderProfileButtonCanvas(
    dpr: number,
    pCw: number,
    pCh: number
  ): void {
    const btnSize = 25.5;
    const phys = Math.round(btnSize * dpr);
    if (this.portraitBtnCanvas.width !== phys || this.portraitBtnCanvas.height !== phys) {
      this.portraitBtnCanvas.width = phys;
      this.portraitBtnCanvas.height = phys;
    }

    const ctx = this.portraitBtnCanvas.getContext("2d");
    if (!ctx) return;
    const scale = phys / btnSize;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, btnSize, btnSize);

    // 8 columns x 7 rows of empty glyph cells reduced by 25% and centered inside the 25.5x25.5 button
    const cols = 8;
    const rows = 7;
    const cellW = clamp(pCw * 0.9 * 0.75, 2.36, 2.85);
    const cellH = clamp(pCh * 0.88 * 0.9 * 0.75, 2.8, 3.22);
    const gridW = cols * cellW;
    const gridH = rows * cellH;
    const ox = (btnSize - gridW) * 0.5;
    const oy = (btnSize - gridH) * 0.5;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Top rectangular bar: rows 0..2, cols 0..7 (hollow 1-cell-thick frame)
        const isTopBar =
          ((r === 0 || r === 2) && c >= 0 && c <= 7) || (r === 1 && (c === 0 || c === 7));
        // Bottom-left square box: rows 4..6, cols 0..3 (hollow 1-cell-thick square)
        const isBottomLeftBox =
          ((r === 4 || r === 6) && c >= 0 && c <= 3) || (r === 5 && (c === 0 || c === 3));
        // Bottom-right two horizontal lines: row 4 (cols 5..6) and row 6 (cols 5..7)
        const isBottomRightLines = (r === 4 && c >= 5 && c <= 6) || (r === 6 && c >= 5 && c <= 7);

        if (!isTopBar && !isBottomLeftBox && !isBottomRightLines) {
          continue;
        }

        const x = ox + c * cellW;
        const y = oy + r * cellH;
        const pal =
          CMF_ORANGE_CELL_PALETTE[
            (c * 3 + r * 5 + this.glyphTick) % CMF_ORANGE_CELL_PALETTE.length
          ];

        ctx.fillStyle = pal.bg;
        ctx.fillRect(x, y, cellW + 0.2, cellH + 0.2);

        ctx.strokeStyle = pal.seam;
        ctx.lineWidth = 0.45;
        ctx.strokeRect(x + 0.2, y + 0.2, Math.max(0.8, cellW - 0.4), Math.max(0.8, cellH - 0.4));
      }
    }
  }

  private syncPortfolioUI(dt = STEP) {
    const rect = this.canvas.getBoundingClientRect();
    this.portfolioUI.update(
      this.renderer.isPortraitMode,
      this.renderer.isLightMode,
      rect.width,
      rect.height,
      this.renderer.portraitRightPx,
      this.renderer.portraitBottomPx,
      this.renderer.portraitCellWidth,
      this.renderer.portraitCellHeight,
      dt,
      this.world.time
    );
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(rect.width, rect.height, dpr);
    this.world.resize(rect.width, rect.height, this.renderer.cellWidth, this.renderer.cellHeight);
    this.renderGlyphDockAndButtons(performance.now());
    this.syncPortfolioUI(0);
    if (this.reducedMotion.matches) this.drawStill();
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    if (
      this.disposed ||
      !this.visible ||
      (this.reducedMotion.matches &&
        !this.renderer.isTransitioning &&
        !this.portfolioUI.isAnimating &&
        !this.sunSpinActive)
    )
      return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    if (!this.reducedMotion.matches) {
      const subSteps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(dt / 0.02)));
      const subDt = dt / subSteps;
      for (let s = 0; s < subSteps; s++) {
        this.world.step(subDt);
      }
    }
    this.renderer.render(this.world, dt);
    this.syncPortfolioUI(dt);

    // Keep the sun button rotating smoothly during dark/light transitions and subtly shimmer empty-glyph tones
    if (this.sunSpinActive || now - this.lastButtonShimmerAt > 180) {
      if (now - this.lastButtonShimmerAt > 180) {
        this.glyphTick++;
        this.lastButtonShimmerAt = now;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pCw = Math.max(3.2, this.renderer.portraitCellWidth || 4);
      const pCh = Math.max(4.5, this.renderer.portraitCellHeight || 5.5);
      this.renderSunButtonCanvas(dpr, pCw, pCh, now);
      if (!this.sunSpinActive) {
        this.renderProfileButtonCanvas(dpr, pCw, pCh);
      }
    }

    if (
      !this.reducedMotion.matches ||
      this.renderer.isTransitioning ||
      this.portfolioUI.isAnimating ||
      this.sunSpinActive
    ) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  /** Reduced motion: let the ecosystem settle, then show a single frame. */
  private drawStill() {
    if (this.world.time < 4) {
      for (let i = 0; i < 240; i++) this.world.step(STEP);
    }
    this.renderer.render(this.world, STEP);
    this.syncPortfolioUI(STEP);
  }

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.drawStill();
    } else {
      this.schedule();
    }
  };

  private toLocal(e: PointerEvent | MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    return { x, y, inside };
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "touch") {
      this.updateCustomCursorPosition(e.clientX, e.clientY);
    }
    const { x, y, inside } = this.toLocal(e);
    const p = this.world.pointer;
    p.x = x;
    p.y = y;
    p.active = inside && e.pointerType !== "touch";
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") {
      this.updateCustomCursorPosition(e.clientX, e.clientY);
    }
    const { x, y, inside } = this.toLocal(e);
    if (!inside) return;
    if (this.renderer.isPointOnPortrait(x, y)) return;
    if (!this.reducedMotion.matches) this.world.splash(x, y);
  };

  private onClick = (e: MouseEvent) => {
    const { x, y, inside } = this.toLocal(e);
    if (!inside) return;
    if (this.renderer.isPointOnPortrait(x, y)) {
      this.renderer.toggleRealPortrait(x, y);
      if (this.reducedMotion.matches) {
        this.schedule();
      }
    }
  };

  private onPointerLeave = () => {
    this.world.pointer.active = false;
    this.hideCustomCursor();
  };
}
