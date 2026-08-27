export class IdempotencyIdentity {
  private current: { fingerprint: string; key: string } | null = null;

  keyFor(value: unknown): string {
    const fingerprint = JSON.stringify(value);
    if (this.current?.fingerprint !== fingerprint) {
      this.current = { fingerprint, key: crypto.randomUUID() };
    }
    return this.current.key;
  }

  clear(): void {
    this.current = null;
  }
}
