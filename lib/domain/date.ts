export function riyadhDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Server-generated civil timestamp in Asia/Riyadh, split for trip IDs.
export function riyadhDeparture(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const datePart = `${part('day')}/${part('month')}`;
  const timePart = `${part('hour') === '24' ? '00' : part('hour')}:${part('minute')}`;
  return {
    datePart,
    timePart,
    // Full ISO timestamp with explicit +03:00 offset, minute precision.
    iso: `${part('year')}-${part('month')}-${part('day')}T${timePart}:00+03:00`,
  };
}
