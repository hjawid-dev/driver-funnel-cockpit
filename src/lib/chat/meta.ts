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

  /** Feed a chunk; returns the text that is safe to show now. */
  push(chunk: string): string {
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
    const text = this.inMeta ? '' : this.buf;
    this.buf = '';
    return { text, meta: parseMeta(this.meta.split(CLOSE)[0], knownSources, knownOptions) };
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
