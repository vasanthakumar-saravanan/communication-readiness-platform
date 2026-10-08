/**
 * Deterministic speech diagnostics for the mock interview (PROJECT_BLUEPRINT §4.4, §7.1, §9.2).
 * Pace and fillers are measured from the transcript and the speaking time — never guessed by
 * the LLM. The LLM only judges technical content, fluency and clarity.
 */

export type PaceLabel = 'Hesitant' | 'Slightly slow' | 'Ideal' | 'Slightly fast' | 'Rushed';

// Single-word fillers. "like" is handled separately: it is usually a real word
// ("I like Java", "annotations like NotNull"), so it only counts in clear filler patterns.
const FILLER_WORDS = new Set(['uh', 'uhh', 'um', 'umm', 'er', 'erm', 'hmm', 'actually', 'basically', 'literally']);
const FILLER_PHRASES = ['you know', 'sort of', 'kind of', 'i mean'];

export const IDEAL_WPM_MIN = 120;
// Below this many words, pace and filler rate are noise (e.g. "I don't know" in 3 s).
export const MIN_WORDS_FOR_DELIVERY = 15;
export const IDEAL_WPM_MAX = 150;

export interface SpeechMetrics {
  wordCount: number;
  durationSec: number | null;
  wpm: number | null;               // null when the speaking time was not measured
  paceLabel: PaceLabel | null;
  paceScore: number | null;         // 0-100
  fillerCount: number;
  fillerBreakdown: Record<string, number>;
  fillerScore: number | null;       // 0-100 (100 = no fillers); null for very short answers
}

function tokenize(transcript: string): string[] {
  return transcript.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
}

export function countFillers(transcript: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (filler: string) => { counts[filler] = (counts[filler] ?? 0) + 1; };

  // "like" set off by commas (", like," / "Like, ...") is a filler, whatever surrounds it
  const commaLike = /(^|[,.!?]\s*)like\s*,/gi;
  (transcript.match(commaLike) ?? []).forEach(() => add('like'));
  const words = tokenize(transcript.replace(commaLike, '$1'));

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const pair = i + 1 < words.length ? `${word} ${words[i + 1]}` : '';
    if (FILLER_PHRASES.includes(pair)) {
      add(pair);
      i++; // the phrase's second word is consumed
      continue;
    }
    if (FILLER_WORDS.has(word)) {
      add(word.replace(/(.)\1+$/, '$1')); // "umm" → "um", "uhh" → "uh"
      continue;
    }
    // Without punctuation (browser speech-to-text), only "like like" or "like" next to
    // another filler is counted — a false filler is worse than a missed one.
    if (word === 'like') {
      const prev = words[i - 1] ?? '';
      const next = words[i + 1] ?? '';
      const nextPair = `${next} ${words[i + 2] ?? ''}`;
      if (next === 'like' || FILLER_WORDS.has(prev) || FILLER_WORDS.has(next) || FILLER_PHRASES.includes(nextPair)) add('like');
    }
  }
  return counts;
}

export function classifyPace(wpm: number): PaceLabel {
  if (wpm < 110) return 'Hesitant';
  if (wpm < IDEAL_WPM_MIN) return 'Slightly slow';
  if (wpm <= IDEAL_WPM_MAX) return 'Ideal';
  if (wpm <= 160) return 'Slightly fast';
  return 'Rushed';
}

// 100 inside the ideal band, 85 just outside it, then −1.5 per WPM further away (floor 30).
export function scorePace(wpm: number): number {
  if (wpm >= IDEAL_WPM_MIN && wpm <= IDEAL_WPM_MAX) return 100;
  if (wpm >= 110 && wpm <= 160) return 85;
  const distance = wpm < 110 ? 110 - wpm : wpm - 160;
  return Math.max(30, Math.round(85 - distance * 1.5));
}

// Fillers per 100 words: 0 → 100, each filler per 100 words costs 6 points
// (5 per 100 words → 70; 11 per 100 words → 34).
export function scoreFillers(fillerCount: number, wordCount: number): number {
  if (wordCount === 0) return 100;
  return Math.max(0, Math.round(100 - (fillerCount / wordCount) * 100 * 6));
}

