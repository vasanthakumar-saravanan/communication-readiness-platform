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
  triggered: boolean; // prevent double-trigger on UtteranceEnd
  meta: AudioStartMeta;
  pendingChunks: Buffer[]; // audio buffered before socket opens
  isOpen: boolean;
}

const sessions = new Map<string, DeepgramSession>();

type EagerEndCallback = (transcript: string, meta: AudioStartMeta) => Promise<void>;

export async function openSession(
  sessionId: string,
  meta: AudioStartMeta,
  onEagerEnd: EagerEndCallback,
): Promise<void> {
  // Close any stale session first
  const existing = sessions.get(sessionId);
  if (existing) {
    try { existing.socket.sendCloseStream({}); } catch {}
    sessions.delete(sessionId);
  }

  if (!env.DEEPGRAM_API_KEY) {
    console.warn('[Deepgram] DEEPGRAM_API_KEY not set — session skipped');
    return;
  }

  const deepgram = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });

  let socket: any;
  try {
    // Cast to any — ConnectArgs requires Authorization but SDK fills it from apiKey at runtime
    socket = await deepgram.listen.v1.connect({
      model: 'nova-3',
      language: 'en',
      interim_results: ListenV1InterimResults.True,
      utterance_end_ms: 1000,
      endpointing: 300,
      smart_format: ListenV1SmartFormat.True,
      vad_events: ListenV1VadEvents.True,
      Authorization: env.DEEPGRAM_API_KEY, // required by type, filled by SDK auth
    } as any);
  } catch (err) {
    console.error(`[Deepgram] connect failed  session=${sessionId}:`, err);
    return;
  }

  const session: DeepgramSession = { socket, transcript: '', triggered: false, meta, pendingChunks: [], isOpen: false };
  sessions.set(sessionId, session);

  socket.on('open', () => {
    session.isOpen = true;
    console.log(`[Deepgram] session opened  session=${sessionId}`);
    // Flush any audio chunks that arrived before the socket opened
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
    } else if (msg?.type === 'UtteranceEnd') {
      if (session.triggered) return;
      session.triggered = true;

      const finalTranscript = session.transcript.trim() || '(no speech detected)';
      console.log(`[Deepgram] UtteranceEnd  session=${sessionId}  "${finalTranscript.slice(0, 80)}"`);

      // Send final transcript to frontend before evaluation begins
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
    console.error(`[Deepgram] error  session=${sessionId}:`, err);
  });

  socket.on('close', () => {
    sessions.delete(sessionId);
    console.log(`[Deepgram] session closed  session=${sessionId}`);
  });

  // Must call connect() after registering handlers — SDK returns a start-closed socket
  socket.connect();
}

export function sendAudio(sessionId: string, audio: Buffer): void {
  const session = sessions.get(sessionId);
  if (!session) {
    console.warn(`[Deepgram] sendAudio called for unknown session=${sessionId}`);
    return;
  }
  if (!session.isOpen) {
    // Socket not yet open — buffer and flush on open
    session.pendingChunks.push(audio);
    return;
  }
  try {
    session.socket.sendMedia(audio);
  } catch (err) {
    console.error(`[Deepgram] sendAudio error  session=${sessionId}:`, err);
  }
}

export function closeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  try {
    session.socket.sendCloseStream({});
  } catch {}
  sessions.delete(sessionId);
}
