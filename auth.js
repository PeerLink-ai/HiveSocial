const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('./db');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Step 1: Redirect to Google for sign in
router.get('/google', (req, res) => {
  const scope = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: scope,
    prompt: 'consent'
  });

  res.redirect(url);
});

// Step 2: Google callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('No code provided.');
  }

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const userInfoResp = await client.request({
      url: 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json'
    });
    const userData = userInfoResp.data;
    const userId = userData.id;

    // Insert or update user in Postgres
    const queryText = `
      INSERT INTO users (id, email, name, picture, tokens)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        picture = EXCLUDED.picture,
        tokens = EXCLUDED.tokens
    `;
    const values = [userId, userData.email, userData.name, userData.picture, tokens];
    await pool.query(queryText, values);

    res.send(`<h1>Sign in successful!</h1><p>Welcome, ${userData.name}.</p>`);
  } catch (error) {
    console.error('Error during Google sign-in callback:', error);
    res.status(500).send('Authentication failed.');
  }
});

module.exports = router;
