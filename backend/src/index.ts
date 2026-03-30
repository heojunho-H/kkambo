import express from 'express';
import cors from 'cors';
import { uploadRouter } from './functions/upload.js';
import { sessionRouter } from './functions/session.js';
import { metricsRouter } from './functions/metrics.js';

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

app.listen(PORT, () => {
  console.log(`Kkambo backend running on http://localhost:${PORT}`);
});
