const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function normalizeStudentQR(value: unknown) {
  if (typeof value !== 'string' || value.length > 100) return null;
  const token = value.trim().replace(/^SANJARA:/i, '');
  return UUID.test(token) ? 'SANJARA:' + token.toLowerCase() : null;
}

/** One request at a time, with a daily duplicate guard and recoverable failures. */
export class ScanSession {
  private busy = false;
  private day = '';
  private recorded = new Set<string>();
  private retryAfter = new Map<string, number>();

  begin(token: string, day: string, now = Date.now()) {
    if (this.busy) return false;
    if (this.day !== day) {
      this.day = day;
      this.recorded.clear();
      this.retryAfter.clear();
    }
    if (this.recorded.has(token) || (this.retryAfter.get(token) || 0) > now) return false;
    this.busy = true;
    return true;
  }

  complete(token: string) {
    this.recorded.add(token);
    this.retryAfter.delete(token);
    this.busy = false;
  }

  fail(token: string, cooldown = 2000, now = Date.now()) {
    this.retryAfter.set(token, now + cooldown);
    this.busy = false;
  }

  cancel() { this.busy = false; }
}
