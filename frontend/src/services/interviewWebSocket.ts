/**
 * Backend WebSocket client for the AI mock interview.
 *
 * Connects to /ws/interview?token=<jwt>&sessionId=<uuid>
 * Sends binary MediaRecorder audio chunks and JSON control messages.
 * Dispatches typed events for the UI (transcript_interim, turn_result, etc.)
 */

export type InterviewWsStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface TurnResultData {
  transcript: string;
  technicalScore: number;
  communicationScore: number;
  overallScore: number;
  feedback: string;
  strengths: string;
  weaknesses: string;
  nextDifficulty: string;
  nextQuestionText: string;
  contextSummary: string;
  conversationalResponse: string;
  audioMetrics: {
    paceWpm: number;
    fillerCount: number;
    fluencyScore: number;
    clarityScore: number;
  };
}

export interface InterviewWsHandlers {
  onStatusChange?: (status: InterviewWsStatus) => void;
  onTranscriptInterim?: (text: string, isFinal: boolean) => void;
  onTranscriptFinal?: (text: string, turnNumber: number) => void;
  onInvalidTranscript?: (message: string) => void;
  onTextChunk?: (text: string) => void;
  onTextEnd?: () => void;
  onTurnResult?: (data: TurnResultData) => void;
  onClarification?: (question: string, message: string) => void;
  onError?: (message: string) => void;
  onStatusStage?: (stage: string) => void;
  onReady?: (data: {
    stt: 'deepgram' | 'client';
    turnNumber: number;
    totalTurns: number | null;
    questionText: string;
    difficulty: string;
  }) => void;
  onInterviewComplete?: (report: unknown) => void;
  onTerminated?: (reason: string) => void;
  onProctorWarning?: (tabSwitches: number, limit: number) => void;
}

export class InterviewWebSocketClient {
  private ws: WebSocket | null = null;
  private status: InterviewWsStatus = 'idle';
  private handlers: InterviewWsHandlers = {};
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private sessionId: string = '';
  private sttMode: 'deepgram' | 'client' = 'client';
  private reconnectTimer: number | null = null;
  private shouldReconnect = false;
  private lastToken = '';

  setHandlers(h: InterviewWsHandlers): void {
    this.handlers = h;
  }

  getStatus(): InterviewWsStatus {
    return this.status;
  }

  private setStatus(s: InterviewWsStatus): void {
    this.status = s;
    this.handlers.onStatusChange?.(s);
  }

