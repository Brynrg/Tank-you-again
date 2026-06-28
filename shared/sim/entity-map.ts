export class EntityMap<K, V> implements Map<K, V> {
  private map = new Map<K, V>();
  private _valuesArray: V[] | null = null;

  clear(): void {
    if (this.map.size > 0) {
      this.map.clear();
      this._valuesArray = null;
    }
  }

  delete(key: K): boolean {
    const deleted = this.map.delete(key);
    if (deleted) {
      this._valuesArray = null;
    }
    return deleted;
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
    if (!this.map.has(key) || this.map.get(key) !== value) {
      this.map.set(key, value);
      this._valuesArray = null;
    }
    return this;
  }

  get size(): number {
    return this.map.size;
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

  get [Symbol.toStringTag](): string {
    return "EntityMap";
  }

  valuesArray(): V[] {
    if (this._valuesArray === null) {
      this._valuesArray = Array.from(this.map.values());
    }
    return this._valuesArray;
  }
}
