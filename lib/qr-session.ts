const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function normalizeStudentQR(value: unknown) {
  if (typeof value !== 'string' || value.length > 100) return null;
  const token = value.trim().replace(/^SANJARA:/i, '');
  return UUID.test(token) ? 'SANJARA:' + token.toLowerCase() : null;
}

/**
 * Prevents the same video frame from spamming the API, but never hides the
 * server's duplicate-attendance result permanently. A card can be scanned
 * again after a short cooldown, so the UI can show "SUDAH ABSEN HARI INI".
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

  complete(token: string, cooldown = 4000, now = Date.now()) {
    this.retryAfter.set(token, now + cooldown);
    this.busy = false;
  }

  fail(token: string, cooldown = 1500, now = Date.now()) {
    this.retryAfter.set(token, now + cooldown);
    this.busy = false;
  }

  cancel() {
    this.busy = false;
  }
}
