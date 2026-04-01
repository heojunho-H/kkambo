import WebSocket, { WebSocketServer } from 'ws';
import type { Server } from 'http';
import OpenAI from 'openai';

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
  openai: OpenAI,
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const text = response.choices[0]?.message.content;
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
  | { type: 'audio'; data: string }
  | { type: 'context'; fileName: string; content?: string }
  | { type: 'turnEnd' };

type OaiEvent = { type: string; [key: string]: unknown };

export function attachLiveWS(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  // Railway 프록시 idle timeout 방지: 30초마다 ping
  const pingInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.ping();
    });
  }, 30_000);
  wss.on('close', () => clearInterval(pingInterval));

  wss.on('connection', (ws: WebSocket) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      ws.send(JSON.stringify({ type: 'error', message: 'OPENAI_API_KEY 미설정' }));
      ws.close();
      return;
    }

    const openai = new OpenAI({ apiKey });
    const userTranscripts: string[] = [];
    const kkamboTranscripts: string[] = [];
    let transcriptBuffer = '';
    let readySent = false;

    // OpenAI Realtime WebSocket 연결
    const oaiWs = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      },
    );

    oaiWs.on('open', () => {
      oaiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          instructions: KKAMBO_PERSONA,
          voice: 'shimmer',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 800,
          },
        },
      }));
    });

    oaiWs.on('message', (rawData: Buffer) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      let event: OaiEvent;
      try {
        event = JSON.parse(rawData.toString()) as OaiEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case 'session.updated':
          if (!readySent) {
            readySent = true;
            ws.send(JSON.stringify({ type: 'ready' }));
          }
          break;

        case 'response.created':
          // 새 응답 시작 — 트랜스크립트 버퍼 초기화
          transcriptBuffer = '';
          break;

        case 'response.audio.delta':
          ws.send(JSON.stringify({ type: 'audio', data: event.delta }));
          break;

        case 'response.audio_transcript.delta': {
          transcriptBuffer += (event.delta as string) ?? '';
          ws.send(JSON.stringify({ type: 'transcript', text: transcriptBuffer }));
          break;
        }

        case 'response.audio_transcript.done':
          kkamboTranscripts.push((event.transcript as string) || transcriptBuffer);
          transcriptBuffer = '';
          break;

        case 'conversation.item.input_audio_transcription.completed': {
          const text = event.transcript as string;
          userTranscripts.push(text);
          ws.send(JSON.stringify({ type: 'userTranscript', text }));
          break;
        }

        case 'response.done':
          ws.send(JSON.stringify({ type: 'turnComplete' }));
          if (userTranscripts.length > 0) {
            evaluateMetrics(openai, [...userTranscripts], [...kkamboTranscripts])
              .then((metrics) => {
                if (metrics && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'metrics', data: metrics }));
                }
              })
              .catch(() => {});
          }
          break;

        case 'error': {
          const errMsg = (event.error as { message?: string })?.message ?? 'OpenAI Realtime 오류';
          console.error('[OpenAI Realtime] 오류:', event.error);
          ws.send(JSON.stringify({ type: 'error', message: errMsg }));
          break;
        }
      }
    });

    oaiWs.on('close', (code, reason) => {
      console.log('[OpenAI Realtime] 세션 종료 — code:', code, 'reason:', reason.toString());
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'OpenAI Realtime 세션이 종료되었습니다' }));
        ws.close();
      }
    });

    oaiWs.on('error', (err) => {
      console.error('[OpenAI Realtime] WebSocket 오류:', err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: String(err) }));
      }
    });

    // 클라이언트 → OpenAI 중계
    ws.on('message', (data: Buffer) => {
      try {
        const msg: ClientMsg = JSON.parse(data.toString());
        if (oaiWs.readyState !== WebSocket.OPEN) return;

        if (msg.type === 'audio') {
          oaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: msg.data,
          }));
        } else if (msg.type === 'context') {
          // 학습 자료를 시스템 지시사항에 주입 후 깜보 인사 유도
          const docContext = msg.content
            ? `\n\n오늘 학습 자료:\n${msg.content}`
            : '';
          oaiWs.send(JSON.stringify({
            type: 'session.update',
            session: { instructions: KKAMBO_PERSONA + docContext },
          }));
          oaiWs.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{
                type: 'input_text',
                text: `"${msg.fileName}" 파일을 업로드했어. 이 내용을 바탕으로 나한테 설명 듣고 질문할 준비해줘!`,
              }],
            },
          }));
          oaiWs.send(JSON.stringify({ type: 'response.create' }));
        } else if (msg.type === 'turnEnd') {
          // server_vad가 자동으로 턴을 처리하므로 클라이언트 명시적 커밋은 무시
        }
      } catch { /* JSON parse 오류 무시 */ }
    });

    ws.on('close', () => {
      if (oaiWs.readyState === WebSocket.OPEN) oaiWs.close();
    });
  });
}
