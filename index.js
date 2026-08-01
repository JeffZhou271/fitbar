import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fitbar-dev-secret-change-me';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'fitbar.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const defaultDb = {
  users: [],
  scores: [],
  sensor: {
    position: 50,
    velocity: 0,
    angle: 0,
    source: 'demo',
    updatedAt: null,
  },
};

async function readDb() {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    return { ...defaultDb, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(defaultDb, null, 2));
    return structuredClone(defaultDb);
  }
}

async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
  };
}

function signToken(user) {
  return jwt.sign(publicUser(user), JWT_SECRET, { expiresIn: '7d' });
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ message: 'FitBar API is running', data: { ok: true } });
});

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const db = await readDb();
  const taken = db.users.some((user) => user.username.toLowerCase() === username.toLowerCase());

  if (taken) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const user = {
    id: randomUUID(),
    username,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: new Date().toISOString(),
  };

  db.users.push(user);
  await writeDb(db);

  res.status(201).json({
    message: 'Account created',
    data: {
      user: publicUser(user),
      token: signToken(user),
    },
  });
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const db = await readDb();
  const user = db.users.find((entry) => entry.username.toLowerCase() === username.toLowerCase());

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  res.json({
    message: 'Logged in',
    data: {
      user: publicUser(user),
      token: signToken(user),
    },
  });
});

app.get('/api/me', authenticate, (req, res) => {
  res.json({ message: 'Current user', data: { user: req.user } });
});

app.get('/api/sensor/latest', (req, res) => {
  readDb().then((db) => {
    res.json({ message: 'Latest sensor reading', data: db.sensor });
  });
});

app.post('/api/sensor', async (req, res) => {
  const position = Number(req.body.position);
  const velocity = Number(req.body.velocity || 0);
  const angle = Number(req.body.angle || 0);

  if (!Number.isFinite(position)) {
    return res.status(400).json({ error: 'Send a numeric position from 0 to 100.' });
  }

  const db = await readDb();
  db.sensor = {
    position: Math.max(0, Math.min(100, position)),
    velocity,
    angle,
    source: req.body.source || 'esp32',
    updatedAt: new Date().toISOString(),
  };
  await writeDb(db);

  res.json({ message: 'Sensor reading saved', data: db.sensor });
});

app.post('/api/scores', authenticate, async (req, res) => {
  const score = Number(req.body.score);
  const accuracy = Number(req.body.accuracy);
  const reps = Number(req.body.reps);
  const mode = String(req.body.mode || 'Shoulder Press');

  if (![score, accuracy, reps].every(Number.isFinite)) {
    return res.status(400).json({ error: 'Score, accuracy and reps are required.' });
  }

  const db = await readDb();
  const result = {
    id: randomUUID(),
    userId: req.user.id,
    username: req.user.username,
    mode,
    score: Math.round(score),
    accuracy: Math.round(accuracy),
    reps: Math.round(reps),
    createdAt: new Date().toISOString(),
  };

  db.scores.push(result);
  await writeDb(db);

  res.status(201).json({ message: 'Score saved', data: result });
});

app.get('/api/scores', authenticate, async (req, res) => {
  const db = await readDb();
  const scores = db.scores
    .filter((score) => score.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  res.json({ message: 'Recent scores', data: scores });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`FitBar game running on http://localhost:${PORT}`);
  });
}

export default app;
