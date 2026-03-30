import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// UI MetricsPanel과 동일한 메트릭 구조
const MetricsSchema = z.object({
  sessionId: z.string().uuid(),
  keywordCoverage: z.number().min(0).max(100),   // 핵심 키워드 도달률
  conceptConnectivity: z.number().min(0).max(100), // 개념 연결성 지수
  feynmanIndex: z.number().min(0).max(100),        // 파인만 지수
  explanationFluency: z.number().min(0).max(100),  // 설명 유창성
  questionDefenseRate: z.number().min(0).max(100), // 돌발 질문 방어율
  kkamboUnderstanding: z.number().min(0).max(100), // 깜보 이해도
});

type Metrics = z.infer<typeof MetricsSchema>;

function calcOverallScore(m: Omit<Metrics, 'sessionId'>): number {
  return Math.round(
    m.keywordCoverage * 0.25 +
    m.conceptConnectivity * 0.15 +
    m.feynmanIndex * 0.20 +
    m.explanationFluency * 0.10 +
    m.questionDefenseRate * 0.20 +
    m.kkamboUnderstanding * 0.10
  );
}

// 인메모리 저장소 (이후 Firestore로 교체)
const metricsStore = new Map<string, Metrics & { overallScore: number }>();

// POST /api/metrics — 메트릭 저장 & 종합 스코어 계산
router.post('/', (req, res) => {
  const result = MetricsSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const { sessionId, ...values } = result.data;
  const overallScore = calcOverallScore(values);
  const record = { sessionId, ...values, overallScore };

  metricsStore.set(sessionId, record);
  res.status(201).json(record);
});

// GET /api/metrics/:sessionId — 세션 메트릭 조회
router.get('/:sessionId', (req, res) => {
  const record = metricsStore.get(req.params.sessionId);
  if (!record) {
    res.status(404).json({ error: '메트릭을 찾을 수 없습니다.' });
    return;
  }
  res.json(record);
});

export { router as metricsRouter };
