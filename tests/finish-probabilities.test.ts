import { describe, expect, it } from "vitest";
import { calculateFinishPositionShares } from "@/lib/finish-probabilities";

describe("finish position probability allocation", () => {
  it("assigns exact positions when scores are distinct", () => {
    const shares = calculateFinishPositionShares(new Map([
      ["Ada", 30],
      ["Grace", 20],
      ["Alan", 10],
    ]));

    expect(shares.get("Ada")).toEqual([1, 0, 0, 0, 0]);
    expect(shares.get("Grace")).toEqual([0, 1, 0, 0, 0]);
    expect(shares.get("Alan")).toEqual([0, 0, 1, 0, 0]);
  });

  it("splits every occupied position evenly when scores are tied", () => {
    const shares = calculateFinishPositionShares(new Map([
      ["Ada", 30],
      ["Grace", 20],
      ["Alan", 20],
      ["Katherine", 10],
    ]));

    expect(shares.get("Ada")).toEqual([1, 0, 0, 0, 0]);
    expect(shares.get("Alan")).toEqual([0, 0.5, 0.5, 0, 0]);
    expect(shares.get("Grace")).toEqual([0, 0.5, 0.5, 0, 0]);
    expect(shares.get("Katherine")).toEqual([0, 0, 0, 1, 0]);
  });

  it("only allocates tracked slots when a tie crosses fifth place", () => {
    const shares = calculateFinishPositionShares(new Map([
      ["First", 50],
      ["Second", 40],
      ["Third", 30],
      ["A", 20],
      ["B", 20],
      ["C", 20],
    ]));

    expect(shares.get("A")).toEqual([0, 0, 0, 1 / 3, 1 / 3]);
    expect(shares.get("B")).toEqual([0, 0, 0, 1 / 3, 1 / 3]);
    expect(shares.get("C")).toEqual([0, 0, 0, 1 / 3, 1 / 3]);
  });
});
