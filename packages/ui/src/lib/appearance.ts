/**
 * A person's own colours, fonts and contrast, layered over the theme.
 *
 * The theme in globals.css is a set of custom properties built up from a page
 * colour, an ink colour and one accent. This turns a person's choice of those
 * three into overrides for the same properties, as a stylesheet, so nothing
 * that reads the tokens has to know a preference exists.
 *
 * A variant left at its defaults produces no CSS at all, so anyone who never
 * opens the Appearance screen runs on globals.css exactly as written.
 *
 * Kept in this browser, not on the account: it is how Onirix looks on one
 * screen, and the same person may well want something else on another.
 */

export type ThemeVariant = "light" | "dark";
export type ThemeMode = "system" | ThemeVariant;
export type TextSize = "small" | "default" | "large";

export type ThemeChoice = {
  /** `#rrggbb`. Focus rings, links and the informational status colour. */
  accent: string;
  /** `#rrggbb`. The page; every surface tint is mixed from this. */
  background: string;
  /** `#rrggbb`. The ink; every text step is this at some opacity. */
  foreground: string;
  /** A font family list, or empty for the product's own face. */
  uiFont: string;
  codeFont: string;
  /** 0 to 100. Strengthens secondary text and hairlines. */
  contrast: number;
};

export type Appearance = {
  light: ThemeChoice;
  dark: ThemeChoice;
  textSize: TextSize;
};

export type ThemePreset = { id: string; label: string; choice: ThemeChoice };

const base = { uiFont: "", codeFont: "", contrast: 0 };

/** The first of each list is the product's own look, which emits no CSS. */
export const THEME_PRESETS: Record<ThemeVariant, ThemePreset[]> = {
  light: [
    {
      id: "onirix",
      label: "Onirix",
      choice: { ...base, accent: "#0169cc", background: "#ffffff", foreground: "#0d0d0d" },
    },
    {
      id: "paper",
      label: "Paper",
      choice: { ...base, accent: "#a43a0a", background: "#f5f4f2", foreground: "#141413" },
    },
    {
      id: "slate",
      label: "Slate",
      choice: { ...base, accent: "#286df8", background: "#f6f8fa", foreground: "#0d1117" },
    },
  ],
  dark: [
    {
      id: "onirix",
      label: "Onirix",
      choice: { ...base, accent: "#339cff", background: "#111111", foreground: "#fcfcfc" },
    },
    {
      id: "black",
      label: "Black",
      choice: { ...base, accent: "#508afb", background: "#000000", foreground: "#ffffff" },
    },
    {
      id: "ember",
      label: "Ember",
      choice: { ...base, accent: "#ffb27f", background: "#121110", foreground: "#f5f4f2" },
    },
  ],
};

export const DEFAULT_APPEARANCE: Appearance = {
  light: THEME_PRESETS.light[0]!.choice,
  dark: THEME_PRESETS.dark[0]!.choice,
  textSize: "default",
};

// v2: v1 entries were written on every launch, choice or no choice, so they
// hold the palette of whichever build last ran rather than anything a person
// picked. They are left behind unread instead of being carried forward.
export const APPEARANCE_STORAGE_KEY = "onirix:appearance:v2";
/** The stylesheet built from the above, kept beside it for `APPEARANCE_BOOT_SCRIPT`. */
export const APPEARANCE_CSS_STORAGE_KEY = "onirix:appearance:css:v2";
const STYLE_ELEMENT_ID = "onirix-appearance";

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_FONT_CHARS = 120;

/**
 * A font list ends up inside a stylesheet, so everything that could close a
 * declaration or open another one is dropped rather than escaped.
 */
