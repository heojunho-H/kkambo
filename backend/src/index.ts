import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { uploadRouter } from './functions/upload.js';
import { sessionRouter } from './functions/session.js';
import { metricsRouter } from './functions/metrics.js';
import { attachLiveWS } from './functions/live.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/upload', uploadRouter);
app.use('/api/session', sessionRouter);
app.use('/api/metrics', metricsRouter);

// HTTP 서버 생성 후 WebSocket 연결 (Express + ws 공존)
const server = http.createServer(app);
attachLiveWS(server);

server.listen(PORT, () => {
  console.log(`Kkambo backend running on http://localhost:${PORT}`);
});
