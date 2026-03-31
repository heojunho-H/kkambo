import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';

type MetricsEval = {
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

async function evaluateMetrics(
  ai: GoogleGenAI,
  userTexts: string[],
  kkamboTexts: string[],
): Promise<MetricsEval | null> {
  const prompt = `다음은 사용자가 AI 제자 '깜보'에게 학습 내용을 설명한 대화입니다.

사용자 발화:
${userTexts.join('\n')}

깜보 발화:
${kkamboTexts.join('\n')}

위 대화를 분석하여 아래 메트릭을 0-100 정수 점수로 평가하고, 각 항목에 짧고 구체적인 한국어 설명(note)을 작성하세요.
반드시 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "keywordCoverage": <0-100>,
  "keywordCoverageNote": "<핵심 키워드 언급 상황, 예: '주요 키워드 18개 중 13개 언급'>",
  "conceptConnectivity": <0-100>,
  "conceptConnectivityNote": "<개념 연결 상황, 예: '상위 개념 간 연결 4건 중 2건 성립'>",
  "feynmanIndex": <0-100>,
  "feynmanIndexNote": "<비유/쉬운 설명 사용 여부, 예: '비유 3회 · 전공 용어 직접 인용 2회'>",
  "feynmanIndexTag": "<점수에 따라 '우수'(>=80) | '양호'(>=60) | '개선 필요'(<60), 또는 null>",
  "explanationFluency": <0-100>,
  "explanationFluencyNote": "<설명의 흐름과 자연스러움>",
  "questionDefenseRate": <0-100>,
  "questionDefenseRateNote": "<깜보 질문에 대한 대응 현황>",
  "questionDefenseRateTag": "<방어 건수 표시(예: '3/4'), 또는 null>",
  "kkamboUnderstanding": <0-100>,
  "kkamboUnderstandingNote": "<깜보의 이해도 상태 설명>",
  "alertMessage": "<누락 개념이나 사실 오류가 있으면 짧게, 없으면 null>"
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' },
    });
    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as MetricsEval;
  } catch (err) {
    console.error('메트릭 평가 오류:', err);
    return null;
  }
}

const KKAMBO_PERSONA = `
너는 '깜보'야. 호기심 많고 귀여운 AI 학생이야.
사용자가 개념을 음성으로 설명해주면, 열심히 듣고 이해하려고 노력해.
행동 방식:
- 이해가 안 되는 부분은 솔직하게 질문해
- 잘 이해했으면 "아~ 그렇구나!" 같은 공감 표현을 써
- 사용자가 설명을 잘 하면 칭찬해줘
- 사용자가 막히면 힌트가 될 만한 질문을 던져줘
- 절대 너무 똑똑하게 굴지 마. 넌 배우는 입장이야
- 항상 자연스러운 한국어로 짧게 대화해
- 이모지를 가끔 써서 귀엽게 반응해
`;

type ClientMsg =
  | { type: 'audio'; data: string }                                                   // base64 PCM16 16kHz
  | { type: 'context'; fileName: string; fileUri?: string; mimeType?: string }        // 파일 컨텍스트
  | { type: 'turnEnd' };                                                               // 3초 정적 → 깜보 응답 트리거

export function attachLiveWS(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', async (ws: WebSocket, _req: IncomingMessage) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      ws.send(JSON.stringify({ type: 'error', message: 'GEMINI_API_KEY 미설정' }));
      ws.close();
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sessionResolve!: (s: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionReady = new Promise<any>(resolve => { sessionResolve = resolve; });

    let sessionClosed = false;
    const userTranscripts: string[] = [];
    const kkamboTranscripts: string[] = [];

    try {
      const session = await ai.live.connect({
        model: 'gemini-2.0-flash-live-001',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: KKAMBO_PERSONA }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
        callbacks: {
          onopen: () => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ready' }));
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onmessage: (msg: any) => {
            if (ws.readyState !== WebSocket.OPEN) return;

            // 사용자 입력 트랜스크립트 (마이크 음성 인식 확인용)
            if (msg.serverContent?.inputTranscription?.text) {
              const text: string = msg.serverContent.inputTranscription.text;
              console.log('[사용자 입력]', text);
              userTranscripts.push(text);
              ws.send(JSON.stringify({ type: 'userTranscript', text }));
            }

            // 깜보 오디오 트랜스크립트
            if (msg.serverContent?.outputTranscription?.text) {
              const text: string = msg.serverContent.outputTranscription.text;
              kkamboTranscripts.push(text);
              ws.send(JSON.stringify({ type: 'transcript', text }));
            }

            const parts: any[] = msg.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                ws.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
              }
            }
            if (msg.serverContent?.turnComplete) {
              ws.send(JSON.stringify({ type: 'turnComplete' }));
              // 메트릭 평가 (비동기, non-blocking)
              if (userTranscripts.length > 0) {
                evaluateMetrics(ai, [...userTranscripts], [...kkamboTranscripts]).then((metrics) => {
                  if (metrics && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'metrics', data: metrics }));
                  }
                }).catch(() => {});
              }
            }
          },
          onclose: (evt?: { code?: number; reason?: string }) => {
            console.log('[Gemini Live] 세션 종료 — code:', evt?.code, 'reason:', evt?.reason);
            sessionClosed = true;
            if (ws.readyState === WebSocket.OPEN) ws.close();
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live 오류:', err);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: String(err) }));
            }
          },
        },
      });

      // connect()가 resolve된 후 session 확정 → 메시지 핸들러에서 안전하게 사용 가능
      sessionResolve(session);

      ws.on('message', async (data: Buffer) => {
        try {
          const msg: ClientMsg = JSON.parse(data.toString());
          const s = await sessionReady;

          if (msg.type === 'audio') {
            s.sendRealtimeInput({
              audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (msg.type === 'context') {
            // 파일 컨텍스트 첫 메시지로 전달
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const parts: any[] = [{ text: `오늘 "${msg.fileName}" 파일에 대해 설명해줄게!` }];
            if (msg.fileUri && msg.mimeType) {
              parts.push({ fileData: { fileUri: msg.fileUri, mimeType: msg.mimeType } });
            }
            s.sendClientContent({
              turns: [{ role: 'user', parts }],
              turnComplete: true,
            });
          } else if (msg.type === 'turnEnd') {
            // 3초 정적 감지 → 깜보 응답 트리거
            s.sendClientContent({ turnComplete: true });
          }
        } catch { /* JSON parse 오류 무시 */ }
      });

      ws.on('close', () => {
        if (!sessionClosed) {
          sessionClosed = true;
          session.close();
        }
      });

    } catch (err) {
      console.error('Live 세션 시작 오류:', err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: String(err) }));
        ws.close();
      }
    }
  });
}
