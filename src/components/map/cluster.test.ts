import { describe, expect, it } from "vitest";
import { clusterMarkers, mostUrgent, type ClusterItem } from "./cluster";

const nadi9: ClusterItem = { id: "TH-09", x: 100, y: 100, tier: "warning" };
const well22: ClusterItem = { id: "TH-22", x: 104, y: 102, tier: "safe" };
const far: ClusterItem = { id: "KU-10", x: 400, y: 400, tier: "emergency" };

describe("clusterMarkers", () => {
  it("shows the most urgent tier: Nadi #9 (Warning) + Well #22 (Safe) leads with Nadi #9", () => {
    const groups = clusterMarkers([nadi9, well22, far], 24);
    const c = groups.find((g) => g.ids.includes("TH-09"))!;
    expect(c.ids.sort()).toEqual(["TH-09", "TH-22"]);
    expect(c.leadId).toBe("TH-09");
  });

  it("keeps the most urgent lead even when the Safe source seeds the cluster (e.g. it is selected)", () => {
    const groups = clusterMarkers([well22, nadi9, far], 24);
    expect(groups[0].ids).toEqual(["TH-22", "TH-09"]);
    expect(groups[0].leadId).toBe("TH-09");
  });

  it("leaves distant sources as their own group", () => {
    const groups = clusterMarkers([nadi9, well22, far], 24);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.ids.includes("KU-10"))!.ids).toEqual(["KU-10"]);
  });

  it("ranks Emergency > Warning > No data > Watch > Safe", () => {
    const t = (tier: ClusterItem["tier"]) => ({ id: tier, x: 0, y: 0, tier });
    expect(mostUrgent([t("safe"), t("watch"), t("nodata")]).tier).toBe("nodata");
    expect(mostUrgent([t("watch"), t("emergency"), t("warning")]).tier).toBe("emergency");
  });
});
