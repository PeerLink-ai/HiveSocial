// auth.js
const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('./db');
const axios = require('axios');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// Initialize the OAuth2 client
const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Define the scopes you need
const scopes = [
  // Non-sensitive scopes
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/user.birthday.read',
  'https://www.googleapis.com/auth/user.gender.read',
  'https://www.googleapis.com/auth/user.organization.read',
  'https://www.googleapis.com/auth/user.phonenumbers.read',
  'https://www.googleapis.com/auth/user.addresses.read',
  'https://www.googleapis.com/auth/user.profile.agerange.read',
  'https://www.googleapis.com/auth/user.profile.language.read',

  // Sensitive scopes
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtubepartner',
  'https://www.googleapis.com/auth/youtubepartner-channel-audit'
];

// Route to initiate OAuth flow
router.get('/google', (req, res) => {
  const url = client.generateAuthUrl({
    access_type: 'offline', // Request refresh token
    scope: scopes,
    prompt: 'consent' // Force consent screen to get refresh token every time
  });
  res.redirect(url);
});

// Route to handle OAuth callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('No code provided.');
  }

  try {
    // Exchange the authorization code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Fetch basic user info
    const userInfoResp = await client.request({
      url: 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json'
    });
    const userData = userInfoResp.data;
    const userId = userData.id;

    // Fetch additional user data based on scopes

    // 1. Age Range and Language Preferences (assuming using People API)
    const peopleResp = await client.request({
      url: 'https://people.googleapis.com/v1/people/me?personFields=ageRange,languageCodes,address,birthdays,genders,organizations,phoneNumbers'
    });
    const peopleData = peopleResp.data;

    // Extract additional data
    const ageRange = peopleData.ageRange || null;
    const languagePreferences = peopleData.languageCodes ? peopleData.languageCodes.join(', ') : null;
    const addresses = peopleData.addresses || [];
    const birthday = peopleData.birthdays && peopleData.birthdays.length > 0 ? new Date(peopleData.birthdays[0].date.year, peopleData.birthdays[0].date.month - 1, peopleData.birthdays[0].date.day) : null;
    const gender = peopleData.genders && peopleData.genders.length > 0 ? peopleData.genders[0].value : null;
    const organization = peopleData.organizations && peopleData.organizations.length > 0 ? peopleData.organizations[0].name : null;
    const phoneNumbers = peopleData.phoneNumbers || [];

    // 2. Contacts
    let contacts = [];
    if (scopes.includes('https://www.googleapis.com/auth/contacts.readonly') || scopes.includes('https://www.googleapis.com/auth/contacts')) {
      const contactsResp = await client.request({
        url: 'https://people.googleapis.com/v1/people/me/connections',
        params: {
          personFields: 'names,emailAddresses,phoneNumbers'
        }
      });
      contacts = contactsResp.data.connections || [];
    }

    // 3. YouTube Data
    let youtubeVideos = [];
    if (scopes.some(scope => scope.includes('youtube'))) {
      const youtubeResp = await client.request({
        url: 'https://www.googleapis.com/youtube/v3/search',
        params: {
          part: 'snippet',
          mine: true,
          maxResults: 50,
          type: 'video'
        }
      });
      youtubeVideos = youtubeResp.data.items || [];
    }

    // Insert or update the user in Postgres
    const queryText = `
      INSERT INTO users (id, email, name, picture, age_range, language_preferences, addresses, birthday, gender, organization, phone_numbers, tokens)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        picture = EXCLUDED.picture,
        age_range = EXCLUDED.age_range,
        language_preferences = EXCLUDED.language_preferences,
        addresses = EXCLUDED.addresses,
        birthday = EXCLUDED.birthday,
        gender = EXCLUDED.gender,
        organization = EXCLUDED.organization,
        phone_numbers = EXCLUDED.phone_numbers,
        tokens = EXCLUDED.tokens
    `;
    const values = [
      userId,
      userData.email,
      userData.name,
      userData.picture,
      ageRange,
      languagePreferences,
      JSON.stringify(addresses),
      birthday,
      gender,
      organization,
      JSON.stringify(phoneNumbers),
      JSON.stringify(tokens)
    ];
    await pool.query(queryText, values);

    // Insert contacts into 'contacts' table
    if (contacts.length > 0) {
      for (const contact of contacts) {
        const contactName = contact.names && contact.names.length > 0 ? contact.names[0].displayName : null;
        const contactEmail = contact.emailAddresses && contact.emailAddresses.length > 0 ? contact.emailAddresses[0].value : null;
        const contactPhone = contact.phoneNumbers && contact.phoneNumbers.length > 0 ? contact.phoneNumbers[0].value : null;

        if (contactName || contactEmail || contactPhone) {
          const contactQuery = `
            INSERT INTO contacts (user_id, name, email, phone)
            VALUES ($1, $2, $3, $4)
          `;
          const contactValues = [userId, contactName, contactEmail, contactPhone];
          await pool.query(contactQuery, contactValues);
        }
      }
    }

    // Insert YouTube videos into 'youtube_videos' table
    if (youtubeVideos.length > 0) {
      for (const video of youtubeVideos) {
        const videoId = video.id.videoId;
        const title = video.snippet.title;
        const thumbnailUrl = video.snippet.thumbnails.default.url;
        const publishedAt = video.snippet.publishedAt;

        const videoQuery = `
          INSERT INTO youtube_videos (video_id, user_id, title, thumbnail_url, published_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (video_id) DO UPDATE SET
            title = EXCLUDED.title,
            thumbnail_url = EXCLUDED.thumbnail_url,
            published_at = EXCLUDED.published_at
        `;
        const videoValues = [videoId, userId, title, thumbnailUrl, publishedAt];
        await pool.query(videoQuery, videoValues);
      }
    }

    // Respond to the user with a success message and link to dashboard
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).send('Authentication failed.');
  }
});

module.exports = router;
