import express from 'express';
import cors from 'cors';
import { DEFAULT_PORT, DEFAULT_HOST } from './config/constants.js';
import gitRoutes from './routes/gitRoutes.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', gitRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Git Bridge Server is running' });
});

// Start Server
const PORT = DEFAULT_PORT;
const server = app.listen(PORT, DEFAULT_HOST, () => {
  console.log(`🚀 Git Bridge Server running at http://${DEFAULT_HOST}:${PORT}/`);
  console.log(`📁 API endpoints mounted under http://${DEFAULT_HOST}:${PORT}/api/`);
});

export default app;
