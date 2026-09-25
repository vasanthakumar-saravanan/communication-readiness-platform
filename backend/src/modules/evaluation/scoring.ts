// M2 score formulas — all computed in Node.js, NOT in FastAPI.

export function computeFillerScore(fillerCount: number): number {
  return Math.max(0, 100 - fillerCount * 5);
}

export function computePaceScore(paceWpm: number, isPaceOptimal: boolean): number {
  if (isPaceOptimal) return 100;
  if (paceWpm < 120) return (paceWpm / 120) * 100;
  return (150 / paceWpm) * 100;
}

export function computeCommunicationScore(params: {
  fluencyScore: number;
  paceScore: number;
  fillerScore: number;
  clarityScore: number;
}): number {
  return (
    params.fluencyScore * 0.35 +
    params.paceScore * 0.25 +
    params.fillerScore * 0.20 +
    params.clarityScore * 0.20
  );
}

export function computeOverallScore(technicalAvg: number, commAvg: number): number {
  return technicalAvg * 0.70 + commAvg * 0.30;
}

export function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}
