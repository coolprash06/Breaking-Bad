import { describe, expect, it } from "vitest";
import { isGsm7, maxUnits, smsInfo } from "./segments";

describe("smsInfo", () => {
  it("counts plain English as GSM-7: 160 in one SMS, 153 per part after that", () => {
    expect(smsInfo("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1, perSegment: 160, remaining: 0 });
    expect(smsInfo("a".repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
    expect(smsInfo("a".repeat(306)).segments).toBe(2);
    expect(smsInfo("a".repeat(307)).segments).toBe(3);
  });

  it("counts extension characters as two septets", () => {
    expect(smsInfo("[]").units).toBe(4);
    expect(smsInfo("€").encoding).toBe("GSM-7");
  });

  it("switches to UCS-2 for Hindi or any non-GSM character: 70, then 67 per part", () => {
    expect(smsInfo("पानी").encoding).toBe("UCS-2");
    expect(smsInfo("a–b").encoding).toBe("UCS-2"); // en dash
    expect(smsInfo("क".repeat(70)).segments).toBe(1);
    expect(smsInfo("क".repeat(71))).toMatchObject({ segments: 2, perSegment: 67 });
    expect(smsInfo("क".repeat(135)).segments).toBe(3);
    expect(maxUnits("UCS-2", 2)).toBe(134);
    expect(maxUnits("GSM-7", 2)).toBe(306);
  });

  it("treats common punctuation used in warnings as GSM-7", () => {
    expect(isGsm7("URGENT: Well #4 may run dry in 1-3 weeks (70% sure). Move herds to Well #7 (2 km) by 3 Dec.")).toBe(true);
  });
});
