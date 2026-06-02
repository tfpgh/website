export class BoundedCache<K, V> {
  private values = new Map<K, V>();

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    return this.values.get(key);
  }

  has(key: K): boolean {
    return this.values.has(key);
  }

  set(key: K, value: V): void {
    this.values.set(key, value);
    if (this.values.size > this.maxSize) {
      this.values.delete(this.values.keys().next().value as K);
    }
  }

  delete(key: K): boolean {
    return this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}
