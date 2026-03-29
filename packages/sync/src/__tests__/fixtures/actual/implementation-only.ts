function processOrder(id: string): void {
  console.log(id);
}

class OrderProcessor {
  private cache: Map<string, unknown> = new Map();

  process(id: string): void {
    this.cache.set(id, {});
  }
}
