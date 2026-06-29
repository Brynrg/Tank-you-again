export class EntityMap<K, V> implements Map<K, V> {
  private readonly map = new Map<K, V>();
  private cachedValues: V[] | null = null;

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
    this.cachedValues = null;
  }

  delete(key: K): boolean {
    const result = this.map.delete(key);
    if (result) {
      this.cachedValues = null;
    }
    return result;
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    this.map.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): this {
    const isUpdate = this.map.has(key);
    const prevValue = this.map.get(key);
    this.map.set(key, value);
    if (!isUpdate || prevValue !== value) {
      this.cachedValues = null;
    }
    return this;
  }

  entries(): MapIterator<[K, V]> {
    return this.map.entries();
  }

  keys(): MapIterator<K> {
    return this.map.keys();
  }

  values(): MapIterator<V> {
    return this.map.values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return "EntityMap";
  }

  valuesArray(): V[] {
    if (this.cachedValues === null) {
      this.cachedValues = Array.from(this.map.values());
    }
    return this.cachedValues;
  }
}
