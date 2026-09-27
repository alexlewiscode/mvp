"use client";

// The MVP wordmark rendered as the same FIGlet "doh" ASCII art the package
// prints in the terminal menu (see package/src/ui.rs DOH_LOGO). Each cell is a
// fixed-width inline-block so the proportional Pixelify font still produces a
// perfect monospace grid. The brightness wave is shared by each diagonal and
// paused whenever it cannot be seen.

import { useEffect, useRef } from "react";

const DOH_LOGO = [
  "MMMMMMMM               MMMMMMMMVVVVVVVV           VVVVVVVVPPPPPPPPPPPPPPPPP",
  "M:::::::M             M:::::::MV::::::V           V::::::VP::::::::::::::::P",
  "M::::::::M           M::::::::MV::::::V           V::::::VP::::::PPPPPP:::::P",
  "M:::::::::M         M:::::::::MV::::::V           V::::::VPP:::::P     P:::::P",
  "M::::::::::M       M::::::::::M V:::::V           V:::::V   P::::P     P:::::P",
  "M:::::::::::M     M:::::::::::M  V:::::V         V:::::V    P::::P     P:::::P",
  "M:::::::M::::M   M::::M:::::::M   V:::::V       V:::::V     P::::PPPPPP:::::P",
  "M::::::M M::::M M::::M M::::::M    V:::::V     V:::::V      P:::::::::::::PP",
  "M::::::M  M::::M::::M  M::::::M     V:::::V   V:::::V       P::::PPPPPPPPP",
  "M::::::M   M:::::::M   M::::::M      V:::::V V:::::V        P::::P",
  "M::::::M    M:::::M    M::::::M       V:::::V:::::V         P::::P",
  "M::::::M     MMMMM     M::::::M        V:::::::::V          P::::P",
  "M::::::M               M::::::M         V:::::::V         PP::::::PP",
  "M::::::M               M::::::M          V:::::V          P::::::::P",
  "M::::::M               M::::::M           V:::V           P::::::::P",
  "MMMMMMMM               MMMMMMMM            VVV            PPPPPPPPPP",
];

const COLS = 78;
const WAVE_PHASES = Array.from(
  new Set(
    DOH_LOGO.flatMap((line, y) =>
      line
        .padEnd(COLS, " ")
        .split("")
        .flatMap((ch, x) => (ch === " " ? [] : [x + y])),
    ),
  ),
).sort((a, b) => a - b);

export default function AsciiLogo() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const motionPreference = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    let reduceMotion = motionPreference?.matches ?? false;
    let pageVisible = !document.hidden;
    let inViewport = typeof IntersectionObserver === "undefined";
    let raf: number | null = null;
    let elapsed = 0;
    let lastFrame: number | null = null;

    const stop = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      lastFrame = null;
    };

    const clearWave = () => {
      for (const phase of WAVE_PHASES) {
        root.style.removeProperty(`--wave-${phase}`);
      }
    };

    const tick = (now: number) => {
      raf = null;
      if (lastFrame !== null) elapsed += now - lastFrame;
      lastFrame = now;
      const t = elapsed / 1000;
      for (const phase of WAVE_PHASES) {
        const wave = Math.sin(t * 2.4 - phase * 0.18);
        const opacity = 0.35 + 0.65 * (0.5 + 0.5 * wave);
        root.style.setProperty(`--wave-${phase}`, opacity.toFixed(3));
      }
      schedule();
    };

    const schedule = () => {
      if (!reduceMotion && pageVisible && inViewport && raf === null) {
        raf = requestAnimationFrame(tick);
      }
    };

    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) schedule();
      else stop();
    };

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
      if (reduceMotion) {
        stop();
        clearWave();
      } else {
        schedule();
      }
    };

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            inViewport = entries.some(
              (entry) => entry.target === root && entry.isIntersecting,
            );
            if (inViewport) schedule();
            else stop();
          });

    observer?.observe(root);
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionPreference?.addEventListener?.("change", onMotionPreferenceChange);
    schedule();

    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionPreference?.removeEventListener?.(
        "change",
        onMotionPreferenceChange,
      );
      clearWave();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="ascii-logo w-full text-center font-pixelify leading-none select-none"
      aria-hidden="true"
    >
      {DOH_LOGO.map((line, y) => (
        <div key={y} className="ascii-logo-row">
          {line
            .padEnd(COLS, " ")
            .split("")
            .map((ch, x) => {
              const hue = 105 + (x / (COLS - 1)) * 85;
              const phase = x + y;
              return (
                <span
                  key={x}
                  data-wave-phase={ch === " " ? undefined : phase}
                  className="ascii-logo-cell"
                  style={{
                    color: `hsl(${hue.toFixed(1)} 95% 68%)`,
                    ...(ch === " "
                      ? {}
                      : { opacity: `var(--wave-${phase}, 1)` }),
                  }}
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              );
            })}
        </div>
      ))}
    </div>
  );
}
