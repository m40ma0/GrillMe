// Criteria coverage per section from what the presenter says. Keyword overlap keeps it cheap and live.

const STOP = new Set(["about", "their", "there", "which", "these", "those", "would", "should", "could", "with", "from", "into", "that", "this", "what", "your", "well", "clear", "quality"]);

export function keywords(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, "").slice(0, 6)))];
}

// Words a presenter uses when addressing common criteria families, so coverage follows meaning, not exact terms.
const FAMILIES: { match: RegExp; words: string[] }[] = [
  {
    match: /impact|value|benefit|social|real[- ]world|outcome|problem/i,
    words: ["user", "people", "team", "customer", "save", "hour", "faster", "triage", "help", "problem", "pain", "outcome", "responder", "coordinator"],
  },
  {
    match: /tech|execution|engineering|implement|ai|model|quality|complex/i,
    words: ["model", "classif", "accura", "pipeline", "latency", "architec", "built", "llm", "extract", "api", "evalua", "data"],
  },
  { match: /experience|ux|design|usab|product|interface/i, words: ["dashboard", "screen", "click", "view", "simple", "easy", "workflow", "inbox", "checkli", "review"] },
  { match: /origin|novel|creativ|innovat|unique/i, words: ["first", "unlike", "novel", "unique", "instead", "differen", "new"] },
  { match: /business|market|viab|commercial|adoption/i, words: ["market", "price", "revenue", "pilot", "adopt", "customer", "sell", "pay"] },
];

export class Coverage {
  private readonly scores = new Map<string, Map<string, number>>();
  private readonly terms: Map<string, string[]>;

  constructor(criteria: { id: string; name: string; description: string }[]) {
    this.terms = new Map(
      criteria.map((c) => {
        const text = `${c.name} ${c.description}`;
        const extra = FAMILIES.filter((f) => f.match.test(text)).flatMap((f) => f.words.map((w) => w.slice(0, 6)));
        return [c.id, [...new Set([...keywords(text), ...extra])]];
      }),
    );
  }

  /** Adds a sentence; returns the (criterion, section) cells whose score changed. */
  add(sentence: string, sectionKey: string): { criterionId: string; sectionKey: string; score: number }[] {
    const words = new Set(keywords(sentence));
    const changed: { criterionId: string; sectionKey: string; score: number }[] = [];
    for (const [id, terms] of this.terms) {
      const hits = terms.filter((t) => [...words].some((w) => w.startsWith(t) || t.startsWith(w))).length;
      if (hits === 0) continue;
      const row = this.scores.get(id) ?? new Map<string, number>();
      const score = Math.min(1, (row.get(sectionKey) ?? 0) + 0.25 * hits);
      row.set(sectionKey, Math.round(score * 100) / 100);
      this.scores.set(id, row);
      changed.push({ criterionId: id, sectionKey, score: row.get(sectionKey) ?? 0 });
    }
    return changed;
  }

  total(criterionId: string): number {
    return Math.min(
      1,
      [...(this.scores.get(criterionId)?.values() ?? [])].reduce((a, b) => a + b, 0),
    );
  }

  matrix(): Record<string, Record<string, number>> {
    return Object.fromEntries([...this.terms.keys()].map((id) => [id, Object.fromEntries(this.scores.get(id) ?? [])]));
  }
}
