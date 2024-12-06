const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const { db } = require('./firebaseAdmin');

// Load environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Step 1: User clicks "Sign in with Google"
router.get('/google', (req, res) => {
  const scope = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
    // Add YouTube scopes later if you need them, e.g:
    // 'https://www.googleapis.com/auth/youtube.readonly'
  ];

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: scope,
    prompt: 'consent'
  });

  res.redirect(url);
});

// Step 2: Handle OAuth callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;

  if(!code) {
    return res.status(400).send('No code provided.');
  }

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info
    const userInfoResp = await client.request({
      url: 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json'
    });

    const userData = userInfoResp.data;
    const userId = userData.id; // unique Google user ID

    // Store/Update user in Firestore
    await db.collection('users').doc(userId).set({
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      tokens: tokens
    }, { merge: true });

    // At this point, user is signed in.
    // You can set a session cookie or JWT for the user.
    // For simplicity, let's just show a welcome message:
    res.send(`<h1>Sign in successful!</h1><p>Welcome, ${userData.name}.</p>`);
  } catch (error) {
    console.error('Error during Google sign-in callback:', error);
    res.status(500).send('Authentication failed.');
  }
});

module.exports = router;
