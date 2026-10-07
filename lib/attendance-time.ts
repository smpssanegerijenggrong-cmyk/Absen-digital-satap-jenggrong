const parts = (time: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(new Date(time));

export function jakartaDate(time: string | Date = new Date()) {
  const p = parts(time);
  const get = (type: Intl.DateTimeFormatPartTypes) => p.find(v => v.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function attendanceTiming(time: string, status = 'Hadir') {
  if (status !== 'Hadir' || !Number.isFinite(new Date(time).getTime())) {
    return { late: false, lateMinutes: 0, label: '' };
  }
  const p = parts(time);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(p.find(v => v.type === type)!.value);
  const overdue = get('hour') * 3600 + get('minute') * 60 + get('second') - 7 * 3600;
  const lateMinutes = Math.max(0, Math.ceil(overdue / 60));
  return { late: overdue > 0, lateMinutes, label: overdue > 0 ? 'Terlambat' : 'Tepat waktu' };
}

export function clockWIB(time: string) {
  return new Date(time).toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}
