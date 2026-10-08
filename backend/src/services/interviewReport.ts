/**
 * Final diagnostic report for a live mock interview, built only from what the
 * server measured and evaluated turn by turn (shape matches the frontend's
 * DiagnosticReport). Final = Technical avg × 0.70 + Communication avg × 0.30,
 * where the technical average is weighted by question difficulty.
 */

import { TurnResult } from './sessionContextService';
import { IDEAL_WPM_MAX, IDEAL_WPM_MIN, classifyPace, overallScore } from './speechMetrics';

export interface InterviewReport {
  id: string;
  date: string;
  sessionType: 'MOCK_INTERVIEW';
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  fluencyScore: number;
  clarityScore: number;
  averageWpm: number;          // 0 when pace could not be measured
  paceLabel: string | null;
  totalFillerWords: number;
  fillerWordBreakdown: Record<string, number>;
  skillBreakdown: { skill: string; score: number; status: 'STRONG' | 'MODERATE' | 'NEEDS_WORK'; recommendation: string }[];
  actionableNextSteps: string[];
  tabSwitches: number;
  isFlagged: boolean;
  questionsAnswered: number;
  questionsPlanned: number;
  longPauses: number;
  averageResponseLatencySec: number | null;
  scoringMethod: string[];
  turns: Pick<TurnResult, 'turn' | 'question' | 'difficulty' | 'technicalScore' | 'communicationScore' | 'overallScore'
    | 'wpm' | 'fillerCount' | 'pauseCount' | 'feedback' | 'pointsCovered' | 'pointsMissed'>[];
}

// Harder questions count more towards the technical average; the self-introduction
// counts half — it shows communication more than technical depth.
const DIFFICULTY_WEIGHT: Record<TurnResult['difficulty'], number> = { EASY: 1, MEDIUM: 1.2, ADVANCED: 1.4 };
const turnWeight = (t: TurnResult) => DIFFICULTY_WEIGHT[t.difficulty] * (t.category === 'Introduction' ? 0.5 : 1);

function weightedMean(turns: TurnResult[], value: (t: TurnResult) => number): number {
  const totalWeight = turns.reduce((sum, t) => sum + turnWeight(t), 0);
  return totalWeight ? turns.reduce((sum, t) => sum + value(t) * turnWeight(t), 0) / totalWeight : 0;
}

// Tab switches at or above this are logged as a proctoring concern (blueprint §9.1 level 2)
const FLAG_TAB_SWITCHES = 3;

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const status = (score: number): 'STRONG' | 'MODERATE' | 'NEEDS_WORK' =>
  score >= 80 ? 'STRONG' : score >= 60 ? 'MODERATE' : 'NEEDS_WORK';
const trim = (text: string, max = 240) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function paceAdvice(wpm: number): string {
  const label = classifyPace(wpm);
  if (label === 'Ideal') return `Your pace averaged ${wpm} WPM, inside the ideal ${IDEAL_WPM_MIN}-${IDEAL_WPM_MAX} WPM band — keep that rhythm under pressure.`;
  if (label === 'Hesitant' || label === 'Slightly slow') {
    return `Your pace averaged ${wpm} WPM (${label.toLowerCase()}). Aim for ${IDEAL_WPM_MIN}-${IDEAL_WPM_MAX} WPM: structure each answer as point → reason → example before you start speaking.`;
  }
  return `Your pace averaged ${wpm} WPM (${label.toLowerCase()}). Slow to ${IDEAL_WPM_MIN}-${IDEAL_WPM_MAX} WPM and pause briefly between ideas so the interviewer can follow.`;
}

