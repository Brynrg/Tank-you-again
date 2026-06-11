export class EntityMap<K, V> extends Map<K, V> {
  private cachedValues: V[] = [];
  private isDirty: boolean = true;

  override set(key: K, value: V): this {
    super.set(key, value);
    this.isDirty = true;
    return this;
  }

  override delete(key: K): boolean {
    const res = super.delete(key);
    if (res) {
      this.isDirty = true;
    }
    return res;
  }

  override clear(): void {
    super.clear();
    this.isDirty = true;
  }

  valuesArray(): readonly V[] {
    if (this.isDirty) {
      this.cachedValues = Array.from(super.values());
      this.isDirty = false;
    }
    return this.cachedValues;
  }
}
