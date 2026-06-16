export class EntityMap<K, V> extends Map<K, V> {
  private cachedValues: V[] | null = null;

  override set(key: K, value: V): this {
    super.set(key, value);
    this.cachedValues = null;
    return this;
  }

  override delete(key: K): boolean {
    const deleted = super.delete(key);
    if (deleted) {
      this.cachedValues = null;
    }
    return deleted;
  }

  override clear(): void {
    super.clear();
    this.cachedValues = null;
  }

  public valuesArray(): V[] {
    if (this.cachedValues === null) {
      this.cachedValues = Array.from(this.values());
    }
    return this.cachedValues;
  }
}
