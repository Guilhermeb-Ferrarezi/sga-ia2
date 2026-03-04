import { describe, expect, it } from "bun:test";
import {
  classifyHandoffSla,
  computeHandoffWaitMinutes,
} from "./operationalAlerts";

describe("computeHandoffWaitMinutes", () => {
  it("returns 0 when date is missing or invalid", () => {
    const now = new Date("2026-03-04T12:00:00.000Z");
    expect(computeHandoffWaitMinutes(null, now)).toBe(0);
    expect(computeHandoffWaitMinutes("invalid-date", now)).toBe(0);
  });

  it("returns full minutes elapsed", () => {
    const now = new Date("2026-03-04T12:30:00.000Z");
    const started = new Date("2026-03-04T12:10:31.000Z");
    expect(computeHandoffWaitMinutes(started, now)).toBe(19);
  });
});

describe("classifyHandoffSla", () => {
  it("classifies thresholds correctly", () => {
    expect(classifyHandoffSla(0)).toBe("ok");
    expect(classifyHandoffSla(14)).toBe("ok");
    expect(classifyHandoffSla(15)).toBe("warning");
    expect(classifyHandoffSla(29)).toBe("warning");
    expect(classifyHandoffSla(30)).toBe("critical");
  });
});
