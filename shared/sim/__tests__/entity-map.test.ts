import { describe, expect, it } from "vitest";
import { EntityMap } from "../entity-map.js";

describe("EntityMap", () => {
  it("caches valuesArray", () => {
    const map = new EntityMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);

    const arr1 = map.valuesArray();
    const arr2 = map.valuesArray();
    expect(arr1).toBe(arr2);
    expect(arr1).toEqual([1, 2]);

    map.set("c", 3);
    const arr3 = map.valuesArray();
    expect(arr3).not.toBe(arr1);
    expect(arr3).toEqual([1, 2, 3]);

    map.delete("b");
    const arr4 = map.valuesArray();
    expect(arr4).not.toBe(arr3);
    expect(arr4).toEqual([1, 3]);

    map.clear();
    const arr5 = map.valuesArray();
    expect(arr5).not.toBe(arr4);
    expect(arr5).toEqual([]);
  });
});
