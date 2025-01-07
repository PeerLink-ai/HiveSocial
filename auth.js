const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const { pool } = require('./db');
const session = require('express-session');

// Ensure session middleware is used
router.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Load environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// Initialize the OAuth2 client
const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Define the scopes you need
const scopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/user.birthday.read',
  'https://www.googleapis.com/auth/user.gender.read',
  'https://www.googleapis.com/auth/user.organization.read',
  'https://www.googleapis.com/auth/user.phonenumbers.read',
  'https://www.googleapis.com/auth/user.addresses.read',
  'https://www.googleapis.com/auth/profile.agerange.read',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
  'https://www.googleapis.com/auth/profile.emails.read',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtubepartner',
  'https://www.googleapis.com/auth/youtubepartner-channel-audit'
];

// Route to initiate OAuth flow
router.get('/google', (req, res) => {
  console.log('🌟 Initiating Google OAuth flow 🌟');
  const url = client.generateAuthUrl({
    access_type: 'offline', // Request refresh token
    scope: scopes,
    prompt: 'consent' // Force consent screen to get refresh token every time
  });
  console.log(`🔗 Redirecting to Google OAuth URL: ${url}`);
  res.redirect(url);
});

// Route to handle OAuth callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;
  console.log('🔄 Received OAuth callback');
  console.log(`🕒 Server Time: ${new Date().toISOString()}`); // Log server time

  if (!code) {
    console.error('❌ No authorization code provided in callback.');
    return res.status(400).send('No code provided.');
  }

  console.log(`Authorization code received: ${code}`);

  try {
    // Exchange the authorization code for tokens
    console.log('🔄 Exchanging authorization code for tokens');
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    console.log('🔑 Tokens obtained and set in OAuth2 client');

    // Fetch user information from Google
    console.log('📥 Fetching user information from Google');
    const userInfoResp = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
    const userData = userInfoResp.data;
    const userId = userData.id;
    console.log(`👤 User data fetched: ${JSON.stringify(userData)}`);

    // Fetch additional user data if needed
    let additionalData = {};

    // Fetch birthday
    try {
      const birthdayResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=birthdays', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const birthdays = birthdayResp.data.birthdays;
      if (birthdays && birthdays.length > 0) {
        const birthday = birthdays[0].date;
        if (birthday) {
          additionalData.birthday = `${birthday.year}-${birthday.month}-${birthday.day}`;
        }
      }
    } catch (error) {
      console.warn('Could not fetch birthday:', error.message);
    }

    // Fetch gender
    try {
      const genderResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=genders', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const genders = genderResp.data.genders;
      if (genders && genders.length > 0) {
        additionalData.gender = genders[0].value;
      }
    } catch (error) {
      console.warn('Could not fetch gender:', error.message);
    }

    // Fetch organization
    try {
      const orgResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=organizations', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const organizations = orgResp.data.organizations;
      if (organizations && organizations.length > 0) {
        additionalData.organization = organizations[0].name;
      }
    } catch (error) {
      console.warn('Could not fetch organization:', error.message);
    }

    // Fetch phone numbers
    try {
      const phonesResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=phoneNumbers', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const phoneNumbers = phonesResp.data.phoneNumbers;
      if (phoneNumbers && phoneNumbers.length > 0) {
        additionalData.phone_numbers = phoneNumbers.map(phone => ({
          type: phone.type,
          number: phone.value
        }));
      }
    } catch (error) {
      console.warn('Could not fetch phone numbers:', error.message);
    }

    // Fetch addresses
    try {
      const addressesResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=addresses', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const addresses = addressesResp.data.addresses;
      if (addresses && addresses.length > 0) {
        additionalData.addresses = addresses.map(address => ({
          type: address.type,
          formatted: address.formattedValue
        }));
      }
    } catch (error) {
      console.warn('Could not fetch addresses:', error.message);
    }

    // Insert or update the user in Postgres
    console.log('💾 Inserting/updating user data in the database');
    const queryText = `
      INSERT INTO users (
        id, email, name, picture, 
        addresses, birthday, gender, organization, phone_numbers, tokens
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        picture = EXCLUDED.picture,
        addresses = EXCLUDED.addresses,
        birthday = EXCLUDED.birthday,
        gender = EXCLUDED.gender,
        organization = EXCLUDED.organization,
        phone_numbers = EXCLUDED.phone_numbers,
        tokens = EXCLUDED.tokens;
    `;
    const values = [
      userId,
      userData.email,
      userData.name,
      userData.picture,
      additionalData.addresses ? JSON.stringify(additionalData.addresses) : null,
      additionalData.birthday || null,
      additionalData.gender || null,
      additionalData.organization || null,
      additionalData.phone_numbers ? JSON.stringify(additionalData.phone_numbers) : null,
      JSON.stringify(tokens)
    ];
    console.log(`📝 Executing query with values: ${JSON.stringify(values)}`);
    await pool.query(queryText, values);
    console.log('✅ User data inserted/updated successfully');

    // Save user ID in session
    console.log(`💾 Saving user ID ${userId} in session`);
    req.session.userId = userId;

    // Redirect to dashboard after successful sign-in
    console.log('🚀 Redirecting user to dashboard');
    res.redirect('/dashboard');
  } catch (error) {
    console.error('❌ Error during OAuth callback:', error.response ? error.response.data : error.message);
    res.status(500).send('Authentication failed.');
  }
});

// Route to handle logout
router.get('/logout', (req, res) => {
  console.log('🚪 Logout requested');
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Failed to logout.');
    }
    console.log('🗑️ Session destroyed successfully');
    res.redirect('/');
  });
});

module.exports = router;
