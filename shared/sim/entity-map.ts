/**
 * A custom Map implementation that caches the values as an array.
 * Useful for high-frequency iteration in the game loop.
 */
export class EntityMap<K, V> implements Map<K, V> {
  private internalMap = new Map<K, V>();
  private cachedValuesArray: V[] | null = null;

  get size(): number {
    return this.internalMap.size;
  }

  clear(): void {
    this.internalMap.clear();
    this.cachedValuesArray = null;
  }

  delete(key: K): boolean {
    const deleted = this.internalMap.delete(key);
    if (deleted) {
      this.cachedValuesArray = null;
    }
    return deleted;
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    this.internalMap.forEach(callbackfn, thisArg);
  }

  get(key: K): V | undefined {
    return this.internalMap.get(key);
  }

  has(key: K): boolean {
    return this.internalMap.has(key);
  }

  set(key: K, value: V): this {
    this.internalMap.set(key, value);
    this.cachedValuesArray = null;
    return this;
  }

  entries(): IterableIterator<[K, V]> {
    return this.internalMap.entries();
  }

  keys(): IterableIterator<K> {
    return this.internalMap.keys();
  }

  values(): IterableIterator<V> {
    return this.internalMap.values();
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.internalMap[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return this.internalMap[Symbol.toStringTag];
  }

  /**
   * Returns a cached array of the map's values.
   * Recalculates only if the map has been modified since the last call.
   */
  valuesArray(): V[] {
    if (this.cachedValuesArray === null) {
      this.cachedValuesArray = Array.from(this.internalMap.values());
    }
    return this.cachedValuesArray;
  }
}
