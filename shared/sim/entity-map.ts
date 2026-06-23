export class EntityMap<K, V> {
  private map = new Map<K, V>();
  private arrayCache: V[] | null = null;

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): this {
    this.map.set(key, value);
    this.arrayCache = null;
    return this;
  }

  delete(key: K): boolean {
    const deleted = this.map.delete(key);
    if (deleted) {
      this.arrayCache = null;
    }
    return deleted;
  }

  clear(): void {
    this.map.clear();
    this.arrayCache = null;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    this.map.forEach(callbackfn, thisArg);
  }

  get [Symbol.toStringTag](): string {
    return this.map[Symbol.toStringTag];
  }

  valuesArray(): V[] {
    if (this.arrayCache === null) {
      this.arrayCache = Array.from(this.map.values());
    }
    return this.arrayCache;
  }
}
