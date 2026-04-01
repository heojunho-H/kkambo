import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';

const router = Router();

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    // PDF
    if (mimeType === 'application/pdf') {
      const data = await pdfParse(buffer);
      return data.text.trim();
    }

    // DOCX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    // DOC (구버전 Word — 텍스트 추출 제한적)
    if (mimeType === 'application/msword') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    }

    // PPTX — ZIP 내부 slide XML에서 <a:t> 태그 추출
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      const zip = new AdmZip(buffer);
      type ZipEntry = { entryName: string; getData: () => Buffer };
      const entries = zip.getEntries() as ZipEntry[];
      const slideTexts: string[] = [];

      const slideEntries = entries
        .filter((e: ZipEntry) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
        .sort((a: ZipEntry, b: ZipEntry) => a.entryName.localeCompare(b.entryName));

      for (const entry of slideEntries) {
        const xml = entry.getData().toString('utf-8');
        const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
        const text = matches
          .map((m: string) => m.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join(' ');
        if (text) slideTexts.push(text);
      }
      return slideTexts.join('\n').trim();
    }

    // PPT (구버전 PowerPoint — 추출 불가)
    if (mimeType === 'application/vnd.ms-powerpoint') {
      return '(구버전 .ppt 파일은 텍스트 추출이 지원되지 않습니다. .pptx 형식으로 변환 후 업로드해주세요.)';
    }

    // TXT / Markdown
    return buffer.toString('utf-8').trim();
  } catch (err) {
    console.warn('텍스트 추출 실패 (진행 계속):', err);
    return '';
  }
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

  try {
    const extractedText = await extractText(req.file.buffer, req.file.mimetype);

    res.json({
      sessionId: crypto.randomUUID(),
      fileName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      extractedText,
    });
  } catch (err) {
    console.error('파일 처리 오류:', err);
    res.status(500).json({ error: String(err) });
  }
});

export { router as uploadRouter };