export function buildInterviewReport(input: {
  attemptId: string;
  turns: TurnResult[];
  plannedTurns: number;
  tabSwitches: number;
}): InterviewReport {
  const { turns } = input;
  const technical = Math.round(weightedMean(turns, (t) => t.technicalScore));
  const communication = Math.round(mean(turns.map((t) => t.communicationScore)));
  const measured = turns.filter((t) => t.wpm !== null).map((t) => t.wpm as number);
  const averageWpm = measured.length ? Math.round(mean(measured)) : 0;

  const fillerWordBreakdown: Record<string, number> = {};
  for (const t of turns) {
    for (const [word, count] of Object.entries(t.fillerBreakdown)) {
      fillerWordBreakdown[word] = (fillerWordBreakdown[word] ?? 0) + count;
    }
  }
  const totalFillerWords = Object.values(fillerWordBreakdown).reduce((a, b) => a + b, 0);

  // One entry per question topic, judged on technical score; the weakest answer's
  // evaluator notes become the recommendation.
  const byCategory = new Map<string, TurnResult[]>();
  for (const t of turns) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  const skillBreakdown = [...byCategory.entries()].slice(0, 6).map(([category, group]) => {
    const score = Math.round(mean(group.map((t) => t.technicalScore)));
    const weakest = group.reduce((a, b) => (b.technicalScore < a.technicalScore ? b : a));
    const missed = [...new Set(group.flatMap((t) => t.pointsMissed ?? []))];
    return {
      skill: category,
      score,
      status: status(score),
      recommendation: trim(score >= 80
        ? weakest.strengths || weakest.feedback
        : missed.length ? `Missed: ${missed.slice(0, 3).join('; ')}.` : weakest.weaknesses || weakest.feedback),
    };
  });
  const fluency = Math.round(mean(turns.map((t) => t.fluencyScore)));
  const clarity = Math.round(mean(turns.map((t) => t.clarityScore)));
  skillBreakdown.push({
    skill: 'Verbal Communication',
    score: communication,
    status: status(communication),
    recommendation: `Fluency ${fluency}/100, clarity & tone ${clarity}/100` +
      (averageWpm ? `, pace ${averageWpm} WPM` : '') + `, ${totalFillerWords} filler word(s).`,
  });

  const longPauses = turns.reduce((sum, t) => sum + (t.pauseCount ?? 0), 0);
  const latencies = turns.map((t) => t.responseLatencySec).filter((l): l is number => l !== null && l !== undefined);
  const averageResponseLatencySec = latencies.length ? Math.round(mean(latencies) * 10) / 10 : null;

  const steps: string[] = [];
  if (averageWpm) steps.push(paceAdvice(averageWpm));
  if (longPauses > 0) {
    steps.push(`You had ${longPauses} long silence(s) mid-answer. Bridge thinking time with a short framing sentence ("There are two parts to this…") instead of dead air.`);
  }
  if (averageResponseLatencySec !== null && averageResponseLatencySec > 5) {
    steps.push(`You took ${averageResponseLatencySec}s on average to start answering. Open with a one-line summary of your answer, then expand.`);
  }
  if (totalFillerWords > 0) {
    const [topWord, topCount] = Object.entries(fillerWordBreakdown).sort((a, b) => b[1] - a[1])[0];
    steps.push(`You used ${totalFillerWords} filler word(s), most often "${topWord}" (${topCount}×). Replace them with a short silent pause while you think.`);
  } else {
    steps.push('No filler words were detected — keep pausing silently instead of filling gaps.');
  }
  const skipped = turns.filter((t) => t.technicalScore === 0).length;
  if (skipped > 0) {
    steps.push(`You gave no workable answer to ${skipped} question(s). When unsure, reason aloud from fundamentals instead of stopping — partial reasoning still earns credit.`);
  }
  // The two weakest attempted answers point at the concepts to revisit
  turns
    .filter((t) => t.technicalScore > 0 && t.technicalScore < 70)
    .sort((a, b) => a.technicalScore - b.technicalScore)
    .slice(0, 2)
    .forEach((t) => steps.push(t.pointsMissed?.length
      ? `Revisit (Q${t.turn}): ${trim(t.pointsMissed.join('; '), 200)}`
      : `Revisit (Q${t.turn}): ${trim(t.weaknesses || t.feedback, 200)}`));
  if (technical >= 80) {
    steps.push('Strong technical session — next, practise ADVANCED follow-ups and explicitly state trade-offs and failure cases in every answer.');
  }

  return {
    id: input.attemptId,
    date: new Date().toISOString().split('T')[0],
    sessionType: 'MOCK_INTERVIEW',
    overallScore: overallScore(technical, communication),
    technicalScore: technical,
    communicationScore: communication,
    fluencyScore: fluency,
    clarityScore: clarity,
    averageWpm,
    paceLabel: averageWpm ? classifyPace(averageWpm) : null,
    totalFillerWords,
    fillerWordBreakdown,
    skillBreakdown,
    actionableNextSteps: steps.slice(0, 6),
    tabSwitches: input.tabSwitches,
    isFlagged: input.tabSwitches >= FLAG_TAB_SWITCHES,
    questionsAnswered: turns.length,
    questionsPlanned: input.plannedTurns,
    longPauses,
    averageResponseLatencySec,
    scoringMethod: [
      'Overall = Technical 70% + Communication 30% (PROJECT_BLUEPRINT §9.2).',
      'Technical per answer = 60% evaluator judgement + 40% key points covered from that question\'s rubric; the session average weights EASY ×1.0, MEDIUM ×1.2, ADVANCED ×1.4 and the self-introduction ×0.5.',
      `Communication = Fluency 35% + Pace 25% + Filler words 20% + Clarity 20%. Pace and fillers are measured from your speech (ideal ${IDEAL_WPM_MIN}-${IDEAL_WPM_MAX} WPM); fluency includes measured long pauses.`,
      'Non-answers ("I don\'t know", off-topic) score 0 for technical content and are not credited for delivery.',
    ],
    turns: turns.map((t) => ({
      turn: t.turn, question: t.question, difficulty: t.difficulty,
      technicalScore: t.technicalScore, communicationScore: t.communicationScore, overallScore: t.overallScore,
      wpm: t.wpm, fillerCount: t.fillerCount, pauseCount: t.pauseCount ?? null, feedback: t.feedback,
      pointsCovered: t.pointsCovered ?? [], pointsMissed: t.pointsMissed ?? [],
    })),
  };
}
