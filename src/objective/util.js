export async function mapLimit(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const out = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, list.length || 1)) }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(list[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s)]+/i);
  return match ? match[0].replace(/[.,;]+$/, '') : null;
}

export function clip(value, n = 280) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, n) : null;
}
