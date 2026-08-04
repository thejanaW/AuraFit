// Device-local calendar helpers (NOT UTC) — the phone decides when "today"
// and "this month" roll over. Every habit/streak endpoint follows this
// convention: the client sends its local date, the server trusts it.

export function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localMonth() {
  return localToday().slice(0, 7);
}
