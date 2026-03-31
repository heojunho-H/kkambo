import { Router } from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

const router = Router();

async function waitForFileActive(ai: GoogleGenAI, name: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const file = await ai.files.get({ name });
      if (file.state === 'ACTIVE') return;
      if (file.state === 'FAILED') {
        console.warn('파일 처리 실패 상태:', name);
        return; // throw 대신 진행 — Gemini Live가 처리
      }
    } catch (e) {
      console.warn('files.get 조회 실패 (무시):', e);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  // 타임아웃 시 throw하지 않고 경고만 — 짧은 파일은 이미 ACTIVE일 가능성 높음
  console.warn('파일 ACTIVE 대기 타임아웃, URI로 진행:', name);
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/markdown',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`지원하지 않는 파일 형식입니다: ${file.mimetype}`));
    }
  },
});

// POST /api/upload
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '파일이 없습니다.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY 미설정' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    const uploaded = await ai.files.upload({
      file: blob,
      config: { mimeType: req.file.mimetype, displayName: req.file.originalname },
    });

    // 업로드 직후 ACTIVE가 아니면 폴링 (최대 10초)
    if (uploaded.name && uploaded.state !== 'ACTIVE') {
      await waitForFileActive(ai, uploaded.name);
    }

    res.json({
      sessionId: crypto.randomUUID(),
      fileName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      fileUri: uploaded.uri,
    });
  } catch (err) {
    console.error('Gemini 파일 업로드 오류:', err);
    res.status(500).json({ error: String(err) });
  }
});

export { router as uploadRouter };
