import { HELP, type HelpArticle } from '../../content/help';

/**
 * Article search without AI: the fallback when the assistant is switched off or unavailable,
 * so the demo (and the driver) is never left without an answer.
 */
const STOP = new Set('a an and are at be can do does for from have how i if in is it me my of on or the to what when where who why will with you your'.split(' '));

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export function searchHelp(query: string, limit = 3): HelpArticle[] {
  const q = words(query);
  if (!q.length) return [];
  const scored = HELP.map((h) => {
    const title = words(h.title);
    const tags = words(h.tags.join(' '));
    const body = words(h.body);
    let score = 0;
    for (const w of q) {
      const hit = (list: string[]) => list.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x)) && x.length >= 4));
      if (hit(tags)) score += 3;
      if (hit(title)) score += 2;
      if (hit(body)) score += 1;
    }
    return { h, score };
  });
  return scored
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.h);
}
