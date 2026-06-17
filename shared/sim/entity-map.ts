export class EntityMap<K, V> extends Map<K, V> {
  private _cachedValues: V[] | null = null;

  override set(key: K, value: V): this {
    super.set(key, value);
    this._cachedValues = null;
    return this;
  }

  override delete(key: K): boolean {
    const deleted = super.delete(key);
    if (deleted) this._cachedValues = null;
    return deleted;
  }

  override clear(): void {
    super.clear();
    this._cachedValues = null;
  }

  valuesArray(): V[] {
    if (this._cachedValues === null) {
      this._cachedValues = Array.from(super.values());
    }
    return this._cachedValues;
  }
}
