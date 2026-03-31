import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';

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
  | { type: 'audio'; data: string }     // base64 PCM16 16kHz
  | { type: 'context'; fileName: string }; // 파일명 컨텍스트

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

    try {
      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-latest',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: KKAMBO_PERSONA }] },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            sessionResolve(session);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ready' }));
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onmessage: (msg: any) => {
            if (ws.readyState !== WebSocket.OPEN) return;

            // 오디오 트랜스크립트
            if (msg.serverContent?.outputTranscription?.text) {
              ws.send(JSON.stringify({ type: 'transcript', text: msg.serverContent.outputTranscription.text }));
            }

            const parts: any[] = msg.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                ws.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
              }
            }
            if (msg.serverContent?.turnComplete) {
              ws.send(JSON.stringify({ type: 'turnComplete' }));
            }
          },
          onclose: () => {
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
            s.sendClientContent({
              turns: [{
                role: 'user',
                parts: [{ text: `오늘 "${msg.fileName}" 파일에 대해 설명해줄게!` }],
              }],
              turnComplete: true,
            });
          }
        } catch { /* JSON parse 오류 무시 */ }
      });

      ws.on('close', () => {
        session.close();
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
