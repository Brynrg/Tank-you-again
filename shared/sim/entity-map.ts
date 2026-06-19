export class EntityMap<K, V> extends Map<K, V> {
  private cachedArray: V[] | null = null;

  override set(key: K, value: V): this {
    super.set(key, value);
    this.cachedArray = null;
    return this;
  }

  override delete(key: K): boolean {
    const result = super.delete(key);
    if (result) {
      this.cachedArray = null;
    }
    return result;
  }

  override clear(): void {
    super.clear();
    this.cachedArray = null;
  }

  valuesArray(): V[] {
    if (this.cachedArray === null) {
      this.cachedArray = Array.from(this.values());
    }
    return this.cachedArray;
  }
}
