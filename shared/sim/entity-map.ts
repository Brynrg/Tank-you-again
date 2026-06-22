/**
 * ⚡ Bolt: EntityMap
 *
 * A Map wrapper that caches its values array to avoid repeated O(N) array
 * allocations during hot loop iterations, like `Array.from(map.values())`.
 */
export class EntityMap<K, V> extends Map<K, V> {
  private cachedValues: V[] | null = null;

  override set(key: K, value: V): this {
    super.set(key, value);
    this.cachedValues = null;
    return this;
  }

  override delete(key: K): boolean {
    const res = super.delete(key);
    if (res) {
      this.cachedValues = null;
    }
    return res;
  }

  override clear(): void {
    super.clear();
    this.cachedValues = null;
  }

  valuesArray(): V[] {
    if (this.cachedValues === null) {
      this.cachedValues = Array.from(super.values());
    }
    return this.cachedValues;
  }
}
