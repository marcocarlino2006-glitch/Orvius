/**
 * Verification for the utility dock + colorway tokens.
 * Run: node scripts/verify-dock.cjs [baseUrl]
 */
const puppeteer = require("puppeteer");

const BASE = process.argv[2] || "http://localhost:3000";

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
}

/** Tailwind's opacity modifier resolves through color-mix, so computed values
 *  come back as oklab. Convert to sRGB so contrast math still works. */
function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => {
    const g = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, g)) * 255);
  });
}

function parse(color) {
  const raw = String(color);
  const rgbMatch = raw.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  }
  const okMatch = raw.match(/oklab\(([^)]+)\)/);
  if (okMatch) {
    const parts = okMatch[1].split(/[\s/]+/).filter(Boolean).map(Number);
    return {
      rgb: oklabToRgb(parts[0], parts[1], parts[2]),
      a: parts.length > 3 ? parts[3] : 1,
    };
  }
  throw new Error(`unparseable color: ${color}`);
}

function hex(rgb) {
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function flatten(fg, bg) {
  if (fg.a >= 1) return fg.rgb;
  return fg.rgb.map((c, i) => Math.round(c * fg.a + bg[i] * (1 - fg.a)));
}

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const results = [];
  const failures = [];
  const log = (label, value) => {
    const line = `${label} ${JSON.stringify(value)}`;
    results.push(line);
    if (process.env.VERBOSE) console.error(line);
  };
  const assert = (condition, message) => {
    if (!condition) failures.push(message);
  };

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });

  // --- dock geometry + chrome (day colorway, the marketing default) ---
  const geometry = await page.evaluate(() => {
    const dock = document.querySelector('[aria-label^="Language"]').closest("div");
    const wrap = dock.parentElement;
    const wrapStyle = getComputedStyle(wrap);
    const dockStyle = getComputedStyle(dock);
    const box = dock.getBoundingClientRect();
    return {
      position: wrapStyle.position,
      bottom: wrapStyle.bottom,
      right: wrapStyle.right,
      zIndex: wrapStyle.zIndex,
      display: dockStyle.display,
      gap: dockStyle.columnGap,
      padding: dockStyle.padding,
      radius: dockStyle.borderRadius,
      background: dockStyle.backgroundColor,
      border: `${dockStyle.borderTopWidth} ${dockStyle.borderTopColor}`,
      filter: dockStyle.backdropFilter,
      offsetRight: Math.round(window.innerWidth - box.right),
      offsetBottom: Math.round(window.innerHeight - box.bottom),
      height: Math.round(box.height),
    };
  });
  log("DAY_DOCK", geometry);

  // --- theme switching writes the resolved colorway + persists ---
  const themeFlow = await page.evaluate(async () => {
    const press = async (label) => {
      document.querySelector(`[aria-label="${label} theme"]`).click();
      // Long enough for .transition-colors to settle, or computed colors read
      // back mid-interpolation.
      await new Promise((r) => setTimeout(r, 400));
      return {
        attr: document.documentElement.getAttribute("data-theme"),
        stored: localStorage.getItem("orvius-theme"),
        surface: getComputedStyle(document.documentElement)
          .getPropertyValue("--ui-surface")
          .trim(),
      };
    };
    return {
      dark: await press("Dark"),
      light: await press("Light"),
      system: await press("System"),
    };
  });
  log("THEME_FLOW", themeFlow);

  // --- night dock chrome must be the exact spec values ---
  await page.evaluate(() => {
    document.querySelector('[aria-label="Dark theme"]').click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const nightDock = await page.evaluate(() => {
    const dock = document.querySelector('[aria-label^="Language"]').closest("div");
    const active = document.querySelector('[aria-label="Dark theme"]');
    const langBtn = document.querySelector('[aria-label^="Language"]');
    // What the dock's glass actually sits on: the painted surface just outside
    // its left edge, not <body>, which the night marketing CSS leaves light.
    const box = dock.getBoundingClientRect();
    let behind = document.elementFromPoint(box.left - 24, box.top + box.height / 2);
    let backdrop = "rgba(0, 0, 0, 0)";
    while (behind) {
      const bg = getComputedStyle(behind).backgroundColor;
      if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
        backdrop = bg;
        break;
      }
      behind = behind.parentElement;
    }
    return {
      dockBg: getComputedStyle(dock).backgroundColor,
      dockBorder: getComputedStyle(dock).borderTopColor,
      activeBg: getComputedStyle(active).backgroundColor,
      activeColor: getComputedStyle(active).color,
      langColor: getComputedStyle(langBtn).color,
      langRadius: getComputedStyle(langBtn).borderRadius,
      pageBg: backdrop,
    };
  });
  log("NIGHT_DOCK", nightDock);
  const dockRgb = parse(nightDock.dockBg);
  const pageRgb = parse(nightDock.pageBg).rgb;
  const dockFlat = flatten(dockRgb, pageRgb);
  log("NIGHT_CONTRAST", {
    dockGlassResolves: `${hex(dockRgb.rgb)} @ ${dockRgb.a}`,
    dockOverPage: hex(dockFlat),
    mutedOnDock: contrast(parse(nightDock.langColor).rgb, dockFlat),
    activeOnChip: contrast(parse(nightDock.activeColor).rgb, parse(nightDock.activeBg).rgb),
  });

  // --- worst-case backdrop: the dock is fixed, so it floats over every
  //     section of the page. Scan the whole scroll range and keep the worst. ---
  for (const theme of ["Light", "Dark"]) {
    await page.evaluate((label) => {
      document.querySelector(`[aria-label="${label} theme"]`).click();
    }, theme);
    await new Promise((r) => setTimeout(r, 500));
    const samples = await page.evaluate(async () => {
      const dock = document.querySelector('[aria-label^="Language"]').closest("div");
      const wrap = dock.parentElement;
      const glass = getComputedStyle(dock).backgroundColor;
      const label = getComputedStyle(
        document.querySelector('[aria-label^="Language"]'),
      ).color;
      const seen = new Map();
      const max = document.documentElement.scrollHeight - window.innerHeight;
      for (let y = 0; y <= max; y += 160) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => r()));
        const box = dock.getBoundingClientRect();
        // Sample beneath the glass, not beside it — the dock's left half
        // overlaps the full-bleed copper panel.
        wrap.style.pointerEvents = "none";
        const points = [box.left + 12, (box.left + box.right) / 2, box.right - 12];
        for (const x of points) {
          // Collect the whole painted stack, nearest first, up to the first
          // opaque layer. A translucent plate is not a backdrop on its own:
          // read alone, a 4%-white scrim resolves to #ffffff and invents a
          // failure the page never renders.
          const stack = [];
          let node = document.elementFromPoint(x, box.top + box.height / 2);
          while (node) {
            const bg = getComputedStyle(node).backgroundColor;
            if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
              stack.push(bg);
              const alpha = bg.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
              if (!alpha || Number(alpha[1]) >= 1) break;
            }
            node = node.parentElement;
          }
          if (stack.length) seen.set(stack.join(" | "), stack);
        }
        wrap.style.pointerEvents = "";
      }
      window.scrollTo(0, 0);
      return { glass, label, backdrops: [...seen.values()] };
    });
    const glass = parse(samples.glass);
    const labelRgb = parse(samples.label).rgb;
    const scored = samples.backdrops.map((stack) => {
      // Composite far -> near so each translucent layer lands on what is
      // actually behind it, then put the dock's glass on top of the result.
      const resolved = stack
        .slice()
        .reverse()
        .reduce((under, layer) => flatten(parse(layer), under), [255, 255, 255]);
      const flat = flatten(glass, resolved);
      return {
        backdrop: hex(resolved),
        dockResolves: hex(flat),
        contrast: Number(contrast(labelRgb, flat)),
      };
    });
    scored.sort((a, b) => a.contrast - b.contrast);
    const allPassAA = scored.every((s) => s.contrast >= 4.5);
    log(`GLASS_SCAN_${theme.toUpperCase()}`, {
      backdropsSeen: scored.length,
      worst: scored[0],
      best: scored[scored.length - 1],
      allPassAA,
    });
    assert(
      allPassAA,
      `dock label falls to ${scored[0].contrast}:1 over ${scored[0].backdrop} in ${theme} mode`,
    );
  }
  await page.evaluate(() => {
    document.querySelector('[aria-label="Dark theme"]').click();
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 400));

  // --- language menu opens, positions above the dock, and retranslates ---
  const langFlow = await page.evaluate(async () => {
    const before = document.querySelector("[data-i18n='hero.title']").textContent;
    document.querySelector('[aria-label^="Language"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const menu = document.querySelector('ul[role="listbox"]');
    const menuBox = menu.getBoundingClientRect();
    const dockBox = document
      .querySelector('[aria-label^="Language"]')
      .closest("div")
      .getBoundingClientRect();
    // getComputedStyle is live, so snapshot the values before the click below
    // detaches the menu and every read starts returning "".
    const menuStyle = getComputedStyle(menu);
    const geometry = {
      menuWidth: Math.round(menuBox.width),
      menuAboveDock: Math.round(dockBox.top - menuBox.bottom),
      menuRightAligned: Math.round(dockBox.right - menuBox.right),
      menuRadius: menuStyle.borderRadius,
      menuBg: menuStyle.backgroundColor,
      menuPadding: menuStyle.padding,
    };
    const options = [...menu.querySelectorAll('[role="option"]')].map((o) =>
      o.textContent.trim(),
    );
    menu.querySelectorAll('[role="option"]')[1].click();
    await new Promise((r) => setTimeout(r, 200));
    return {
      options,
      ...geometry,
      heroBefore: before.slice(0, 34),
      heroAfter: document
        .querySelector("[data-i18n='hero.title']")
        .textContent.slice(0, 34),
      stored: localStorage.getItem("orvius-lang"),
      menuClosed: !document.querySelector('ul[role="listbox"]'),
      buttonLabel: document
        .querySelector('[aria-label^="Language"] span')
        .textContent,
    };
  });
  log("LANG_FLOW", { ...langFlow, menuOpaque: parse(langFlow.menuBg).a === 1 });

  // --- reload keeps the resolved choice with no flash of the wrong canvas ---
  await page.reload({ waitUntil: "domcontentloaded" });
  const boot = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    stored: localStorage.getItem("orvius-theme"),
    lang: localStorage.getItem("orvius-lang"),
  }));
  log("AFTER_RELOAD", boot);

  // --- system mode follows the OS ---
  await page.evaluate(() => {
    localStorage.setItem("orvius-theme", "system");
  });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "dark" },
  ]);
  await page.reload({ waitUntil: "networkidle0" });
  // The dock reads the stored choice after hydration, so wait for it to show.
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="System theme"]')
        ?.getAttribute("aria-pressed") === "true",
    { timeout: 5000 },
  );
  const systemDark = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    pressed: document
      .querySelector('[aria-label="System theme"]')
      ?.getAttribute("aria-pressed"),
  }));
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "light" },
  ]);
  await page.reload({ waitUntil: "domcontentloaded" });
  const systemLight = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
  }));
  log("SYSTEM_MODE", { osDark: systemDark, osLight: systemLight });

  // --- primitives on the style guide, both colorways ---
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/ui-kit`, { waitUntil: "networkidle0" });
  const kit = await page.evaluate(() => {
    const read = (theme) => {
      const scope = document.querySelector(`section[data-theme="${theme}"]`);
      const solid = scope.querySelector("a.ui-pill");
      const quiet = scope.querySelectorAll("button.ui-pill")[0];
      const card = scope.querySelector(".rounded-2xl");
      const dot = scope.querySelector(".bg-emerald-500");
      const cs = getComputedStyle;
      return {
        tokens: {
          bg: cs(scope).getPropertyValue("--ui-bg").trim(),
          surface: cs(scope).getPropertyValue("--ui-surface").trim(),
          text: cs(scope).getPropertyValue("--ui-text").trim(),
          muted: cs(scope).getPropertyValue("--ui-text-muted").trim(),
          border: cs(scope).getPropertyValue("--ui-border").trim(),
        },
        solidPill: {
          radius: cs(solid).borderRadius,
          bg: cs(solid).backgroundColor,
          color: cs(solid).color,
          padding: `${cs(solid).paddingTop} ${cs(solid).paddingLeft}`,
          fontSize: cs(solid).fontSize,
          weight: cs(solid).fontWeight,
          duration: cs(solid).transitionDuration,
        },
        quietPill: { radius: cs(quiet).borderRadius, bg: cs(quiet).backgroundColor },
        card: {
          bg: cs(card).backgroundColor,
          border: cs(card).borderTopColor,
          lip: cs(card).boxShadow,
        },
        dot: {
          size: `${cs(dot).width}x${cs(dot).height}`,
          bg: cs(dot).backgroundColor,
          animation: cs(dot).animationName,
        },
      };
    };
    return { night: read("night"), day: read("day") };
  });
  log("KIT_NIGHT", kit.night);
  log("KIT_DAY", kit.day);
  log("KIT_CONTRAST", {
    nightSolidPill: contrast(
      parse(kit.night.solidPill.color).rgb,
      parse(kit.night.solidPill.bg).rgb,
    ),
    daySolidPill: contrast(
      parse(kit.day.solidPill.color).rgb,
      parse(kit.day.solidPill.bg).rgb,
    ),
  });

  // --- reduced motion stops the pulse ---
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.reload({ waitUntil: "networkidle0" });
  const reduced = await page.evaluate(() => {
    const dot = document.querySelector(".bg-emerald-500");
    return { animation: getComputedStyle(dot).animationName };
  });
  log("REDUCED_MOTION", reduced);
  assert(reduced.animation === "none", "pulse keeps running under reduced motion");
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "no-preference" },
  ]);

  // Spec conformance, asserted rather than eyeballed.
  assert(geometry.position === "fixed", "dock is not fixed");
  assert(geometry.bottom === "16px" && geometry.right === "24px", "dock offset drifted");
  assert(geometry.zIndex === "50", "dock z-index drifted");
  assert(geometry.gap === "8px" && geometry.padding === "6px", "dock spacing drifted");
  assert(/blur\(12px\)/.test(geometry.filter), "dock lost its backdrop blur");
  assert(themeFlow.dark.attr === "night", "dark button did not resolve to night");
  assert(themeFlow.light.attr === "day", "light button did not resolve to day");
  assert(themeFlow.system.stored === "system", "system choice did not persist");
  assert(systemDark.attr === "night" && systemLight.attr === "day", "system mode ignores the OS");
  assert(boot.attr === "night", "resolved theme did not survive reload");
  assert(langFlow.menuWidth === 144, "language menu width drifted");
  assert(langFlow.menuAboveDock > 0, "language menu does not clear the dock");
  assert(langFlow.heroBefore !== langFlow.heroAfter, "language pick did not retranslate");
  assert(langFlow.menuClosed, "language menu stayed open after a pick");
  assert(kit.night.solidPill.radius === "9999px", "pill lost its full radius");
  assert(kit.night.solidPill.padding === "8px 20px", "pill padding drifted");
  assert(kit.night.solidPill.duration === "0.2s", "pill transition drifted");
  assert(/inset/.test(kit.night.card.lip), "card lost its 1px top lip");
  assert(kit.night.dot.size === "8pxx8px", "live dot is not 8x8");

  console.log(results.join("\n"));
  if (failures.length) {
    console.log(`\nFAIL (${failures.length})`);
    failures.forEach((f) => console.log(`  - ${f}`));
  } else {
    console.log("\nPASS — all dock and colorway assertions hold");
  }
  await browser.close();
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error("FAILED", err.message);
  process.exit(1);
});
