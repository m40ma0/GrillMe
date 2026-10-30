import type { Segment, Word } from "@stage-ready/shared";

/** Splits a final STT segment into sentences, keeping word timestamps. */
export function splitSentences(segment: Segment): Segment[] {
  const parts =
    segment.text
      .match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (parts.length <= 1) return [segment];
  const out: Segment[] = [];
  let wordIndex = 0;
  parts.forEach((text, i) => {
    const count = text.split(/\s+/).length;
    const words: Word[] = segment.words.slice(wordIndex, wordIndex + count);
    wordIndex += count;
    const span = segment.endMs - segment.startMs;
    const startMs = words[0]?.startMs ?? Math.round(segment.startMs + (span * i) / parts.length);
    const endMs = words.at(-1)?.endMs ?? Math.round(segment.startMs + (span * (i + 1)) / parts.length);
    out.push({ ...segment, id: `${segment.id}.${i}`, text, words, startMs, endMs });
  });
  return out;
}

const YIELD_PHRASE = /\b(let me finish|let me (just )?(continue|get to that|answer)|hold on|one (moment|second|sec)|i'?m getting (to|there))\b/i;
export const asksToFinish = (text: string) => YIELD_PHRASE.test(text);

const HEDGES = /\b(maybe|kind of|sort of|basically|i guess|probably|we hope|it depends|something like|stuff|things like that)\b/i;
const SPECIFIC = /\d|%|\b(measured|tested|benchmark|eval|users? (said|told)|for example|e\.g\.|specifically|in our (test|pilot))\b/i;

/** A Q&A answer is vague when it is short, or hedges without one specific number or example. */
export function isVagueAnswer(answer: string): boolean {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return false;
  if (words < 12) return !SPECIFIC.test(answer);
  return HEDGES.test(answer) && !SPECIFIC.test(answer);
}