  async connect(sessionId: string, token: string): Promise<boolean> {
    this.sessionId = sessionId;
    this.lastToken = token;
    this.shouldReconnect = true;

    if (this.ws?.readyState === WebSocket.OPEN) return true;

    this.setStatus('connecting');
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${proto}://${host}/ws/interview?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`;

    return new Promise<boolean>((resolve) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.handlers.onError?.('Timed out waiting for the interview server.');
          try { ws.close(); } catch {}
          resolve(false);
        }
      }, 10000);

      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(ok);
      };

      ws.onopen = () => this.setStatus('connected');

      ws.onclose = (ev) => {
        window.clearTimeout(timer);
        if (this.ws === ws) this.ws = null;
        this.stopRecording();
        this.setStatus('disconnected');

        const fatal = ev.code === 4001 || (ev.code >= 4401 && ev.code <= 4409);
        if (fatal) {
          this.shouldReconnect = false;
          settle(false);
          this.handlers.onError?.(ev.reason || 'Interview session is no longer available.');
          return;
        }

        settle(false);
        if (this.shouldReconnect && this.sessionId && this.lastToken) {
          if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(this.sessionId, this.lastToken).catch(() => {});
          }, 1200);
        }
      };

      ws.onerror = () => {
        this.setStatus('error');
        this.handlers.onError?.('WebSocket connection failed');
        settle(false);
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'ready':
            this.sttMode = msg.stt === 'deepgram' ? 'deepgram' : 'client';
            this.handlers.onReady?.({
              stt: this.sttMode,
              turnNumber: Number(msg.turnNumber ?? 1),
              totalTurns: typeof msg.totalTurns === 'number' ? msg.totalTurns : null,
              questionText: String(msg.questionText ?? ''),
              difficulty: String(msg.difficulty ?? 'EASY'),
            });
            settle(true);
            break;
          case 'transcript_interim':
            this.handlers.onTranscriptInterim?.((msg.text as string) ?? '', Boolean(msg.isFinal));
            break;
          case 'transcript_final':
            this.handlers.onTranscriptFinal?.((msg.text as string) ?? '', Number(msg.turnNumber ?? 0));
            break;
          case 'invalid_transcript':
            this.handlers.onInvalidTranscript?.((msg.message as string) ?? 'Please try again.');
            break;
          case 'text_chunk':
            this.handlers.onTextChunk?.((msg.text as string) ?? '');
            break;
          case 'text_end':
            this.handlers.onTextEnd?.();
            break;
          case 'turn_result':
            this.handlers.onTurnResult?.(msg.data as TurnResultData);
            break;
          case 'clarification':
            this.handlers.onClarification?.((msg.question as string) ?? '', (msg.message as string) ?? '');
            break;
          case 'status':
            this.handlers.onStatusStage?.((msg.stage as string) ?? '');
            break;
          case 'interview_complete':
            this.handlers.onInterviewComplete?.(msg.report);
            break;
          case 'terminated':
            this.shouldReconnect = false;
            this.handlers.onTerminated?.((msg.reason as string) ?? 'Interview terminated');
            break;
          case 'proctor_warning':
            this.handlers.onProctorWarning?.(Number(msg.tabSwitches ?? 0), Number(msg.limit ?? 4));
            break;
          case 'error':
            this.handlers.onError?.((msg.message as string) ?? 'Unknown server error');
            break;
        }
      };
    });
  }

  sendJson(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /** Tell server which question we're answering and open Deepgram session */
  startTurn(
    questionText: string,
    difficulty: string,
    turnNumber: number,
    domain?: string,
  ): void {
    this.sendJson({
      type: 'audio_start',
      metadata: {
        question_text: questionText,
        difficulty,
        turn_number: turnNumber,
        domain: domain ?? 'Technical',
      },
    });
  }

  /** Start capturing microphone audio and streaming it to the server */
  async startAudioCapture(stream: MediaStream): Promise<void> {
    this.stopRecording();
    this.mediaStream = stream;

    // Prefer webm/opus, fall back to whatever browser supports
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

    const options = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(stream, options);
    this.mediaRecorder = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        ev.data.arrayBuffer().then((buf) => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(buf);
          }
        });
      }
    };

    recorder.start(250); // 250 ms chunks
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
  }

  /** Server finalizes the audio turn. Browser transcript is sent only when server STT is unavailable. */
  audioEnd(transcript?: string, metrics: DeliveryMetrics = {}): void {
    this.stopRecording();
    this.sendJson({
      type: 'audio_end',
      ...(this.sttMode === 'client' && transcript ? { transcript: transcript.slice(0, 5000) } : {}),
      ...metrics,
    });
  }

  /** Legacy API kept for compatibility; it now follows the same turn-finalization path. */
  submitTranscript(transcript: string): void {
    this.audioEnd(transcript);
  }

  finish(transcript?: string, metrics: DeliveryMetrics = {}): void {
    this.stopRecording();
    this.sendJson({
      type: 'finish',
      ...(this.sttMode === 'client' && transcript ? { transcript: transcript.slice(0, 5000) } : {}),
      ...metrics,
    });
  }

  sendProctorEvent(event: 'TAB_SWITCH' | 'FULLSCREEN_EXIT'): void {
    this.sendJson({ type: 'proctor_event', event });
  }

  usesServerStt(): boolean {
    return this.sttMode === 'deepgram';
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopRecording();
    if (this.ws) {
      try { this.ws.close(1000, 'Session ended'); } catch {}
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton for the current interview session
export const interviewWsClient = new InterviewWebSocketClient();
