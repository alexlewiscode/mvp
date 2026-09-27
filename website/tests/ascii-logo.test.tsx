import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AsciiLogo from "@/components/ascii-logo";

describe("ASCII logo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders every row on the same fixed-width canvas", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn() })),
    );
    const requestFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);

    const { container } = render(<AsciiLogo />);
    const rows = container.querySelectorAll(".ascii-logo-row");

    expect(rows).toHaveLength(16);
    for (const row of rows) {
      expect(row.querySelectorAll(".ascii-logo-cell")).toHaveLength(78);
    }
    expect(container.querySelectorAll("[data-wave-phase]").length).toBeLessThan(
      rows.length * 78,
    );
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("updates one shared opacity value per visible diagonal", () => {
    let frame: FrameRequestCallback | undefined;
    let nextFrameId = 1;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return nextFrameId++;
    });
    const motionPreference = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => motionPreference),
    );
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("IntersectionObserver", undefined);

    const { container, unmount } = render(<AsciiLogo />);
    const root = container.querySelector<HTMLElement>(".ascii-logo");
    expect(root).not.toBeNull();
    expect(requestFrame).toHaveBeenCalledTimes(1);

    act(() => frame?.(1000));

    const animatedGlyphs = container.querySelectorAll("[data-wave-phase]");
    expect(root?.style.length).toBeGreaterThan(0);
    expect(root?.style.length).toBeLessThan(animatedGlyphs.length);
    expect(root?.style.length).toBeLessThanOrEqual(93);
    expect(requestFrame).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("pauses offscreen and while the browser tab is hidden", () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
    }

    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      void callback;
      return 7;
    });
    const cancelFrame = vi.fn();
    const motionPreference = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => motionPreference),
    );
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);

    const { container, unmount } = render(<AsciiLogo />);
    const root = container.querySelector<HTMLElement>(".ascii-logo");
    if (!root) throw new Error("ASCII logo is missing");
    expect(requestFrame).not.toHaveBeenCalled();

    act(() => {
      intersectionCallback?.(
        [
          {
            target: root,
            isIntersecting: true,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(requestFrame).not.toHaveBeenCalled();

    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(requestFrame).toHaveBeenCalledTimes(1);

    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(cancelFrame).toHaveBeenCalledWith(7);

    unmount();
  });
});
