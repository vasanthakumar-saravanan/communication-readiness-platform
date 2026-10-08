import { Router, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

export const suggestionsRouter = Router();

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
});

// ── POST /api/suggestions/message ─────────────────────────────────────────────
// Forwards the user's coaching question to the AI service and returns a
// structured communication-coaching reply. Requires STUDENT role.

suggestionsRouter.post(
  '/message',
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = messageSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'message is required', 'VALIDATION_ERROR');
      const { message, sessionId } = parsed.data;

      const aiServiceUrl = env.AI_SERVICE_URL || 'http://127.0.0.1:8002';
      let aiReply: {
        reply: string;
        technicalTerminology?: { term: string; definition: string; betterAlternativeTo: string }[];
        communicationSuggestions?: string[];
        structuralAdvice?: string[];
      };

      try {
        const aiRes = await fetch(`${aiServiceUrl}/ai/coaching`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': env.AI_INTERNAL_KEY,
          },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!aiRes.ok) throw new Error(`AI service returned ${aiRes.status}`);
        aiReply = (await aiRes.json()) as typeof aiReply;
      } catch (aiErr) {
        // Graceful fallback: structured coaching without AI if service is unavailable
        console.warn('[suggestions] AI service unavailable, using rule-based fallback:', aiErr);
        const lower = message.toLowerCase();
        aiReply = buildFallbackReply(lower);
      }

      const now = new Date().toISOString();
      const userMsg = {
        id: `msg_${Date.now()}_u`,
        role: 'user' as const,
        content: message,
        createdAt: now,
      };
      const assistantMsg = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant' as const,
        content: aiReply.reply,
        technicalTerminology: aiReply.technicalTerminology ?? [],
        communicationSuggestions: aiReply.communicationSuggestions ?? [],
        structuralAdvice: aiReply.structuralAdvice ?? [],
        createdAt: now,
      };

      sendSuccess(res, {
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        sessionId: sessionId ?? null,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

function buildFallbackReply(lower: string): {
  reply: string;
  technicalTerminology: { term: string; definition: string; betterAlternativeTo: string }[];
  communicationSuggestions: string[];
  structuralAdvice: string[];
} {
  if (lower.includes('pacing') || lower.includes('speed') || lower.includes('wpm')) {
    return {
      reply: 'For technical interviews, optimal speaking pace is 120–150 words per minute. Pause briefly between clauses instead of using vocal fillers.',
      technicalTerminology: [],
      communicationSuggestions: ['Take a breath before answering complex questions.', 'Replace fillers with deliberate pauses.'],
      structuralAdvice: ['Lead with the conclusion, then explain how you got there.'],
    };
  }
  if (lower.includes('filler') || lower.includes('um') || lower.includes('like')) {
    return {
      reply: 'Filler words appear when your brain plans faster than you speak. Outline your answer mentally before starting.',
      technicalTerminology: [],
      communicationSuggestions: ['Pause rather than saying "basically" or "sort of".', 'Conclude with confidence rather than trailing off.'],
      structuralAdvice: ['Use the STAR framework: Situation → Task → Action → Result.'],
    };
  }
  return {
    reply: 'Structure your answer using the STAR framework. Lead with the high-level point, then support it with specific details and measurable outcomes.',
    technicalTerminology: [
      { term: 'STAR Framework', definition: 'Situation, Task, Action, Result — a structured answer format.', betterAlternativeTo: 'Rambling narrative' },
    ],
    communicationSuggestions: ['Lead with the trade-off before diving into implementation details.'],
    structuralAdvice: ['Problem Scope → Architectural Decision → Impact (latency, throughput, or memory).'],
  };
}