/**
 * @param durationSec time the candidate actually spoke (first to last voice activity), as
 *   reported by the client. Ignored when missing or implausible, so WPM is never invented.
 */
export function computeSpeechMetrics(transcript: string, durationSec?: number | null): SpeechMetrics {
  const wordCount = tokenize(transcript).length;
  const fillerBreakdown = countFillers(transcript);
  const fillerCount = Object.values(fillerBreakdown).reduce((sum, n) => sum + n, 0);

  const validDuration = typeof durationSec === 'number' && Number.isFinite(durationSec)
    && durationSec >= 2 && durationSec <= 900 && wordCount >= MIN_WORDS_FOR_DELIVERY;
  const wpm = validDuration ? Math.round((wordCount / (durationSec as number)) * 60) : null;
  // Outside 40-300 WPM the timing is broken (e.g. the mic stayed open), not the speaker
  const plausible = wpm !== null && wpm >= 40 && wpm <= 300;

  return {
    wordCount,
    durationSec: validDuration ? Math.round((durationSec as number) * 10) / 10 : null,
    wpm: plausible ? wpm : null,
    paceLabel: plausible ? classifyPace(wpm as number) : null,
    paceScore: plausible ? scorePace(wpm as number) : null,
    fillerCount,
    fillerBreakdown,
    fillerScore: wordCount >= MIN_WORDS_FOR_DELIVERY ? scoreFillers(fillerCount, wordCount) : null,
  };
}

/**
 * Communication score per PROJECT_BLUEPRINT §9.2:
 * Fluency 35% + Pace 25% + Filler penalty 20% + Clarity & Tone 20%.
 * A part that could not be measured (no speaking time, answer too short) is left
 * out and its weight is spread over the others.
 */
export function communicationScore(parts: {
  fluency: number; clarity: number; fillerScore: number | null; paceScore: number | null;
}): number {
  const weighted = [
    { score: parts.fluency, weight: 0.35 },
    { score: parts.paceScore, weight: 0.25 },
    { score: parts.fillerScore, weight: 0.20 },
    { score: parts.clarity, weight: 0.20 },
  ].filter((p): p is { score: number; weight: number } => p.score !== null);
  const totalWeight = weighted.reduce((sum, p) => sum + p.weight, 0);
  return Math.round(weighted.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight);
}

// Final Score = Technical × 0.70 + Communication × 0.30 (PROJECT_BLUEPRINT §9.2)
export const overallScore = (technical: number, communication: number): number =>
  Math.round(technical * 0.7 + communication * 0.3);

// ── Pauses / hesitation (PROJECT_BLUEPRINT §4.4 "Sentence Breaking & Pauses") ──

// A silence of at least this long while answering counts as dead air
export const PAUSE_THRESHOLD_SEC = 2.5;

/**
 * 100 with no long pauses; −12 per long pause per minute of speaking, floor 30.
 * e.g. 1 pause in a 60 s answer → 88, 2 pauses in 30 s → 52. Null when not measured.
 */
export function scorePauses(pauseCount: number | null | undefined, durationSec: number | null): number | null {
  if (typeof pauseCount !== 'number' || pauseCount < 0 || !durationSec) return null;
  const perMinute = pauseCount / (durationSec / 60);
  return Math.max(30, Math.round(100 - perMinute * 12));
}

/** Fluency = 70% evaluator judgement (flow, complete sentences) + 30% measured pauses. */
export function blendFluency(llmFluency: number, pauseScore: number | null): number {
  return pauseScore === null ? llmFluency : Math.round(llmFluency * 0.7 + pauseScore * 0.3);
}

/**
 * Technical = 60% evaluator judgement + 40% rubric coverage (key points covered
 * correctly / key points). A non-answer stays 0; without a rubric the judgement is used as is.
 */
export function blendTechnical(llmTechnical: number, covered: number, total: number): number {
  if (llmTechnical === 0 || total === 0) return llmTechnical;
  const coverage = (Math.min(covered, total) / total) * 100;
  return Math.round(llmTechnical * 0.6 + coverage * 0.4);
}
