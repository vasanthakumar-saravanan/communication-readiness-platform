import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { VoiceOrb } from './VoiceOrb';
import { QuestionTurn } from '../../types';
import { 
  AudioRecorder, 
  transcribeWithWhisper, 
  hasWhisperApiKey,
  getOpenAITTSVoice,
  synthesizeSpeechWithOpenAI,
  OpenAITTSVoice
} from '../../services/whisperService';
import { WhisperSettingsModal } from '../common/WhisperSettingsModal';
import { interviewWsClient, TurnResultData } from '../../services/interviewWebSocket';
import { 
  ShieldAlert, 
  Mic, 
  MicOff, 
  ChevronRight, 
  AlertTriangle, 
  MessageSquare, 
  X,
  Radio,
  RotateCcw,
  Zap,
  Clock,
  Play,
  Volume2,
  VolumeX,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Lock,
  Ban,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export const MockInterviewRoom: React.FC = () => {
  const {
    student,
    interviewState,
    submitAnswer,
    advanceTurnFromWs,
    activeAssignment,
    setActiveView,
    isAssignmentDisqualified,
    terminateDisqualifiedSession,
    forfeitSessionCoin,
    isEvaluationPending,
    latestReport,
    dismissNewReportNotification,
    requestExitAssessment
  } = useApp();

  const [hasSessionStarted, setHasSessionStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeakingQuestion, setIsSpeakingQuestion] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.2);
  const [currentSpeechText, setCurrentSpeechText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [autoConversationMode] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false;
  });
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(1500); // 25 minutes limit
  const [showWhisperModal, setShowWhisperModal] = useState(false);
  const [hasWhisperKey, setHasWhisperKey] = useState(() => hasWhisperApiKey());
  const [selectedVoice, setSelectedVoice] = useState<OpenAITTSVoice>(() => getOpenAITTSVoice());
  const [isTranscribingWithWhisper, setIsTranscribingWithWhisper] = useState(false);
  const [showQuestionText, setShowQuestionText] = useState(true);
  const audioRecorderRef = useRef<AudioRecorder>(new AudioRecorder());
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── WS interview state ────────────────────────────────────────────────────
  const [wsTurnNumber, setWsTurnNumber] = useState(1);
  const [wsCurrentQuestion, setWsCurrentQuestion] = useState<string | null>(null);
  const [wsConversationalResponse, setWsConversationalResponse] = useState('');
  const [wsEvalResult, setWsEvalResult] = useState<TurnResultData | null>(null);
  const [wsConfirmedTranscript, setWsConfirmedTranscript] = useState<string | null>(null);
  const [wsInvalidTranscriptMsg, setWsInvalidTranscriptMsg] = useState<string | null>(null);
  const [displayedQuestionText, setDisplayedQuestionText] = useState('');
  const typewriterRef = useRef<any>(null);

  const wsTurnNumberRef = useRef(1);
  const wsTurnDifficultyRef = useRef<'EASY' | 'MEDIUM' | 'ADVANCED'>('EASY');
  const wsCurrentQuestionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasSessionStarted || isSubmitting) return;
    const timer = setInterval(() => {
      setSessionTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleExecuteSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasSessionStarted, isSubmitting]);

  const formatSessionTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const prevTabSwitchesRef = useRef(interviewState.tabSwitches);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const restartTimeoutRef = useRef<any>(null);

  const isRecordingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const autoModeRef = useRef(true);
  const latestSpeechRef = useRef<string>("");
  const accumulatedSpeechRef = useRef<string>("");
  const currentSessionFinalRef = useRef<string>("");
  const isVoiceDetectedRef = useRef(false);
  const hasSpokenRef = useRef(false);
  const lastVoiceActiveTimeRef = useRef<number>(0);
  const voiceDurationMsRef = useRef<number>(0);
  const isLiveTranscribedRef = useRef<boolean>(false);
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  const currentQuestionIdRef = useRef<string>("");

  const currentQ = interviewState.questions[interviewState.turnIndex] || interviewState.questions[0];
  const questionNumber = interviewState.turnIndex + 1;
  const totalQuestions = interviewState.questions.length;
  const showWarning = interviewState.tabSwitches > 0 && !warningDismissed;

  useEffect(() => {
    autoModeRef.current = autoConversationMode;
  }, [autoConversationMode]);

  const requestFullscreen = async () => {
    try {
      if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn("Fullscreen request blocked or denied by browser policy:", err);
    }
  };

  // Immediate Fullscreen trigger on mount + listen for fullscreenchange
  useEffect(() => {
    requestFullscreen();

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Guard against re-attending disqualified assignment
  useEffect(() => {
    if (activeAssignment && isAssignmentDisqualified(activeAssignment.id)) {
      alert("Access Revoked: You have been permanently disqualified from this interview due to exceeding the proctoring limit (4 tab switches). You cannot attend this interview again.");
      setActiveView('DASHBOARD');
    }
  }, [activeAssignment?.id]);

  // Track new tab switches so warning banner always pops up on every switch
  useEffect(() => {
    if (interviewState.tabSwitches > prevTabSwitchesRef.current) {
      setWarningDismissed(false);
      prevTabSwitchesRef.current = interviewState.tabSwitches;
    }
  }, [interviewState.tabSwitches]);

  // Immediately stop resources and exit fullscreen if 4 switches, disqualified, or completed
  useEffect(() => {
    if (interviewState.tabSwitches >= 4 || interviewState.isDisqualified || interviewState.isCompletedAwaitingEvaluation) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      teardownAudioHardware();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, [interviewState.tabSwitches, interviewState.isDisqualified, interviewState.isCompletedAwaitingEvaluation]);

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      teardownAudioHardware();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, []);

  const teardownAudioHardware = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsVoiceDetected(false);
    isVoiceDetectedRef.current = false;
    setAudioVolume(0.15);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    setSilenceCountdown(null);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    audioRecorderRef.current.clear();
    interviewWsClient.disconnect();
  };

  const stopRecordingTurn = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsVoiceDetected(false);
    isVoiceDetectedRef.current = false;
    setAudioVolume(0.15);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    setSilenceCountdown(null);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
  };

  const handleExecuteSubmit = async (textToSubmit?: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    stopRecordingTurn();

    let candidateAnswer = (textToSubmit || wsConfirmedTranscript || latestSpeechRef.current || currentSpeechText).trim();

    // If Whisper is configured, refine transcript from raw audio buffer
    if (hasWhisperKey && audioRecorderRef.current.isRecording()) {
      setIsTranscribingWithWhisper(true);
      try {
        const audioBlob = await audioRecorderRef.current.stop();
        if (audioBlob && audioBlob.size > 500) {
          const res = await transcribeWithWhisper(audioBlob, currentQ.questionText);
          if (res.success && res.text.trim()) {
            candidateAnswer = res.text.trim();
            setCurrentSpeechText(candidateAnswer);
            latestSpeechRef.current = candidateAnswer;
          }
        }
      } catch (err) {
        console.warn("[MockInterview] Whisper transcription fallback:", err);
      } finally {
        setIsTranscribingWithWhisper(false);
      }
    } else {
      audioRecorderRef.current.stop().catch(() => {});
    }

    // Validate we have a real transcript before submitting
    if (!candidateAnswer) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setWsInvalidTranscriptMsg('No answer was captured. Please speak again.');
      setTimeout(() => setWsInvalidTranscriptMsg(null), 5000);
      return;
    }

    const finalAnswer = candidateAnswer;

    // WS path: send transcript to backend
    if (interviewWsClient.isConnected()) {
      setCurrentSpeechText('');
      latestSpeechRef.current = '';
      accumulatedSpeechRef.current = '';
      currentSessionFinalRef.current = '';
      interviewWsClient.submitTranscript(finalAnswer);
      // isSubmittingRef stays true until turn_result event arrives via WS
      return;
    }

    // REST fallback path (no WS)
    try {
      await submitAnswer(finalAnswer);
    } catch (err) {
      console.error("[MockInterview] Submit error:", err);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setCurrentSpeechText("");
      latestSpeechRef.current = "";
      accumulatedSpeechRef.current = "";
      currentSessionFinalRef.current = "";
      hasSpokenRef.current = false;
      isLiveTranscribedRef.current = false;
      voiceDurationMsRef.current = 0;
      lastVoiceActiveTimeRef.current = 0;
    }
  };

  const handleSpeechInput = (transcript: string) => {
    latestSpeechRef.current = transcript;
    setCurrentSpeechText(transcript);
    hasSpokenRef.current = true;
    isLiveTranscribedRef.current = true;
  };

  const initMicrophoneStream = async (): Promise<boolean> => {
    try {
      if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            } 
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        mediaStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;

          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }

          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const checkVolume = () => {
            if (!mediaStreamRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const normalized = Math.min(1.0, Math.max(0.18, avg / 120));
            setAudioVolume(normalized);

            const voiceActive = avg > 16;
            setIsVoiceDetected(voiceActive);
            isVoiceDetectedRef.current = voiceActive;

            const now = Date.now();

            if (voiceActive) {
              hasSpokenRef.current = true;
              lastVoiceActiveTimeRef.current = now;
              voiceDurationMsRef.current += 16;

              // Clear silence timer if user speaks again
              if (avg > 20 && silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
            } else {
              // Voice is quiet right now
              // If candidate has spoken in this turn, session is recording, not submitting, and autoMode is on
              if (
                hasSpokenRef.current && 
                isRecordingRef.current && 
                !isSubmittingRef.current && 
                autoModeRef.current
              ) {
                const silenceDuration = now - lastVoiceActiveTimeRef.current;

                // When silence reaches 1200ms after speaking, allow 3.5s quiet window before auto-submission
                if (silenceDuration >= 1200 && !silenceTimerRef.current) {
                  silenceTimerRef.current = setTimeout(() => {
                    silenceTimerRef.current = null;
                    if (interviewWsClient.isConnected()) {
                      // WS path: close audio stream → Deepgram UtteranceEnd → LLM evaluation
                      stopRecordingTurn();
                      isSubmittingRef.current = true;
                      setIsSubmitting(true);
                      interviewWsClient.audioEnd();
                    } else {
                      handleExecuteSubmit(latestSpeechRef.current || currentSpeechText);
                    }
                  }, 3500);
                }
              }
            }

            animationFrameRef.current = requestAnimationFrame(checkVolume);
          };
          checkVolume();
        }
      } else if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      return true;
    } catch (err: any) {
      console.warn("Audio meter setup warning:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionError("Microphone permission was denied. Please allow microphone access in your browser address bar.");
      }
      return false;
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn("Web Speech API not supported in this browser.");
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;

      // Optimize recognition dialect for higher technical precision
      let preferredLang = 'en-IN';
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const isIndia = tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('Asia/Colombo');
        if (isIndia) {
          preferredLang = 'en-IN';
        } else {
          const navLang = navigator.language || 'en-US';
          preferredLang = navLang.startsWith('en') ? navLang : 'en-US';
        }
      } catch {
        preferredLang = navigator.language || 'en-IN';
      }
      recognition.lang = preferredLang;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isRecordingRef.current = true;
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            sessionFinal += text.trim() + ' ';
          } else {
            sessionInterim += text.trim() + ' ';
          }
        }

        currentSessionFinalRef.current = sessionFinal.trim();

        const combined = [
          accumulatedSpeechRef.current,
          sessionFinal.trim(),
          sessionInterim.trim()
        ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

        if (combined) {
          handleSpeechInput(combined);
          lastVoiceActiveTimeRef.current = Date.now();
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("SpeechRec error:", event.error);
        if (event.error === 'not-allowed') {
          setMicPermissionError("Microphone permission was denied. Please allow microphone access in your browser address bar.");
        }
      };

      recognition.onend = () => {
        if (currentSessionFinalRef.current) {
          const prev = accumulatedSpeechRef.current.trim();
          const next = currentSessionFinalRef.current.trim();
          accumulatedSpeechRef.current = prev ? `${prev} ${next}` : next;
          currentSessionFinalRef.current = '';
        }

        if (isRecordingRef.current && !isSubmittingRef.current && !isSpeakingRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isRecordingRef.current && !isSubmittingRef.current && !isSpeakingRef.current) {
              startSpeechRecognition();
            }
          }, 100);
        }
      };

      try {
        recognition.start();
      } catch (e) {
        console.warn("SpeechRec start error:", e);
      }
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("SpeechRec exception:", e);
    }
  };

  const startRecording = async () => {
    if (isSubmittingRef.current) return;
    setMicPermissionError(null);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeakingQuestion(false);

    await initMicrophoneStream();

    if (interviewWsClient.isConnected() && mediaStreamRef.current) {
      // WS path: stream audio to Deepgram backend (primary path)
      // Turn 1 always starts at EASY regardless of assigned difficulty
      const turnDifficulty = questionNumber === 1 ? 'EASY' : (currentQ?.difficulty || 'EASY');
      interviewWsClient.startTurn(
        currentQ?.questionText || '',
        turnDifficulty,
        questionNumber,
        (currentQ as any)?.domain || 'Technical',
      );
      interviewWsClient.startAudioCapture(mediaStreamRef.current);
    } else {
      // Fallback: browser SpeechRecognition (+ optional Whisper recorder)
      if (mediaStreamRef.current && hasWhisperKey) {
        audioRecorderRef.current.start(mediaStreamRef.current);
      }
      startSpeechRecognition();
    }

    isRecordingRef.current = true;
    setIsRecording(true);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
      return () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  // ── WS event handlers ────────────────────────────────────────────────────
  useEffect(() => {
    interviewWsClient.setHandlers({
      onTranscriptInterim: (text) => {
        latestSpeechRef.current = text;
        setCurrentSpeechText(text);
        hasSpokenRef.current = true;
        isLiveTranscribedRef.current = true;
        lastVoiceActiveTimeRef.current = Date.now();
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      },
      onTranscriptFinal: (text) => {
        setWsConfirmedTranscript(text);
        setCurrentSpeechText(''); // clear interim preview once Deepgram confirms
        setWsInvalidTranscriptMsg(null);
      },
      onInvalidTranscript: (message) => {
        setWsInvalidTranscriptMsg(message);
        setWsConfirmedTranscript(null);
        // Reset submitting so user can speak again
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setTimeout(() => setWsInvalidTranscriptMsg(null), 5000);
      },
      onTextChunk: (text) => {
        setWsConversationalResponse(prev => prev + text);
      },
      onTextEnd: () => {
        // conversational response complete — nothing extra needed
      },
      onTurnResult: (data: TurnResultData) => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setCurrentSpeechText('');
        latestSpeechRef.current = '';
        accumulatedSpeechRef.current = '';
        hasSpokenRef.current = false;
        isLiveTranscribedRef.current = false;
        voiceDurationMsRef.current = 0;
        lastVoiceActiveTimeRef.current = 0;
        setWsConversationalResponse('');
        setWsConfirmedTranscript(null);
        setWsInvalidTranscriptMsg(null);
        setWsEvalResult(data);

        // Advance AppContext interview state — triggers the currentQ.id useEffect
        // which calls speakQuestion for the next question
        advanceTurnFromWs({
          transcript: data.transcript,
          technicalScore: data.technicalScore,
          communicationScore: data.communicationScore,
          overallScore: data.overallScore,
          feedback: data.feedback,
          strengths: data.strengths,
          weaknesses: data.weaknesses,
          nextDifficulty: data.nextDifficulty,
          nextQuestionText: data.nextQuestionText,
          conversationalResponse: data.conversationalResponse,
        });
      },
      onClarification: (question) => {
        speakQuestion(question);
      },
      onError: (msg) => {
        console.error('[WS interview]', msg);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      },
    });

    return () => {
      interviewWsClient.disconnect();
    };
  }, []); // mount/unmount only

  const speakWithBrowserTTS = (questionText: string, onDone: () => void) => {
    if (!('speechSynthesis' in window)) {
      onDone();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      setTimeout(() => {
        if (!isSpeakingRef.current) return;
        try {
          const utterance = new SpeechSynthesisUtterance(questionText);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;

          const voices = window.speechSynthesis.getVoices();
          const naturalVoice = voices.find(v => 
            v.lang.startsWith('en') && 
            (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('David') || v.name.includes('English') || v.name.includes('Jenny'))
          );
          if (naturalVoice) utterance.voice = naturalVoice;

          let hasEnded = false;
          const handleEnd = () => {
            if (hasEnded) return;
            hasEnded = true;
            onDone();
          };

          utterance.onstart = () => {
            isSpeakingRef.current = true;
            setIsSpeakingQuestion(true);
            setAudioVolume(0.35);
          };

          utterance.onend = handleEnd;
          utterance.onerror = (e: any) => {
            console.warn("SpeechSynthesis error:", e);
            if (e.error === 'interrupted' || e.error === 'canceled') {
              return;
            }
            handleEnd();
          };

          const safetyTimeout = Math.min(14000, Math.max(5000, questionText.length * 80));
          setTimeout(() => {
            if (isSpeakingRef.current && !hasEnded) {
              handleEnd();
            }
          }, safetyTimeout);

          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn("Inner SpeechSynthesis speak exception:", e);
          onDone();
        }
      }, 70);
    } catch (e) {
      console.warn("SpeechSynthesis exception:", e);
      onDone();
    }
  };

  const speakQuestion = async (questionText: string) => {
    if (!questionText) return;

    stopRecordingTurn();

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }

    if (isMuted) {
      setIsSpeakingQuestion(false);
      isSpeakingRef.current = false;
      startRecording();
      return;
    }

    isSpeakingRef.current = true;
    setIsSpeakingQuestion(true);

    const handleFinishedSpeaking = () => {
      isSpeakingRef.current = false;
      setIsSpeakingQuestion(false);
      setAudioVolume(0.15);
      if (autoModeRef.current) {
        setTimeout(() => {
          startRecording();
        }, 150);
      }
    };

    // Fallback: Browser Web Speech API
    speakWithBrowserTTS(questionText, handleFinishedSpeaking);
  };

  useEffect(() => {
    if (!hasSessionStarted) return;
    if (!currentQ?.id || !currentQ?.questionText) return;
    if (currentQuestionIdRef.current === currentQ.id) return;

    currentQuestionIdRef.current = currentQ.id;
    setCurrentSpeechText("");
    latestSpeechRef.current = "";
    accumulatedSpeechRef.current = "";
    hasSpokenRef.current = false;
    isLiveTranscribedRef.current = false;
    voiceDurationMsRef.current = 0;
    lastVoiceActiveTimeRef.current = 0;
    setSilenceCountdown(null);
    setShowQuestionText(true);

    if (isMuted) {
      startRecording();
    } else {
      speakQuestion(currentQ.questionText);
    }
  }, [currentQ?.id, currentQ?.questionText, hasSessionStarted, isMuted]);

  // Typewriter animation for question text
  useEffect(() => {
    if (!currentQ?.questionText || (currentQ as any)?.domain === 'LISTENING') {
      setDisplayedQuestionText('');
      return;
    }
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    const text = currentQ.questionText;
    let idx = 0;
    setDisplayedQuestionText('');
    typewriterRef.current = setInterval(() => {
      idx++;
      setDisplayedQuestionText(text.slice(0, idx));
      if (idx >= text.length) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
    }, 22);
    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, [currentQ?.id]);

  const handleStartSession = async () => {
    setIsStartingSession(true);
    try {
      requestFullscreen();
      setDrawerOpen(false);
      await initMicrophoneStream();

      // Connect backend WebSocket interview server
      const token = localStorage.getItem('auth_token');
      const sid = interviewState.sessionId;
      if (token && sid) {
        interviewWsClient.connect(sid, token);
      }

      setHasSessionStarted(true);
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleSkipQuestionAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeakingQuestion(false);
    startRecording();
  };

  const handleReplayQuestion = () => {
    speakQuestion(currentQ.questionText);
  };

  const isListeningDomain = (currentQ as any)?.domain === 'LISTENING';
  const hasFloatingText = hasSessionStarted && !!(
    (showQuestionText && currentQ?.questionText && !isListeningDomain) ||
    wsConfirmedTranscript ||
    (currentSpeechText && isRecording) ||
    wsInvalidTranscriptMsg
  );

  const orbState = isSpeakingQuestion
    ? 'speaking'
    : isRecording
      ? 'listening'
      : isSubmitting
        ? 'thinking'
        : 'idle';

  if (interviewState.isCompletedAwaitingEvaluation) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6 animate-in fade-in duration-300">
        
        {/* Top Header Exit */}
        <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-neutral-200/90 shadow-2xs">
          <button
            onClick={() => setActiveView('DASHBOARD')}
            className="flex items-center space-x-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors bg-neutral-50 hover:bg-neutral-100 px-3.5 py-2 rounded-xl border border-neutral-200 shadow-2xs group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-neutral-500 group-hover:-translate-x-0.5 transition-transform" />
            <span>Return to Dashboard</span>
          </button>

          <span className="px-3 py-1 text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Assessment Completed</span>
          </span>
        </div>

        {/* Main Completion Card */}
        <div className="bg-white border border-neutral-200 rounded-3xl p-8 sm:p-12 shadow-xs text-center space-y-6">
          
          {/* Animated Check & Sparkle Icon */}
          <div className="relative inline-flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-neutral-900 text-amber-300 flex items-center justify-center shadow-xs animate-bounce">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>

          {/* Primary User Notice */}
          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              Thanks for completing the assessment!
            </h2>
            <p className="text-sm font-medium text-neutral-600">
              You'll receive the results shortly.
            </p>
          </div>

          {/* Live Evaluation Telemetry Status Card */}
          <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-5 max-w-xl mx-auto text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono">
                Evaluation Details
              </span>
              {isEvaluationPending ? (
                <span className="inline-flex items-center space-x-1.5 text-xs font-mono font-semibold text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  <span>AI Calculating Feedback...</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-xs font-mono font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Results Ready</span>
                </span>
              )}
            </div>

            <p className="text-xs text-neutral-600">
              {isEvaluationPending
                ? "Evaluating speaking pace, technical answers, and clarity."
                : "Your interview report has been generated."}
            </p>

            {/* Quick Metrics Pills */}
            <div className="pt-2 grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                <p className="text-[10px] text-neutral-400 font-mono uppercase">Turns Answered</p>
                <p className="text-xs font-bold text-neutral-800 mt-0.5">
                  {interviewState.questions.length} / {interviewState.questions.length}
                </p>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                <p className="text-[10px] text-neutral-400 font-mono uppercase">Proctoring</p>
                <p className="text-xs font-bold text-emerald-700 mt-0.5">
                  {interviewState.tabSwitches} Infractions (Clean)
                </p>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                <p className="text-[10px] text-neutral-400 font-mono uppercase">Credits Status</p>
                <p className="text-xs font-bold text-amber-900 mt-0.5">
                  Restored + Bonus
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveView('DASHBOARD')}
              className="flex items-center space-x-2 bg-neutral-900 hover:bg-black text-white px-6 py-3 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </button>

            {!isEvaluationPending && latestReport && (
              <button
                type="button"
                onClick={() => {
                  dismissNewReportNotification?.();
                  setActiveView('REPORT_VIEW');
                }}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer animate-in zoom-in-95"
              >
                <span>View Results Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="text-[11px] text-neutral-400">
            You can safely return to your dashboard now. A notification indicator will appear when your results are ready.
          </p>

        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen px-4 sm:px-8 lg:px-10 py-3 sm:py-4 flex flex-col space-y-3 sm:space-y-4 animate-in fade-in duration-200">
      
      {/* Header Bar: Full controls in Lobby, Timer only once Live */}
      {!hasSessionStarted ? (
        <div className="space-y-3">
          {/* Top Bar 1: Exit to Dashboard, Coins, Fullscreen, Tab Switches, Session ID */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-neutral-200/90 shadow-2xs">
            <button
              onClick={requestExitAssessment}
              className="flex items-center space-x-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors bg-neutral-50 hover:bg-neutral-100 px-3.5 py-2 rounded-xl border border-neutral-200 shadow-2xs group cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-neutral-500 group-hover:-translate-x-0.5 transition-transform" />
              <span>Exit to Dashboard</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-300 rounded-xl shadow-2xs">
                <span>🪙</span>
                <span>{student?.coins ?? 5} Coins</span>
                <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded font-normal hidden sm:inline">(1 at stake)</span>
              </span>

              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Fullscreen Mode Active</span>
              </span>

              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-medium bg-amber-50 text-amber-800 border border-amber-300 rounded-xl">
                <span>Tab Switches: {interviewState.tabSwitches} / 4</span>
              </span>

              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl uppercase">
                <span>SESSION #{interviewState.sessionId?.slice(0, 14) || 'ses_live'}</span>
              </span>
            </div>
          </div>

          {/* Top Bar 2: Technical Mock Interview Room & Controls */}
          <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">Technical Mock Interview Room</h2>
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-neutral-100 text-neutral-600 rounded border border-neutral-200 font-mono">
                    Turn {wsCurrentQuestion ? wsTurnNumber : questionNumber} of {totalQuestions}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-mono">
                    <Zap className="w-3 h-3 mr-1" /> HANDS-FREE MODE
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">Hands-free voice interaction: Speaks Question → Listens → Submits on pause</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <div className="flex items-center space-x-1.5 bg-neutral-900 text-white px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-neutral-300" />
                <span>Timer: {formatSessionTime(sessionTimeLeft)} / 25:00</span>
              </div>

              <button
                onClick={() => {
                  if (!isMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    setIsSpeakingQuestion(false);
                  }
                  setIsMuted(!isMuted);
                }}
                title={isMuted ? 'Unmute Interviewer Voice' : 'Mute Interviewer Voice'}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  isMuted 
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-500' 
                    : 'bg-neutral-50 border-neutral-200 text-neutral-800 hover:bg-neutral-100'
                }`}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-neutral-400" /> : <Volume2 className="w-3.5 h-3.5 text-neutral-700" />}
                <span className="font-mono hidden md:inline">{isMuted ? 'Voice Off' : 'Voice On'}</span>
              </button>

              <div className="flex items-center space-x-1.5 bg-neutral-50 border border-neutral-200 px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-700 font-mono">
                <ShieldAlert className="w-3.5 h-3.5 text-neutral-500" />
                <span>Tab Switches: {interviewState.tabSwitches} / 4</span>
              </div>

              <button
                onClick={() => setDrawerOpen(!drawerOpen)}
                className="flex items-center space-x-1.5 bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-700 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Transcript</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Live Session: ONLY the running timer is displayed */
        <div className="flex items-center justify-center">
          <div className="flex items-center space-x-2 bg-neutral-900 text-white px-4 py-1.5 rounded-full text-xs font-mono font-medium shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-neutral-300" />
            <span>Timer: {formatSessionTime(sessionTimeLeft)} / 25:00</span>
          </div>
        </div>
      )}
      
      {/* Tab Switch Infraction Popup Warning Modal (Switches 1, 2, 3) */}
      {showWarning && interviewState.tabSwitches < 4 && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className={`max-w-md w-full bg-white dark:bg-[#18181b] rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl border-2 animate-in zoom-in-95 duration-150 ${
            interviewState.tabSwitches === 3 
              ? 'border-rose-400 ring-4 ring-rose-500/10' 
              : 'border-amber-400 ring-4 ring-amber-500/10'
          }`}>
            <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border ${
              interviewState.tabSwitches === 3
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-600 dark:text-amber-400'
            }`}>
              <AlertTriangle className={`w-8 h-8 ${interviewState.tabSwitches === 3 ? 'animate-bounce' : ''}`} />
            </div>

            <div className="space-y-2">
              <span className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider ${
                interviewState.tabSwitches === 3
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800/60'
                  : 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border border-amber-300 dark:border-amber-800/60'
              }`}>
                {interviewState.tabSwitches === 3
                  ? 'Critical Final Warning'
                  : `Proctoring Alert · Strike ${interviewState.tabSwitches} of 4`}
              </span>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {interviewState.tabSwitches === 3
                  ? 'One Strike Remaining'
                  : 'Tab Switch Detected'}
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-sm mx-auto">
                {interviewState.tabSwitches === 3
                  ? 'WARNING: You have switched tabs 3 times. Exactly ONE more tab switch will permanently terminate this session with a score of 0 and forfeit your session coin.'
                  : `Please stay on this interview screen. You have ${4 - interviewState.tabSwitches} strike(s) remaining before automatic termination and permanent disqualification.`}
              </p>
            </div>

            <button
              onClick={() => setWarningDismissed(true)}
              className={`w-full py-3.5 rounded-xl text-xs font-bold text-white transition-all shadow-md cursor-pointer ${
                interviewState.tabSwitches === 3
                  ? 'bg-rose-600 hover:bg-rose-700 active:scale-98'
                  : 'bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 active:scale-98'
              }`}
            >
              I Acknowledge & Return to Interview
            </button>
          </div>
        </div>
      )}

      {/* Mandatory Fullscreen Blocker Overlay */}
      {!isFullscreen && !(interviewState.tabSwitches >= 4 || interviewState.isDisqualified) && (
        <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center border border-amber-200 dark:border-amber-900/60">
              <Maximize2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-mono uppercase tracking-wider border border-amber-200/60 dark:border-amber-800/60">
                Mandatory Fullscreen Mode
              </span>
              <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Fullscreen Required for Interview
              </h2>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Whenever you enter an interview session, full screen is required by proctoring policy. Your focus and tab activity are actively monitored. Exceeding 4 tab switches will terminate your session permanently.
              </p>
            </div>
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={requestFullscreen}
                className="w-full py-3.5 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Enter Fullscreen to Proceed</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  requestExitAssessment();
                }}
                className="w-full py-2 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Immediate Session Termination & Permanent Disqualification Modal */}
      {(interviewState.tabSwitches >= 4 || interviewState.isDisqualified) && (
        <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] rounded-3xl p-8 max-w-lg w-full text-center space-y-6 shadow-2xl border-2 border-rose-300 dark:border-rose-900/60 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 rounded-3xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center border border-rose-200 dark:border-rose-900/60">
              <ShieldAlert className="w-10 h-10 animate-bounce" />
            </div>
            <div className="space-y-2">
              <span className="px-3.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-600 text-white uppercase tracking-wider">
                Disqualified · 4 Tab Switches Exceeded
              </span>
              <h2 className="text-2xl font-black tracking-tight text-rose-950 dark:text-rose-100">
                Interview Session Terminated
              </h2>
              <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed max-w-md mx-auto">
                You have switched tabs <strong>4 times</strong> during this proctored session. In accordance with strict placement proctoring rules, this session has ended immediately with a score of <strong>0 / 100</strong>.
              </p>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 rounded-2xl p-4 text-left text-xs text-rose-900 dark:text-rose-200 space-y-2">
              <div className="flex items-center space-x-2 font-bold">
                <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Permanent Disqualification Notice:</span>
              </div>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                You are <strong>permanently disqualified from attending this interview again</strong>. This assessment has been locked and access has been revoked on your candidate portal.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                teardownAudioHardware();
                if (typeof document !== 'undefined' && document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                setActiveView('DASHBOARD');
              }}
              className="w-full py-3.5 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Exit to Student Dashboard</span>
            </button>
          </div>
        </div>
      )}

      {micPermissionError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between text-amber-900 text-xs">
          <span>{micPermissionError}</span>
          <button onClick={() => setMicPermissionError(null)} className="text-amber-700 font-bold ml-2">Dismiss</button>
        </div>
      )}

      {!hasSessionStarted && activeAssignment && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-purple-900 shadow-2xs">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse"></span>
            <div>
              <span className="font-semibold text-purple-950">Assigned Drill: </span>
              <span className="font-medium">{activeAssignment.title}</span>
              <span className="text-purple-700 ml-1.5">· Assigned by {activeAssignment.assignedByName}</span>
              {activeAssignment.customInstructions && (
                <p className="text-[11px] text-purple-600 mt-0.5">Focus: {activeAssignment.customInstructions}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <span className="px-2.5 py-0.5 rounded font-mono text-[10px] bg-purple-200/70 text-purple-900 font-semibold">
              Due: {activeAssignment.dueDate}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${activeAssignment.isMandatory ? 'bg-amber-100 text-amber-900' : 'bg-neutral-100 text-neutral-700'}`}>
              {activeAssignment.isMandatory ? 'Mandatory' : 'Optional'}
            </span>
          </div>
        </div>
      )}


      {/* Central Interactive Area: Zero Layout Shift & Smooth Cross-fade */}
      <div className="w-full flex-1 flex flex-col items-center justify-center relative min-h-[68vh] py-2">
        {!hasSessionStarted ? (
          <div className="w-full max-w-lg mx-auto bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col items-center text-center space-y-5 animate-in fade-in duration-200">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-neutral-950 flex items-center justify-center text-white shadow-lg">
              <Mic className="w-8 h-8 sm:w-9 sm:h-9 text-emerald-400 animate-pulse" />
            </div>
            <div className="max-w-md text-center space-y-1.5">
              <h3 className="text-lg font-bold text-neutral-900">Audio Ready for Conversational Mode</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Click below to start. The interviewer will read the question aloud, then immediately open your microphone. From then on, the entire interview runs hands-free!
              </p>
            </div>
            <div className="pt-2">
              <button
                disabled={isStartingSession}
                onClick={handleStartSession}
                className="inline-flex items-center space-x-2.5 bg-neutral-900 hover:bg-black text-white px-8 py-3.5 rounded-xl text-sm font-semibold transition-all shadow-md active:scale-98 cursor-pointer disabled:opacity-75"
              >
                {isStartingSession ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Connecting Hardware...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white text-white" />
                    <span>Start Live Interview Session</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex-1 flex flex-col items-center justify-between py-2 animate-in fade-in duration-300">

            {/* Conversational area — orb + floating text */}
            <div className="flex-1 flex items-center justify-center w-full overflow-hidden py-4">
              <div className="flex flex-col md:flex-row items-center justify-center w-full max-w-5xl mx-auto px-6 gap-8 md:gap-16">

                {/* Orb — shifts slightly left on desktop when text is visible */}
                <div className={`shrink-0 flex flex-col items-center gap-3 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${hasFloatingText ? 'md:-translate-x-8' : ''}`}>
                  {isTranscribingWithWhisper && (
                    <div className="inline-flex items-center space-x-2 text-xs font-mono text-neutral-700 bg-neutral-100 border border-neutral-200 px-3 py-1.5 rounded-full animate-pulse">
                      <Sparkles className="w-3 h-3 text-amber-500 animate-spin" />
                      <span>Refining with Whisper...</span>
                    </div>
                  )}
                  <VoiceOrb state={orbState} volume={audioVolume} size={300} />
                </div>

                {/* Floating text panel — right of orb (desktop) / below orb (mobile) */}
                <div className={`
                  w-full md:max-w-sm flex flex-col gap-5 px-2 md:px-0
                  transition-all duration-500 ease-out
                  ${hasFloatingText
                    ? 'opacity-100 translate-x-0'
                    : 'opacity-0 pointer-events-none md:-translate-x-4'}
                `}>

                  {/* AI question — typewriter reveal, no box */}
                  {showQuestionText && currentQ?.questionText && !isListeningDomain && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 select-none">
                        Interviewer
                      </p>
                      <p className="text-lg sm:text-xl font-light text-neutral-800 leading-relaxed tracking-tight">
                        {displayedQuestionText}
                        {displayedQuestionText.length < (currentQ?.questionText?.length ?? 0) && (
                          <span className="animate-pulse text-neutral-300 ml-0.5">▋</span>
                        )}
                      </p>
                      <button
                        onClick={() => setShowQuestionText(false)}
                        className="flex items-center space-x-1 text-[10px] text-neutral-300 hover:text-neutral-500 transition-colors cursor-pointer mt-1"
                      >
                        <EyeOff className="w-3 h-3" />
                        <span>hide question</span>
                      </button>
                    </div>
                  )}

                  {/* Invalid transcript — floating, no box */}
                  {wsInvalidTranscriptMsg && (
                    <div className="flex items-start space-x-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-700 leading-relaxed">{wsInvalidTranscriptMsg}</p>
                    </div>
                  )}

                  {/* User speech — live interim + confirmed — no box */}
                  {(wsConfirmedTranscript || (currentSpeechText && isRecording)) && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 select-none">
                        You
                      </p>
                      <p className={`text-base leading-relaxed transition-colors duration-300 ${
                        wsConfirmedTranscript
                          ? 'text-neutral-600 font-light'
                          : 'text-neutral-400 font-light italic'
                      }`}>
                        {wsConfirmedTranscript || currentSpeechText}
                      </p>
                      {isSubmitting && wsConfirmedTranscript && (
                        <div className="flex items-center space-x-1.5 pt-0.5">
                          <Loader2 className="w-3 h-3 text-neutral-400 animate-spin" />
                          <span className="text-[10px] font-mono text-neutral-400">Evaluating...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Bottom controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 pb-2">
              {/* Show question button — only when question is hidden, non-listening, not speaking */}
              {!showQuestionText && currentQ?.questionText && !isListeningDomain && !isSpeakingQuestion && (
                <button
                  onClick={() => setShowQuestionText(true)}
                  className="flex items-center space-x-1.5 text-[10px] text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>Show question</span>
                </button>
              )}

              {!isSpeakingQuestion && (
                <button
                  disabled={isSubmitting}
                  onClick={() => handleExecuteSubmit()}
                  className="flex items-center space-x-2 bg-neutral-900 hover:bg-black text-white px-7 py-3 rounded-xl text-xs font-semibold transition-all shadow-md disabled:opacity-40 cursor-pointer active:scale-98"
                >
                  <span>{isSubmitting ? 'Evaluating...' : 'Done Speaking (Submit Answer)'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs animate-in slide-in-from-bottom duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <h4 className="text-xs font-semibold tracking-tight text-neutral-900 uppercase font-mono">Turn-by-Turn Session Transcript</h4>
            <button onClick={() => setDrawerOpen(false)} className="text-neutral-400 hover:text-neutral-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3 mt-3 max-h-60 overflow-y-auto pr-1 text-xs">
            {interviewState.questions.slice(0, interviewState.turnIndex + 1).map((q: QuestionTurn) => (
              <div key={q.id} className="p-3 bg-neutral-50 rounded-xl space-y-1.5 border border-neutral-100">
                <p className="font-semibold text-neutral-900">Interviewer: "{q.questionText}"</p>
                {q.studentAnswer && (
                  <p className="text-neutral-600 pl-3 border-l-2 border-neutral-300">
                    Student: "{q.studentAnswer}"
                  </p>
                )}
                {q.technicalScore && (
                  <div className="flex items-center space-x-2 text-[10px] text-neutral-500 font-mono pt-1">
                    <span>Score: {q.technicalScore}/100</span>
                    <span>•</span>
                    <span>WPM: {q.wpm}</span>
                    <span>•</span>
                    <span>Fillers: {q.fillerWords}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <WhisperSettingsModal 
        isOpen={showWhisperModal}
        onClose={() => setShowWhisperModal(false)}
        onKeyUpdated={(hasKey) => setHasWhisperKey(hasKey)}
        onVoiceUpdated={(voice) => setSelectedVoice(voice)}
      />

    </div>
  );
};
