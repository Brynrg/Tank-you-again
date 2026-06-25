export class EntityMap<K, V> {
  private map = new Map<K, V>();
  private _valuesArray: V[] | null = null;

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): this {
    const isNew = !this.map.has(key);
    this.map.set(key, value);
    if (isNew) {
      this._valuesArray = null;
    } else if (this._valuesArray !== null) {
      // If it's an update, the array needs to reflect the new value if order is important,
      // but typically we can just clear cache to be safe.
      this._valuesArray = null;
    }
    return this;
  }

  delete(key: K): boolean {
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

  /**
   * Returns a cached array of all values in the map.
   * This is $O(N)$ only when the map has changed since the last call.
   */
  valuesArray(): V[] {
    if (this._valuesArray === null) {
      this._valuesArray = Array.from(this.map.values());
    }
    return this._valuesArray;
  }
}
