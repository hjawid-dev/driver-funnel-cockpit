import type { HandoverReason } from './types';

/**
 * The model ends every answer with one line: <meta>{"sources":[...],"handover":null}</meta>.
 * MetaSplitter streams the answer text through and holds back anything that might be the
 * start of that tag, so the driver never sees it.
 */
const OPEN = '<meta>';
const CLOSE = '</meta>';

const REASONS: HandoverReason[] = ['asked', 'unsure', 'personal', 'sensitive', 'urgent', 'pickup'];

export interface Meta {
  sources: string[];
  handover: HandoverReason | null;
  /** Id of an action option the assistant proposes, if any. */
  action: string | null;
}

export class MetaSplitter {
  private buf = '';
  private inMeta = false;
  private meta = '';
  private ids: IdScrubber;

  /** `optionIds`: the action ids the app sent. The driver never sees them, even if the model writes one. */
  constructor(optionIds: Iterable<string> = []) {
    this.ids = new IdScrubber(optionIds);
  }

  /** Feed a chunk; returns the text that is safe to show now. */
  push(chunk: string): string {
    return this.ids.push(this.splitMeta(chunk));
  }

  private splitMeta(chunk: string): string {
    if (this.inMeta) {
      this.meta += chunk;
      return '';
    }
    this.buf += chunk;
    const i = this.buf.indexOf(OPEN);
    if (i >= 0) {
      const out = this.buf.slice(0, i);
      this.meta = this.buf.slice(i + OPEN.length);
      this.buf = '';
      this.inMeta = true;
      return out;
    }
    // Keep a tail that could be the start of "<meta>".
    let keep = 0;
    for (let n = Math.min(OPEN.length - 1, this.buf.length); n > 0; n--) {
      if (OPEN.startsWith(this.buf.slice(-n))) {
        keep = n;
        break;
      }
    }
    const out = this.buf.slice(0, this.buf.length - keep);
    this.buf = this.buf.slice(this.buf.length - keep);
    return out;
  }

  /** Call at the end of the stream: returns any held-back text and the parsed meta. */
  end(knownSources: Set<string>, knownOptions: Set<string> = new Set()): { text: string; meta: Meta } {
    const rest = this.inMeta ? '' : this.buf;
    this.buf = '';
    const text = this.ids.push(rest) + this.ids.end();
    return { text, meta: parseMeta(this.meta.split(CLOSE)[0], knownSources, knownOptions) };
  }
}

/** The ways a model tends to write an id: in brackets or quotes. */
const WRAPS: [string, string][] = [['(', ')'], ['[', ']'], ['“', '”'], ['"', '"'], ["'", "'"], ['`', '`']];
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Removes the app's internal action ids ("(ARRIVED)", "[S2]", "\"G3\"") from the text the driver sees.
 * The prompt already forbids them; this catches the times the model writes one anyway.
 * While streaming, it holds back a short tail that could still become such an id.
 */
export class IdScrubber {
  private buf = '';
  private re: RegExp | null = null;
  private tokens: string[] = [];

  constructor(ids: Iterable<string>) {
    const list = [...new Set(ids)].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!list.length) return;
    const alt = list.map(esc).join('|');
    this.re = new RegExp(`[ \\t]?(?:${WRAPS.map(([o, c]) => `${esc(o)}(?:${alt})${esc(c)}`).join('|')})`, 'g');
    this.tokens = WRAPS.flatMap(([o, c]) => list.map((id) => o + id + c));
  }

  push(chunk: string): string {
    if (!this.re) return chunk;
    // Complete ids go first, then hold back a tail that could still become one.
    const text = (this.buf + chunk).replace(this.re, '');
    const window = Math.max(...this.tokens.map((t) => t.length));
    let cut = text.length;
    for (let i = Math.max(0, text.length - window); i < text.length; i++) {
      const tail = text.slice(i);
      if (this.tokens.some((t) => t.startsWith(tail))) {
        cut = i;
        break;
      }
    }
    // And the spaces before it, so removing an id leaves no double space.
    while (cut > 0 && (text[cut - 1] === ' ' || text[cut - 1] === '\t')) cut--;
    this.buf = text.slice(cut);
    return text.slice(0, cut);
  }

  end(): string {
    const rest = this.buf;
    this.buf = '';
    return this.re ? rest.replace(this.re, '') : rest;
  }
}

/**
 * Lenient parse: unknown article ids are dropped, an action must be one of the options the app
 * sent, and an unreadable tag means no sources, no handover and no action.
 */
export function parseMeta(raw: string, knownSources: Set<string>, knownOptions: Set<string> = new Set()): Meta {
  try {
    const m = JSON.parse(raw.trim()) as { sources?: unknown; handover?: unknown; action?: unknown };
    const sources = Array.isArray(m.sources) ? m.sources.filter((s): s is string => typeof s === 'string' && knownSources.has(s)).slice(0, 3) : [];
    const handover = REASONS.includes(m.handover as HandoverReason) ? (m.handover as HandoverReason) : null;
    // A question handed to a person gets no action: one path at a time.
    const action = !handover && typeof m.action === 'string' && knownOptions.has(m.action) ? m.action : null;
    return { sources: [...new Set(sources)], handover, action };
  } catch {
    return { sources: [], handover: null, action: null };
  }
}
