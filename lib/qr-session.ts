const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function normalizeStudentQR(value: unknown) {
  if (typeof value !== 'string' || value.length > 100) return null;
  const token = value.trim().replace(/^SANJARA:/i, '');
  return UUID.test(token) ? 'SANJARA:' + token.toLowerCase() : null;
}

/**
 * Serializes scan requests and provides a short retry/cooldown window.
 * Holding the same physical card in view is handled separately by the camera
 * latch, so a card removed and presented again can reach the server and show
 * "SUDAH ABSEN HARI INI".
 */
export class ScanSession {
  private busy = false;
  private day = '';
  private retryAfter = new Map<string, number>();

  begin(token: string, day: string, now = Date.now()) {
    if (this.busy) return false;
    if (this.day !== day) {
      this.day = day;
      this.retryAfter.clear();
    }
    if ((this.retryAfter.get(token) || 0) > now) return false;
    this.busy = true;
    return true;
  }

  complete(token: string, cooldown = 1000, now = Date.now()) {
    this.retryAfter.set(token, now + cooldown);
    this.busy = false;
  }

  fail(token: string, cooldown = 1200, now = Date.now()) {
    this.retryAfter.set(token, now + cooldown);
    this.busy = false;
  }

  cancel() {
    this.busy = false;
  }
}
