import { describe, it, expect } from '@jest/globals';
import {
  countFillers,
  computeSpeechMetrics,
  classifyPace,
  scorePace,
  scoreFillers,
  scorePauses,
  blendFluency,
  blendTechnical,
  communicationScore,
  overallScore,
} from '../services/speechMetrics';
import { buildInterviewReport } from '../services/interviewReport';
import type { TurnResult } from '../services/sessionContextService';

describe('filler words (blueprint §4.4)', () => {
  it('counts the listed fillers exactly', () => {
    expect(countFillers('um uh basically you know actually')).toEqual({
      um: 1, uh: 1, basically: 1, 'you know': 1, actually: 1,
    });
  });
  it('does not count "like" used as a real word', () => {
    expect(countFillers('I like Java and we use tools like Docker, it looks like a cache issue')).toEqual({});
  });
  it('counts "like" set off by commas or next to another filler', () => {
    expect(countFillers('I would, like, use a queue')).toEqual({ like: 1 });
    expect(countFillers('so like um it is like like a stack')).toEqual({ like: 2, um: 1 });
  });
});

describe('pace (blueprint §4.4: <110 hesitant, 120-150 ideal, >160 rushed)', () => {
  it('classifies the bands', () => {
    expect(classifyPace(100)).toBe('Hesitant');
    expect(classifyPace(135)).toBe('Ideal');
    expect(classifyPace(170)).toBe('Rushed');
  });
  it('scores 100 inside the ideal band and less outside it', () => {
    expect(scorePace(130)).toBe(100);
    expect(scorePace(155)).toBe(85);
    expect(scorePace(90)).toBeLessThan(85);
  });
  it('measures WPM from speaking time and never invents it', () => {
    const answer = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';
    expect(computeSpeechMetrics(answer, 8).wpm).toBe(120);
    expect(computeSpeechMetrics(answer, undefined).wpm).toBeNull();
    expect(computeSpeechMetrics("I don't know", 3).wpm).toBeNull(); // too short to measure
  });
});

describe('component scores', () => {
  it('filler penalty: 6 points per filler per 100 words', () => {
    expect(scoreFillers(0, 100)).toBe(100);
    expect(scoreFillers(5, 100)).toBe(70);
  });
  it('pause penalty: 12 points per long pause per minute, floor 30', () => {
    expect(scorePauses(0, 60)).toBe(100);
    expect(scorePauses(1, 60)).toBe(88);
    expect(scorePauses(10, 30)).toBe(30);
    expect(scorePauses(null, 60)).toBeNull();
  });
  it('fluency = 70% evaluator + 30% pauses', () => {
    expect(blendFluency(80, 100)).toBe(86);
    expect(blendFluency(80, null)).toBe(80);
  });
  it('technical = 60% evaluator + 40% key-point coverage; non-answers stay 0', () => {
    expect(blendTechnical(80, 4, 5)).toBe(80);  // 48 + 32
    expect(blendTechnical(80, 1, 5)).toBe(56);  // 48 + 8
    expect(blendTechnical(0, 3, 5)).toBe(0);
    expect(blendTechnical(70, 0, 0)).toBe(70);  // no rubric → evaluator only
  });
});

describe('blueprint §9.2 formula', () => {
  it('communication = fluency 35% + pace 25% + fillers 20% + clarity 20%', () => {
    expect(communicationScore({ fluency: 80, paceScore: 100, fillerScore: 70, clarity: 60 })).toBe(79);
  });
  it('re-weights when a component could not be measured', () => {
    expect(communicationScore({ fluency: 80, paceScore: null, fillerScore: null, clarity: 60 })).toBe(73);
  });
  it('overall = technical 70% + communication 30%', () => {
    expect(overallScore(80, 60)).toBe(74);
  });
});

function turn(overrides: Partial<TurnResult>): TurnResult {
  return {
    turn: 1, question: 'Q', difficulty: 'EASY', category: 'Databases', answer: 'A',
    technicalScore: 50, llmTechnicalScore: 50, keyPoints: [], pointsCovered: [], pointsMissed: [],
    fluencyScore: 70, clarityScore: 70, communicationScore: 70, overallScore: 56,
    wpm: 130, paceLabel: 'Ideal', paceScore: 100, fillerScore: 100, pauseCount: 0, longestPauseSec: null,
    responseLatencySec: 2, fillerCount: 0, fillerBreakdown: {}, feedback: '', strengths: '', weaknesses: '',
    ts: new Date().toISOString(),
    ...overrides,
  };
}

describe('session report', () => {
  it('weights harder questions more and the introduction half', () => {
    const report = buildInterviewReport({
      attemptId: 'a',
      plannedTurns: 3,
      tabSwitches: 0,
      turns: [
        turn({ turn: 1, category: 'Introduction', difficulty: 'EASY', technicalScore: 40 }),
        turn({ turn: 2, difficulty: 'EASY', technicalScore: 50 }),
        turn({ turn: 3, difficulty: 'ADVANCED', technicalScore: 90 }),
      ],
    });
    // (40×0.5 + 50×1 + 90×1.4) / (0.5 + 1 + 1.4) = 196 / 2.9 = 67.6
    expect(report.technicalScore).toBe(68);
    expect(report.overallScore).toBe(overallScore(68, 70));
  });
  it('turns missed key points into recommendations', () => {
    const report = buildInterviewReport({
      attemptId: 'a',
      plannedTurns: 1,
      tabSwitches: 3,
      turns: [turn({ technicalScore: 40, pointsMissed: ['Cache invalidation on update'] })],
    });
    expect(report.actionableNextSteps.some((s) => s.includes('Cache invalidation on update'))).toBe(true);
    expect(report.isFlagged).toBe(true);
  });
});
