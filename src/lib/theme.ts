/**
 * Theme resolution shared by the utility dock and the boot script in the root
 * layout. Three choices, two outcomes: "system" resolves against the OS
 * preference and keeps tracking it, while "day" and "night" are pins.
 */

export type ThemeChoice = "day" | "night" | "system";
export type ResolvedTheme = "day" | "night";

export const THEME_STORAGE_KEY = "orvius-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Day is the fallback for a first-time visitor: the marketing canvas is warm
 * paper, and inheriting a dark OS is a surprise nobody asked for.
 */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "day" || stored === "night" || stored === "system") {
      return stored;
    }
  } catch {
    /* storage blocked — fall through to the default */
  }
  return "day";
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice !== "system") return choice;
  return window.matchMedia(DARK_QUERY).matches ? "night" : "day";
}

export function applyResolvedTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function storeThemeChoice(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* storage blocked — the attribute still applies for this session */
  }
}

/**
 * Inlined in <head> so the resolved colorway lands before first paint. Mirrors
 * the functions above; keep the two in sync when the contract changes.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_STORAGE_KEY}');if(c!=='day'&&c!=='night'&&c!=='system'){c='day';}var t=c==='system'?(window.matchMedia('${DARK_QUERY}').matches?'night':'day'):c;document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
