/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeepgramClient, ListenV1InterimResults, ListenV1SmartFormat, ListenV1VadEvents } from '@deepgram/sdk';
import { env } from '../config/env';
import { wsManager } from './wsManager';

export interface AudioStartMeta {
  questionText: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  turnNumber: number;
  studentId: string;
  domain?: string;
}

interface DeepgramSession {
  socket: any;
  transcript: string;
  triggered: boolean;
  meta: AudioStartMeta;
  pendingChunks: Buffer[];
  isOpen: boolean;
}

const sessions = new Map<string, DeepgramSession>();

type EagerEndCallback = (transcript: string, meta: AudioStartMeta) => Promise<void>;

export async function openSession(
  sessionId: string,
  meta: AudioStartMeta,
  onEagerEnd: EagerEndCallback,
): Promise<void> {
  const existing = sessions.get(sessionId);
  if (existing) {
    try { existing.socket.sendCloseStream({}); } catch {}
    sessions.delete(sessionId);
  }

  if (!env.DEEPGRAM_API_KEY) {
    console.warn(`[Deepgram] DEEPGRAM_API_KEY not set — session skipped session=${sessionId}`);
    return;
  }

  const deepgram = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });
  let socket: any;

  try {
    socket = await deepgram.listen.v1.connect({
      model: 'nova-3',
      language: 'en',
      interim_results: ListenV1InterimResults.True,
      utterance_end_ms: 1000,
      endpointing: 300,
      smart_format: ListenV1SmartFormat.True,
      vad_events: ListenV1VadEvents.True,
      filler_words: 'true',
      Authorization: env.DEEPGRAM_API_KEY,
    } as any);
  } catch (err) {
    console.error(`[Deepgram] connect failed session=${sessionId}:`, err);
    return;
  }

  const session: DeepgramSession = {
    socket,
    transcript: '',
    triggered: false,
    meta,
    pendingChunks: [],
    isOpen: false,
  };
  sessions.set(sessionId, session);

  socket.on('open', () => {
    session.isOpen = true;
    console.log(`[Deepgram] session opened session=${sessionId}`);
    for (const chunk of session.pendingChunks) {
      try { socket.sendMedia(chunk); } catch {}
    }
    session.pendingChunks = [];
  });

  socket.on('message', async (msg: any) => {
    if (msg?.type === 'Results') {
      const words: string = msg?.channel?.alternatives?.[0]?.transcript ?? '';
      if (!words) return;

      if (msg.is_final) {
        session.transcript += (session.transcript ? ' ' : '') + words;
      }

      wsManager.emit(sessionId, {
        type: 'transcript_interim',
        text: msg.is_final ? session.transcript : words,
        isFinal: Boolean(msg.is_final),
      });
      return;
    }

    if (msg?.type === 'UtteranceEnd') {
      if (session.triggered) return;
      session.triggered = true;

      const finalTranscript = session.transcript.trim();
      console.log(`[Deepgram] UtteranceEnd session=${sessionId} "${finalTranscript.slice(0, 120)}"`);

      wsManager.emit(sessionId, {
        type: 'transcript_final',
        text: finalTranscript,
        turnNumber: meta.turnNumber,
      });

      try {
        await onEagerEnd(finalTranscript, meta);
      } catch (err) {
        console.error('[Deepgram] onEagerEnd error:', err);
      }
    }
  });

  socket.on('error', (err: unknown) => {
    console.error(`[Deepgram] error session=${sessionId}:`, err);
  });

  socket.on('close', () => {
    sessions.delete(sessionId);
    console.log(`[Deepgram] session closed session=${sessionId}`);
  });

  socket.connect();
}

export function sendAudio(sessionId: string, audio: Buffer): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (!session.isOpen) {
    session.pendingChunks.push(audio);
    return;
  }

  try {
    session.socket.sendMedia(audio);
  } catch (err) {
    console.error(`[Deepgram] sendAudio error session=${sessionId}:`, err);
  }
}

export function closeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  try { session.socket.sendCloseStream({}); } catch {}
  sessions.delete(sessionId);
}
