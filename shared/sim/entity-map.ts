export class EntityMap<V> {
  private map = new Map<string, V>();
  private _valuesArray: V[] | null = null;

  get size(): number {
    return this.map.size;
  }

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  set(key: string, value: V): this {
    this.map.set(key, value);
    this._valuesArray = null;
    return this;
  }

  delete(key: string): boolean {
    const deleted = this.map.delete(key);
    if (deleted) {
      this._valuesArray = null;
    }
    return deleted;
  }

  clear(): void {
    if (this.map.size > 0) {
      this.map.clear();
      this._valuesArray = null;
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[string, V]> {
    return this.map.entries();
  }

  [Symbol.iterator](): IterableIterator<[string, V]> {
    return this.map[Symbol.iterator]();
  }

  forEach(callbackfn: (value: V, key: string, map: EntityMap<V>) => void, thisArg?: any): void {
    this.map.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, this);
    });
  }

  get [Symbol.toStringTag]() {
    return "EntityMap";
  }

  /**
   * Returns a cached array of values.
   * Recomputed only when the map is mutated.
   */
  valuesArray(): V[] {
    if (this._valuesArray === null) {
      this._valuesArray = Array.from(this.map.values());
    }
    return this._valuesArray;
  }
}
