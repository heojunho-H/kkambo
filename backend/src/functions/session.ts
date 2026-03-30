import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// 깜보 학습 세션 상태
const SessionSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().optional(),
  fileName: z.string(),
  startedAt: z.string().datetime(),
  status: z.enum(['active', 'completed', 'paused']),
});

type Session = z.infer<typeof SessionSchema>;

// 인메모리 세션 저장소 (이후 Firestore로 교체)
const sessions = new Map<string, Session>();

// POST /api/session — 새 학습 세션 시작
router.post('/', (req, res) => {
  const result = SessionSchema.safeParse({
    ...req.body,
    startedAt: new Date().toISOString(),
    status: 'active',
  });

  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  sessions.set(result.data.sessionId, result.data);
  res.status(201).json(result.data);
});

// GET /api/session/:id — 세션 조회
router.get('/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
    return;
  }
  res.json(session);
});

// PATCH /api/session/:id — 세션 상태 업데이트
router.patch('/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
    return;
  }
  const updated = { ...session, ...req.body };
  sessions.set(req.params.id, updated);
  res.json(updated);
});

export { router as sessionRouter };
