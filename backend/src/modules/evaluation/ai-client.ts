import axios from 'axios';
import { env } from '../../config/env';

// ── Evaluate Turn ─────────────────────────────────────────────────────────────
// FastAPI endpoint: POST /ai/evaluate-turn
// FastAPI scores are on a 0–10 scale; M2 normalizes them to 0–100.

export interface AIEvaluateRequest {
  question_text: string;
  student_answer: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  turn_number?: number;
  domain?: string;
}

export interface AIEvaluateResponse {
  technical_score: number;              // 0–100 (FastAPI 0–10 × 10)
  communication_score: number;          // 0–100 (FastAPI 0–10 × 10)
  wpm: number;
  filler_count: number;                 // mapped from FastAPI's filler_words
  feedback: string;
  strengths: string;
  weaknesses: string;
  next_recommended_difficulty: string;  // EASY | MEDIUM | ADVANCED
  model_used: string;
  latency_ms: number;
}

// ── Generate Question ─────────────────────────────────────────────────────────
// FastAPI endpoint: POST /ai/generate-question

export interface AIPreviousTurn {
  question_text: string;
  student_answer: string;
  difficulty: string;
  technical_score?: number;
  feedback?: string;
}

export interface AIGenerateQuestionRequest {
  student_name: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  previous_turns?: AIPreviousTurn[];
  domain?: string;
}

export interface AIGenerateQuestionResponse {
  question_text: string;
  difficulty: string;
  category?: string;
}

// ── HTTP client ───────────────────────────────────────────────────────────────

const ai = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: 30_000,
});

export async function evaluateResponse(
  req: AIEvaluateRequest
): Promise<AIEvaluateResponse & { unreachable?: boolean }> {
  try {
    const start = Date.now();
    const { data } = await ai.post<{
      technical_score: number;
      communication_score: number;
      wpm: number;
      filler_words: number;
      feedback: string;
      strengths: string;
      weaknesses: string;
      next_recommended_difficulty: string;
    }>('/ai/evaluate-turn', req);
    const latencyMs = Date.now() - start;

    return {
      technical_score: Math.round(data.technical_score * 10 * 100) / 100,
      communication_score: Math.round(data.communication_score * 10 * 100) / 100,
      wpm: data.wpm,
      filler_count: data.filler_words,
      feedback: data.feedback,
      strengths: data.strengths,
      weaknesses: data.weaknesses,
      next_recommended_difficulty: data.next_recommended_difficulty,
      model_used: 'fastapi',
      latency_ms: latencyMs,
    };
  } catch {
    return {
      technical_score: 0,
      communication_score: 0,
      wpm: 0,
      filler_count: 0,
      feedback: '',
      strengths: '',
      weaknesses: '',
      next_recommended_difficulty: 'EASY',
      model_used: 'unavailable',
      latency_ms: 0,
      unreachable: true,
    };
  }
}

export async function generateQuestion(
  req: AIGenerateQuestionRequest
): Promise<AIGenerateQuestionResponse & { unreachable?: boolean }> {
  try {
    const { data } = await ai.post<AIGenerateQuestionResponse>('/ai/generate-question', req);
    return data;
  } catch {
    return {
      question_text: '',
      difficulty: req.difficulty,
      unreachable: true,
    };
  }
}
