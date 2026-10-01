import { describe, expect, it } from "vitest";
import { maxLabelPosition } from "@/components/admin/BarChart";

/** QA 2026-09-30: the max-value label of the last (or first) bar was cut off at the viewBox edge. */
describe("maxLabelPosition", () => {
  it("centres the label over a bar in the middle of the chart", () => {
    expect(maxLabelPosition(230, "319,38 €")).toEqual({ x: 230, textAnchor: "middle" });
  });

  it("anchors the label to the right edge when the highest bar is the last one", () => {
    expect(maxLabelPosition(441.5, "319,38 €")).toEqual({ x: 458, textAnchor: "end" });
  });

  it("anchors the label to the left edge when centring would run past it", () => {
    expect(maxLabelPosition(10, "1.234,56 €")).toEqual({ x: 2, textAnchor: "start" });
  });
});
