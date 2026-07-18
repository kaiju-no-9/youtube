import express from 'express';
import dotenv from 'dotenv';
import { personRouter } from './routes/person.routes.js';
import { closeDriver } from './db.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// API Routes
app.use('/api/people', personRouter);

// Basic health check/index route
app.get('/', (req, res) => {
  res.json({ message: 'Neo4j People Relationship Test API is running!' });
});

const server = app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down server...');
  server.close(async () => {
    console.log('Express server closed.');
    await closeDriver();
    console.log('Neo4j driver closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
