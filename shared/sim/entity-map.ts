export class EntityMap<K, V> extends Map<K, V> {
  private _valuesArray: V[] | null = null;

  override set(key: K, value: V): this {
    super.set(key, value);
    this._valuesArray = null;
    return this;
  }

  override delete(key: K): boolean {
    const deleted = super.delete(key);
    if (deleted) {
      this._valuesArray = null;
    }
    return deleted;
  }

  override clear(): void {
    super.clear();
    this._valuesArray = null;
  }

  valuesArray(): V[] {
    if (this._valuesArray === null) {
      this._valuesArray = Array.from(this.values());
    }
    return this._valuesArray;
  }
}
