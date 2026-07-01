export class EntityMap<K, V> implements Map<K, V> {
  private map: Map<K, V>;
  private cachedValues: V[] | null = null;

  constructor(iterable?: Iterable<readonly [K, V]> | null) {
    this.map = new Map(iterable);
  }

  get size(): number {
    return this.map.size;
  }

  get [Symbol.toStringTag]() {
    return this.map[Symbol.toStringTag];
  }

  clear(): void {
    if (this.map.size > 0) {
      this.map.clear();
      this.cachedValues = null;
    }
  }

  delete(key: K): boolean {
    const deleted = this.map.delete(key);
    if (deleted) {
      this.cachedValues = null;
    }
    return deleted;
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    // Note: passing 'this' as the third argument to simulate Map behavior
    this.map.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): this {
    if (this.map.get(key) !== value) {
      this.map.set(key, value);
      this.cachedValues = null;
    }
    return this;
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }

  /**
   * Returns a cached array of values.
   * This avoids allocating a new array on every call, unlike Array.from(map.values()).
   */
  valuesArray(): V[] {
    if (this.cachedValues === null) {
      this.cachedValues = Array.from(this.map.values());
    }
    return this.cachedValues;
  }
}
