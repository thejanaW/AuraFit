const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  // name is optional server-side (existing/older clients still work without
  // it) — the mobile Register screen requires it, but that's a client-side
  // rule, not a data-integrity one, so it stays nullable here too.
  const trimmedName = typeof name === 'string' && name.trim() ? name.trim() : null;

  const hash = await bcrypt.hash(password, 12);

  // Insert into users table; Supabase auth is not used here —
  // we manage credentials ourselves so the backend stays the single source of truth.
  const { data, error } = await supabase
    .from('users')
    .insert({ email, password_hash: hash, name: trimmedName })
    .select('id, email, name, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    return res.status(500).json({ error: error.message });
  }

  const token = signToken(data.id);
  res.status(201).json({ token, user: data });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, password_hash, created_at')
    .eq('email', email)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
  });
});

// GET /auth/me — current user's own profile, incl. name (used by ProfileScreen;
// login/register also return the user object directly so this mainly serves a
// re-fetch after the token was restored from storage without a fresh login).
router.get('/me', requireAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, created_at')
    .eq('id', req.userId)
    .single();

  if (error || !user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.slice(7);
  try {
    // ignoreExpiration so a recently-expired token can be refreshed
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      ignoreExpiration: true,
    });
    const newToken = signToken(payload.sub);
    res.json({ token: newToken });
  } catch {
    res.status(401).json({ error: 'Token invalid' });
  }
});

module.exports = router;