export function sanitizeFont(value: string): string {
  return value
    .replace(/[^\p{L}\p{N} ,'"_-]/gu, "")
    .slice(0, MAX_FONT_CHARS)
    .trim();
}

/**
 * The font list as it goes into the stylesheet. A quote left open cannot get
 * out of its declaration, but it would void it, and mid-typing that is the
 * normal state of the field. So the field keeps what was typed and the quotes
 * are only dropped here, until they pair up.
 */
function fontForCss(value: string): string {
  const balanced = (mark: string) => value.split(mark).length % 2 === 1;
  return balanced('"') && balanced("'") ? value : value.replace(/['"]/g, "");
}

function sanitizeChoice(value: unknown, fallback: ThemeChoice): ThemeChoice {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const colour = (key: "accent" | "background" | "foreground") =>
    typeof raw[key] === "string" && HEX.test(raw[key]) ? raw[key].toLowerCase() : fallback[key];
  const font = (key: "uiFont" | "codeFont") =>
    typeof raw[key] === "string" ? sanitizeFont(raw[key]) : fallback[key];
  const contrast =
    typeof raw.contrast === "number" && Number.isFinite(raw.contrast)
      ? Math.round(Math.min(100, Math.max(0, raw.contrast)))
      : fallback.contrast;

  return {
    accent: colour("accent"),
    background: colour("background"),
    foreground: colour("foreground"),
    uiFont: font("uiFont"),
    codeFont: font("codeFont"),
    contrast,
  };
}

/** Whatever was stored or pasted in, reduced to something safe to apply. */
export function sanitizeAppearance(value: unknown): Appearance {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    light: sanitizeChoice(raw.light, DEFAULT_APPEARANCE.light),
    dark: sanitizeChoice(raw.dark, DEFAULT_APPEARANCE.dark),
    textSize:
      raw.textSize === "small" || raw.textSize === "large" ? raw.textSize : "default",
  };
}

/** A pasted theme for one variant, or null when it is not one. */
export function parseThemeChoice(text: string, variant: ThemeVariant): ThemeChoice | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const colours = parsed as Record<string, unknown>;
    if (!["accent", "background", "foreground"].some((key) => key in colours)) return null;
    return sanitizeChoice(parsed, DEFAULT_APPEARANCE[variant]);
  } catch {
    return null;
  }
}

export function sameChoice(a: ThemeChoice, b: ThemeChoice): boolean {
  return (
    a.accent === b.accent &&
    a.background === b.background &&
    a.foreground === b.foreground &&
    a.uiFont === b.uiFont &&
    a.codeFont === b.codeFont &&
    a.contrast === b.contrast
  );
}

/**
 * The percentages globals.css mixes its surfaces, lines and text steps at,
 * copied here because contrast has to scale them and CSS cannot. Keep the two
 * in step: a person at contrast 0 should see exactly what globals.css draws.
 */
const SCALES = {
  light: { tints: [3, 5, 8, 16], border: 5, input: 8, inks: [95, 87, 60, 45, 22] },
  dark: { tints: [2.5, 5, 8, 14], border: 5, input: 8, inks: [95, 87, 62, 45, 22] },
} as const;

const percent = (value: number) => `${Math.min(100, value).toFixed(1)}%`;

function variantDeclarations(variant: ThemeVariant, choice: ThemeChoice): string[] {
  // globals.css builds every surface, line and text step out of these three,
  // on this same element, so setting them is enough to re-colour the product.
  const lines = [
    `--page: ${choice.background}`,
    `--ink-base: ${choice.foreground}`,
    `--accent-base: ${choice.accent}`,
  ];

  // Contrast leaves primary text alone, which is already near full strength,
  // and lifts what sits below it: secondary text and the lines between things.
  if (choice.contrast > 0) {
    const scale = SCALES[variant];
    const lift = choice.contrast / 100;
    const surface = (value: number) =>
      `color-mix(in srgb, var(--ink-base) ${percent(value)}, var(--page))`;
    const text = (value: number) =>
      `color-mix(in srgb, var(--ink-base) ${percent(value)}, transparent)`;

    scale.tints.forEach((value, step) => {
      lines.push(`--tint-0${step + 1}: ${surface(value * (1 + lift * 0.6))}`);
    });
    lines.push(
      `--ink-04: ${text(scale.inks[1] + lift * 8)}`,
      `--ink-03: ${text(scale.inks[2] + lift * 28)}`,
      `--ink-02: ${text(scale.inks[3] + lift * 30)}`,
      `--ink-01: ${text(scale.inks[4] + lift * 20)}`,
      `--border: ${surface(scale.border * (1 + lift * 1.8))}`,
      `--input: ${surface(scale.input * (1 + lift * 1.8))}`,
    );
  }

  // The platform's faces stay in the list, so a font that is not installed
  // falls back to them rather than to the browser's default serif.
  if (choice.uiFont) {
    lines.push(
      `--font-sans: ${fontForCss(choice.uiFont)}, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
    );
  }
  if (choice.codeFont) {
    lines.push(
      `--font-mono: ${fontForCss(choice.codeFont)}, "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace`,
    );
  }
  return lines;
}

/** The app's root size is 15px (globals.css); these sit a step either side. */
const TEXT_SIZES: Record<TextSize, string | null> = {
  small: "14px",
  default: null,
  large: "16px",
};

/** The overrides as a stylesheet. Empty when nothing differs from the defaults. */
export function buildAppearanceCss(appearance: Appearance): string {
  const blocks: string[] = [];

  const block = (selector: string, variant: ThemeVariant) => {
    if (sameChoice(appearance[variant], DEFAULT_APPEARANCE[variant])) return;
    const body = variantDeclarations(variant, appearance[variant])
      .map((line) => `  ${line};`)
      .join("\n");
    blocks.push(`${selector} {\n${body}\n}`);
  };

  // `.light` is left out on purpose: the public pages wrap themselves in it to
  // stay on the brand palette whatever a signed-in person has chosen here.
  block(":root:not(.dark)", "light");
  block(":root.dark", "dark");

  const size = TEXT_SIZES[appearance.textSize];
  if (size) blocks.push(`html.onirix-app {\n  font-size: ${size};\n}`);

  return blocks.join("\n\n");
}

function injectCss(css: string): void {
  let element = document.getElementById(STYLE_ELEMENT_ID);
  if (!css) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("style");
    element.id = STYLE_ELEMENT_ID;
    // Last in the head, so it is read after globals.css and the font classes.
    document.head.appendChild(element);
  }
  element.textContent = css;
}

