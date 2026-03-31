import { Router } from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

const router = Router();

async function waitForFileActive(ai: GoogleGenAI, name: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const file = await ai.files.get({ name });
    if (file.state === 'ACTIVE') return;
    if (file.state === 'FAILED') throw new Error('파일 처리 실패');
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('파일 처리 시간 초과 (30초)');
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

    // PROCESSING → ACTIVE 대기 (최대 30초)
    if (uploaded.name) {
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
