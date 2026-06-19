export class EntityMap<K, V> extends Map<K, V> {
  private _cachedValuesArray: V[] | null = null;

  override set(key: K, value: V): this {
    super.set(key, value);
    this._cachedValuesArray = null;
    return this;
  }

  override delete(key: K): boolean {
    const result = super.delete(key);
    if (result) {
      this._cachedValuesArray = null;
    }
    return result;
  }

  override clear(): void {
    super.clear();
    this._cachedValuesArray = null;
  }

  valuesArray(): V[] {
    if (this._cachedValuesArray === null) {
      this._cachedValuesArray = Array.from(this.values());
    }
    return this._cachedValuesArray;
  }
}
