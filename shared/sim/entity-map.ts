export class EntityMap<K, V> implements Map<K, V> {
  private readonly map = new Map<K, V>();
  private _valuesArray: V[] | null = null;
  private _keysArray: K[] | null = null;

  set(key: K, value: V): this {
    this.map.set(key, value);
    this._valuesArray = null;
    this._keysArray = null;
    return this;
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  delete(key: K): boolean {
    const result = this.map.delete(key);
    if (result) {
      this._valuesArray = null;
      this._keysArray = null;
    }
    return result;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  clear(): void {
    if (this.map.size > 0) {
      this.map.clear();
      this._valuesArray = null;
      this._keysArray = null;
    }
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    this.map.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  get [Symbol.toStringTag](): string {
    return "EntityMap";
  }
  get size(): number {
    return this.map.size;
  }

  valuesArray(): V[] {
    if (this._valuesArray === null) {
      this._valuesArray = Array.from(this.map.values());
    }
    return this._valuesArray;
  }

  keysArray(): K[] {
    if (this._keysArray === null) {
      this._keysArray = Array.from(this.map.keys());
    }
    return this._keysArray;
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }
}