export function readStoredAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return stored ? sanitizeAppearance(JSON.parse(stored)) : DEFAULT_APPEARANCE;
  } catch {
    // No storage (a private window) or a damaged entry: the defaults stand.
    return DEFAULT_APPEARANCE;
  }
}

/** Keeps the built stylesheet where `APPEARANCE_BOOT_SCRIPT` looks for it. */
function storeCss(css: string): void {
  try {
    if (css) window.localStorage.setItem(APPEARANCE_CSS_STORAGE_KEY, css);
    else window.localStorage.removeItem(APPEARANCE_CSS_STORAGE_KEY);
  } catch {
    // Without storage the choice still holds until the page is left.
  }
}

/** Applies a choice now and keeps it for next time. Only for a choice a person made. */
export function saveAppearance(appearance: Appearance): void {
  const clean = sanitizeAppearance(appearance);
  const css = buildAppearanceCss(clean);
  injectCss(css);
  storeCss(css);
  try {
    // Defaults are stored as nothing at all. A stored copy of them would pin
    // this release's palette in place, and the next release's would never show.
    if (css) window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(clean));
    else window.localStorage.removeItem(APPEARANCE_STORAGE_KEY);
  } catch {
    // As above.
  }
}

/**
 * Re-applies the stored choice, and writes nothing a person did not choose.
 * For an app that renders on the client, called once before the first render.
 * The stylesheet is rebuilt from the stored choice rather than trusted from
 * storage, so a release that changes how tokens are derived takes effect
 * without anyone having to save again.
 */
export function applyStoredAppearance(): void {
  const css = buildAppearanceCss(readStoredAppearance());
  injectCss(css);
  storeCss(css);
}

/**
 * For a server-rendered page, inlined ahead of the content so a person's
 * colours are there for the first paint instead of arriving a frame late. It
 * can only replay the stylesheet saved last time, since none of this module
 * has loaded yet; `applyStoredAppearance` rebuilds it moments later.
 */
export const APPEARANCE_BOOT_SCRIPT = `try{var c=localStorage.getItem(${JSON.stringify(
  APPEARANCE_CSS_STORAGE_KEY,
)});if(c){var s=document.createElement("style");s.id=${JSON.stringify(
  STYLE_ELEMENT_ID,
)};s.textContent=c;document.head.appendChild(s)}}catch(e){}`;
