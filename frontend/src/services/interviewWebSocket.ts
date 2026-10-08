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
}

export class InterviewWebSocketClient {
  private ws: WebSocket | null = null;
  private status: InterviewWsStatus = 'idle';
  private handlers: InterviewWsHandlers = {};
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private sessionId: string = '';

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

  connect(sessionId: string, token: string): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      return; // already open or connecting
    }
    this.sessionId = sessionId;
    this.setStatus('connecting');

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${proto}://${host}/ws/interview?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus('connected');
    };

    ws.onclose = (ev) => {
      this.setStatus('disconnected');
      if (ev.code === 4001) {
        this.handlers.onError?.('Authentication failed — please log in again');
      }
      this.stopRecording();
    };

    ws.onerror = () => {
      this.setStatus('error');
      this.handlers.onError?.('WebSocket connection failed');
    };

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'transcript_interim':
          this.handlers.onTranscriptInterim?.(
            (msg.text as string) ?? '',
            Boolean(msg.isFinal),
          );
          break;
        case 'transcript_final':
          this.handlers.onTranscriptFinal?.(
            (msg.text as string) ?? '',
            (msg.turnNumber as number) ?? 0,
          );
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
          this.handlers.onClarification?.(
            (msg.question as string) ?? '',
            (msg.message as string) ?? '',
          );
          break;
        case 'status':
          this.handlers.onStatusStage?.((msg.stage as string) ?? '');
          break;
        case 'error':
          this.handlers.onError?.((msg.message as string) ?? 'Unknown server error');
          break;
      }
    };
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
      type: 'start_interview',
      question_text: questionText,
      difficulty,
      turn_number: turnNumber,
      domain: domain ?? 'Technical',
    });
  }

  /** Start capturing microphone audio and streaming it to the server */
  async startAudioCapture(stream: MediaStream): Promise<void> {
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

  /** Tell server user finished speaking (closes Deepgram session → triggers evaluation) */
  audioEnd(): void {
    this.stopRecording();
    this.sendJson({ type: 'audio_end' });
  }

  /** Text fallback: send a transcript directly without Deepgram */
  submitTranscript(transcript: string): void {
    this.sendJson({ type: 'submit_transcript', transcript });
  }

  disconnect(): void {
    this.stopRecording();
    if (this.ws) {
      this.ws.close(1000, 'Session ended');
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
