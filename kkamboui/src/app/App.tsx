import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Bot, Send, Upload, Mic, MicOff, X } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { MetricsPanel } from './components/metrics-panel';

// ── 오디오 유틸 ──────────────────────────────────────────────
function float32ToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32768)));
  }
  const bytes = new Uint8Array(int16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
  return f32;
}

type SessionState = 'idle' | 'connecting' | 'active' | 'error';

export type MetricsData = {
  keywordCoverage: number;
  keywordCoverageNote: string;
  conceptConnectivity: number;
  conceptConnectivityNote: string;
  feynmanIndex: number;
  feynmanIndexNote: string;
  feynmanIndexTag?: string | null;
  explanationFluency: number;
  explanationFluencyNote: string;
  questionDefenseRate: number;
  questionDefenseRateNote: string;
  questionDefenseRateTag?: string | null;
  kkamboUnderstanding: number;
  kkamboUnderstandingNote: string;
  alertMessage?: string | null;
};

export default function App() {
  const [fileName, setFileName] = useState('');
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 음성 세션 상태
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [isKkamboSpeaking, setIsKkamboSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');

  const [isMuted, setIsMuted] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [metrics, setMetrics] = useState<MetricsData | null>(null);

  // refs
  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const isMutedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserSpeakingRef = useRef(false);
  const isKkamboSpeakingRef = useRef(false);
  const isListeningRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // 말풍선 타이핑 (대기 상태용)
  const bubbleText = '안녕 나는 깜보야! 나를 학습시켜줘~';
  const [displayedText, setDisplayedText] = useState('');
  const [bubbleVisible, setBubbleVisible] = useState(false);

  useEffect(() => {
    if (isListening) return;
    let t: ReturnType<typeof setTimeout>;
    let iv: ReturnType<typeof setInterval>;
    const startTyping = () => {
      let i = 0;
      setDisplayedText('');
      setBubbleVisible(true);
      iv = setInterval(() => {
        i++;
        setDisplayedText(bubbleText.slice(0, i));
        if (i >= bubbleText.length) {
          clearInterval(iv);
          t = setTimeout(() => {
            setBubbleVisible(false);
            t = setTimeout(startTyping, 5000);
          }, 3000);
        }
      }, 80);
    };
    t = setTimeout(startTyping, 1700);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [isListening]);

  // ── 오디오 재생 큐 ─────────────────────────────────────────
  const playNext = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      isKkamboSpeakingRef.current = false;
      setIsKkamboSpeaking(false);
      return;
    }
    isPlayingRef.current = true;
    isKkamboSpeakingRef.current = true;
    setIsKkamboSpeaking(true);
    // 깜보가 말하기 시작하면 침묵 타이머 취소
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    isUserSpeakingRef.current = false;

    if (!playCtxRef.current) playCtxRef.current = new AudioContext();
    const ctx = playCtxRef.current;
    const data = audioQueueRef.current.shift()!;
    const buf = ctx.createBuffer(1, data.length, 24000);
    buf.getChannelData(0).set(data);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = playNext;
    ctx.resume().then(() => src.start());
  }, []);

  const enqueueAudio = useCallback((b64: string) => {
    audioQueueRef.current.push(base64ToFloat32(b64));
    if (!isPlayingRef.current) playNext();
  }, [playNext]);

  // ── 마이크 시작 ────────────────────────────────────────────
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      micCtxRef.current = ctx;
      await ctx.resume();

      await ctx.audioWorklet.addModule('/mic-processor.js');

      if (ctx.state === 'closed') return;

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'mic-processor');
      processorRef.current = worklet;

      const SILENCE_THRESHOLD = 0.01;
      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || isMutedRef.current) return;

        // 3초 정적 감지: RMS 계산
        const data = e.data;
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
        const rms = Math.sqrt(sumSq / data.length);

        if (rms > SILENCE_THRESHOLD) {
          // 말하는 중 — 타이머 리셋
          isUserSpeakingRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (isUserSpeakingRef.current && !silenceTimerRef.current && !isKkamboSpeakingRef.current) {
          // 방금 침묵 시작 — 3초 타이머 개시
          silenceTimerRef.current = setTimeout(() => {
            const currentWs = wsRef.current;
            if (currentWs && currentWs.readyState === WebSocket.OPEN) {
              currentWs.send(JSON.stringify({ type: 'turnEnd' }));
            }
            isUserSpeakingRef.current = false;
            silenceTimerRef.current = null;
          }, 3000);
        }

        ws.send(JSON.stringify({ type: 'audio', data: float32ToBase64(data) }));
      };

      // 에코 방지: 무음 GainNode를 통해 destination 연결
      const silencer = ctx.createGain();
      silencer.gain.value = 0;
      source.connect(worklet);
      worklet.connect(silencer);
      silencer.connect(ctx.destination);
      setIsRecording(true);
    } catch (err) {
      console.error('[startMic] 오류:', err);
      // 오디오 셋업 실패 — ws 세션은 유지하고 오류 상태만 표시
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      micCtxRef.current?.close().catch(() => {});
      micCtxRef.current = null;
      setSessionState('error');
    }
  }, []);

  // ── 세션 종료 ──────────────────────────────────────────────
  const stopSession = useCallback(() => {
    // 세션 완료 상태로 업데이트 (fire-and-forget)
    if (sessionIdRef.current) {
      const _backendUrl = (import.meta.env.VITE_BACKEND_URL ?? '').replace(/\/$/, '');
      fetch(`${_backendUrl}/api/session/${sessionIdRef.current}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }).catch(() => {});
      sessionIdRef.current = null;
    }

    // onclose 재진입 방지: ws.close() 전에 먼저 false로 설정
    isListeningRef.current = false;

    streamRef.current?.getTracks().forEach(t => t.stop());
    processorRef.current?.disconnect();
    micCtxRef.current?.close();
    playCtxRef.current?.close();
    wsRef.current?.close();

    wsRef.current = null;
    micCtxRef.current = null;
    processorRef.current = null;
    streamRef.current = null;
    playCtxRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    setIsRecording(false);
    setIsKkamboSpeaking(false);
    setTranscript('');
    setUserTranscript('');
    setMetrics(null);
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    isUserSpeakingRef.current = false;
    isKkamboSpeakingRef.current = false;
    isMutedRef.current = false;
    setIsMuted(false);
    setSessionState('idle');
    setIsListening(false);
  }, []);

  // ── 음소거 토글 ────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
  }, []);

  // ── 백엔드 URL 유틸 ────────────────────────────────────────
  // VITE_BACKEND_URL=https://api.example.com  (프로덕션 배포 시 설정)
  // 미설정 시 상대 경로 사용 (Vite 프록시 또는 동일 오리진 배포)
  const backendUrl = (import.meta.env.VITE_BACKEND_URL ?? '').replace(/\/$/, '');
  const apiUrl = (path: string) => `${backendUrl}${path}`;

  // ── 세션 시작 ──────────────────────────────────────────────
  const startSession = useCallback(async (file: string, fileUri?: string, mimeType?: string) => {
    setSessionState('connecting');
    isListeningRef.current = true;
    setIsListening(true);

    let wsUrl: string;
    if (import.meta.env.VITE_BACKEND_WS_URL) {
      wsUrl = import.meta.env.VITE_BACKEND_WS_URL;
    } else if (import.meta.env.VITE_BACKEND_URL) {
      wsUrl = import.meta.env.VITE_BACKEND_URL
        .replace(/\/$/, '')
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:') + '/ws/live';
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${proto}//${window.location.host}/ws/live`;
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as {
        type: string; data?: string; text?: string; message?: string; // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } & { [key: string]: any };

      if (msg.type === 'ready') {
        setSessionState('active');
        // 파일 컨텍스트 전달 후 마이크 시작
        ws.send(JSON.stringify({ type: 'context', fileName: file, fileUri, mimeType }));
        startMic();
      } else if (msg.type === 'audio' && msg.data) {
        enqueueAudio(msg.data);
      } else if (msg.type === 'transcript' && msg.text) {
        setTranscript(msg.text);
      } else if (msg.type === 'userTranscript' && msg.text) {
        setUserTranscript(msg.text);
      } else if (msg.type === 'turnComplete') {
        // 깜보 발화 완료 — 3초 후 말풍선 비우기
        setTimeout(() => setTranscript(''), 3000);
      } else if (msg.type === 'metrics' && msg.data) {
        setMetrics(msg.data as MetricsData);
      } else if (msg.type === 'error') {
        console.error('Live 오류:', msg.message);
        setSessionState('error');
      }
    };

    ws.onclose = () => {
      if (isListeningRef.current) stopSession();
    };
    ws.onerror = () => setSessionState('error');
  }, [startMic, enqueueAudio, stopSession]);

  const handleTeach = async () => {
    if (!fileName.trim() || !fileObj) return;
    setIsUploading(true);
    setSessionState('idle');
    try {
      const form = new FormData();
      form.append('file', fileObj);
      const res = await fetch(apiUrl('/api/upload'), { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`업로드 실패 (${res.status}): ${body}`);
      }
      const { sessionId, fileName: uploadedName, fileUri, mimeType } = await res.json();

      // 세션 생성
      await fetch(apiUrl('/api/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, fileName: uploadedName }),
      }).catch(() => {}); // 세션 생성 실패해도 대화는 진행
      sessionIdRef.current = sessionId;

      startSession(uploadedName, fileUri, mimeType);
    } catch (err) {
      console.error('[handleTeach] 업로드 오류:', err);
      setSessionState('error');
    } finally {
      setIsUploading(false);
    }
  };

  // 말풍선 텍스트
  const bubbleContent = isListening
    ? (transcript || (sessionState === 'connecting' ? '연결 중...' : ''))
    : (bubbleVisible ? displayedText : '');
  const truncatedBubble = bubbleContent.length > 55
    ? bubbleContent.slice(0, 55) + '…'
    : bubbleContent;

  return (
    <div className="relative min-h-screen bg-white overflow-hidden font-sans">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0 pointer-events-auto overflow-hidden">
        <motion.div
          animate={
            isListening
              ? { x: -350, y: [200, 188, 200], scale: 1.45, rotateX: [0, 8, 0] }
              : { x: [0, 80, 80, -80, -80, 0] }
          }
          transition={
            isListening
              ? {
                  x: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
                  scale: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
                  y: { duration: 1.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.3 },
                  rotateX: { duration: 1.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.3 },
                }
              : { x: { duration: 10, repeat: Infinity, ease: 'easeInOut' } }
          }
          style={{ perspective: 800, transformOrigin: 'center 40%' }}
          className="absolute -inset-[100px]"
        >
          <iframe
            src="https://my.spline.design/genkubgreetingrobot-Ucp7PWPw2Qa19dJxWCY6sMTW/"
            frameBorder="0"
            width="100%"
            height="100%"
            className="w-full h-full"
            title="3D Robot Background"
          />

          {/* 말풍선 */}
          <AnimatePresence>
            {bubbleContent && (
              <motion.div
                key="bubble"
                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 4 }}
                transition={{ duration: 0.25 }}
                className="absolute top-[20%] left-[58%] z-10 pointer-events-none"
              >
                <div className="relative bg-white text-black px-5 py-3 rounded-2xl shadow-lg text-[18px] font-medium max-w-[280px] leading-snug">
                  {truncatedBubble}
                  {isKkamboSpeaking && (
                    <span className="inline-block w-[2px] h-[1em] bg-black/60 align-middle ml-1 animate-pulse" />
                  )}
                  <div className="absolute -bottom-2 left-6 w-4 h-4 bg-white rotate-45 rounded-sm" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Gradient Overlays */}
      <motion.div
        animate={{ opacity: isListening ? 0.15 : 0.8 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black z-0 pointer-events-none"
      />
      <motion.div
        animate={{ opacity: isListening ? 0.15 : 0.6 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)] z-0 pointer-events-none"
      />

      {/* Navbar */}
      <nav className="absolute top-0 w-full px-6 py-5 z-20 pointer-events-auto flex justify-between items-center">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tighter text-white">
          <Bot className="w-6 h-6 text-blue-400" />
          <span>Kkambo</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black rounded-full transition-all flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            Premium
          </button>
          <button className="px-5 py-2.5 text-sm font-medium bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full transition-colors text-white">
            로그인
          </button>
        </div>
      </nav>

      {/* ── 대기 화면 (히어로) ── */}
      <AnimatePresence>
        {!isListening && (
          <motion.div
            key="hero"
            initial={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pointer-events-none"
          >
            <div className="text-center max-w-3xl mx-auto flex flex-col items-center w-full">
              <h1 className="text-3xl md:text-5xl lg:text-[3.5rem] font-black tracking-tight mb-5 leading-tight text-gray-900">
                가르치면서 배우는<br />
                가장 똑똑한 학습법
              </h1>
              <p className="text-sm md:text-lg text-gray-600 mb-10 max-w-xl mx-auto leading-relaxed">
                눈으로만 읽는 공부는 끝.{' '}
                나만의 AI 제자 깜보에게 설명하며 완벽하게 이해하세요.
              </p>

              <div className="w-full max-w-2xl pointer-events-auto">
                <div className="relative flex items-center bg-black/[0.04] backdrop-blur-xl border border-black/[0.1] rounded-2xl p-2 transition-all focus-within:border-blue-500/50 focus-within:shadow-[0_0_40px_rgba(59,130,246,0.12)]">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null;
                      setFileObj(f);
                      setFileName(f?.name ?? '');
                    }}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.md"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className={fileName ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>
                      {fileName || '오늘 가르칠 파일을 업로드하세요'}
                    </span>
                  </button>
                  <button
                    onClick={handleTeach}
                    disabled={!fileObj || isUploading}
                    className="flex-shrink-0 px-5 md:px-6 py-3 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    {isUploading ? '업로드 중...' : '깜보 가르치기'}
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                {sessionState === 'error' && (
                  <p className="text-sm text-red-400 mt-3 text-center">
                    업로드 또는 연결에 실패했습니다. 다시 시도해주세요.
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  {['📘 채찍효과란?', '📐 선형계획법 설명', '🧬 DNA 복제 과정'].map(chip => (
                    <button
                      key={chip}
                      className="px-3.5 py-1.5 text-xs text-gray-500 bg-black/[0.04] hover:bg-black/[0.08] border border-black/[0.07] rounded-full transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 음성 대화 화면 ── */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            key="voice-ui"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-end pb-16 pointer-events-none"
          >
            {/* MetricsPanel */}
            <MetricsPanel visible={isListening} metrics={metrics} />

            {/* 상태 표시 */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col items-center gap-6 pointer-events-auto"
            >
              {/* 상태 텍스트 */}
              {sessionState === 'error' ? (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-red-400">연결 오류가 발생했어요</p>
                  <button
                    onClick={stopSession}
                    className="px-5 py-2 text-sm font-medium bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 rounded-full transition-colors text-white"
                  >
                    처음으로 돌아가기
                  </button>
                </div>
              ) : (
                <p className="text-sm text-white/60">
                  {sessionState === 'connecting' && '깜보에 연결 중...'}
                  {sessionState === 'active' && isKkamboSpeaking && '깜보가 말하는 중...'}
                  {sessionState === 'active' && !isKkamboSpeaking && isRecording && !isMuted && '말해봐! 듣고 있어 👂'}
                  {sessionState === 'active' && isMuted && '음소거 중 🔇'}
                </p>
              )}

              {/* 사용자 음성 인식 결과 */}
              {sessionState === 'active' && userTranscript && (
                <p className="text-xs text-white/40 max-w-[280px] text-center truncate">
                  "{userTranscript}"
                </p>
              )}

              {/* 마이크 버튼 */}
              <div className="relative flex items-center justify-center">
                {/* 녹음 중 펄스 */}
                {isRecording && !isMuted && (
                  <motion.div
                    animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute w-24 h-24 rounded-full bg-red-400"
                  />
                )}
                {/* 깜보 말하는 중 펄스 */}
                {isKkamboSpeaking && (
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute w-24 h-24 rounded-full bg-blue-400"
                  />
                )}
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  disabled={sessionState === 'connecting'}
                  onClick={isRecording ? toggleMute : undefined}
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-colors ${
                    isMuted
                      ? 'bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20'
                      : isRecording
                        ? 'bg-red-500 hover:bg-red-400'
                        : 'bg-white/20 backdrop-blur-md hover:bg-white/30 border border-white/20'
                  } disabled:opacity-50`}
                >
                  {isMuted
                    ? <MicOff className="w-8 h-8 text-white/50" />
                    : <Mic className="w-8 h-8 text-white" />
                  }
                </motion.button>
              </div>

              {/* 종료 버튼 */}
              <button
                onClick={stopSession}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white/60 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
                대화 종료
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
