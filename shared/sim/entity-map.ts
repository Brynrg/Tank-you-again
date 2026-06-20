export class EntityMap<K, V> extends Map<K, V> {
  private _valuesArray: V[] | null = null;

  override set(key: K, value: V): this {
    super.set(key, value);
    this._valuesArray = null;
    return this;
  }

  override delete(key: K): boolean {
    const result = super.delete(key);
    if (result) {
      this._valuesArray = null;
    }
    return result;
  }

  override clear(): void {
    super.clear();
    this._valuesArray = null;
  }

  /**
   * Returns a cached array of the values in the map.
   * This avoids allocating a new array every tick when passing entity collections to the AI.
   */
  valuesArray(): V[] {
    if (this._valuesArray === null) {
      this._valuesArray = Array.from(this.values());
    }
    return this._valuesArray;
  }
}
