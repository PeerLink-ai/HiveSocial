// auth.js
const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const { pool } = require('./db');

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
  'https://www.googleapis.com/auth/profile.language.read',
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

    // Fetch user information from Google
    const userInfoResp = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
    const userData = userInfoResp.data;
    const userId = userData.id;

    // Fetch additional user data if needed, e.g., birthday, gender, organization, phone numbers, addresses, etc.
    let additionalData = {};

    // Fetch birthday
    if (scopes.includes('https://www.googleapis.com/auth/user.birthday.read')) {
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
    }

    // Fetch gender
    if (scopes.includes('https://www.googleapis.com/auth/user.gender.read')) {
      const genderResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=genders', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const genders = genderResp.data.genders;
      if (genders && genders.length > 0) {
        additionalData.gender = genders[0].value;
      }
    }

    // Fetch organization
    if (scopes.includes('https://www.googleapis.com/auth/user.organization.read')) {
      const orgResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=organizations', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const organizations = orgResp.data.organizations;
      if (organizations && organizations.length > 0) {
        additionalData.organization = organizations[0].name;
      }
    }

    // Fetch phone numbers
    if (scopes.includes('https://www.googleapis.com/auth/user.phonenumbers.read')) {
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
    }

    // Fetch addresses
    if (scopes.includes('https://www.googleapis.com/auth/user.addresses.read')) {
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
    }

    // Fetch age range
    if (scopes.includes('https://www.googleapis.com/auth/profile.agerange.read')) {
      const ageRangeResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=ageRanges', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const ageRanges = ageRangeResp.data.ageRanges;
      if (ageRanges && ageRanges.length > 0) {
        additionalData.age_range = ageRanges[0].value;
      }
    }

    // Fetch language preferences
    if (scopes.includes('https://www.googleapis.com/auth/profile.language.read')) {
      const languageResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=languageSpoken', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const languages = languageResp.data.languageSpoken;
      if (languages && languages.length > 0) {
        additionalData.language_preferences = languages.map(lang => lang.languageCode);
      }
    }

    // Fetch contacts (requires sensitive scopes)
    if (scopes.includes('https://www.googleapis.com/auth/contacts')) {
      const contactsResp = await axios.get('https://people.googleapis.com/v1/people/me/connections', {
        params: {
          personFields: 'names,emailAddresses,phoneNumbers'
        },
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const connections = contactsResp.data.connections;
      if (connections && connections.length > 0) {
        additionalData.contacts = connections.map(contact => ({
          name: contact.names ? contact.names[0].displayName : null,
          email: contact.emailAddresses ? contact.emailAddresses[0].value : null,
          phone: contact.phoneNumbers ? contact.phoneNumbers[0].value : null
        }));
      }
    }

    // Fetch YouTube videos (requires YouTube scopes)
    let youtubeVideos = [];
    if (scopes.includes('https://www.googleapis.com/auth/youtube.readonly') || scopes.includes('https://www.googleapis.com/auth/youtube.force-ssl')) {
      const youtubeResp = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'snippet,contentDetails,statistics',
          myRating: 'like', // Example parameter, adjust as needed
          maxResults: 10
        },
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      youtubeVideos = youtubeResp.data.items;
    }

    // Insert or update the user in Postgres
    const queryText = `
      INSERT INTO users (
        id, email, name, picture, age_range, language_preferences,
        addresses, birthday, gender, organization, phone_numbers, tokens
      )
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
        tokens = EXCLUDED.tokens;
    `;
    const values = [
      userId,
      userData.email,
      userData.name,
      userData.picture,
      additionalData.age_range || null,
      additionalData.language_preferences ? JSON.stringify(additionalData.language_preferences) : null,
      additionalData.addresses ? JSON.stringify(additionalData.addresses) : null,
      additionalData.birthday || null,
      additionalData.gender || null,
      additionalData.organization || null,
      additionalData.phone_numbers ? JSON.stringify(additionalData.phone_numbers) : null,
      JSON.stringify(tokens)
    ];
    await pool.query(queryText, values);

    // Insert contacts into the database
    if (additionalData.contacts && additionalData.contacts.length > 0) {
      const insertContactQuery = `
        INSERT INTO contacts (user_id, name, email, phone)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING;
      `;
      for (const contact of additionalData.contacts) {
        if (contact.name || contact.email || contact.phone) {
          await pool.query(insertContactQuery, [userId, contact.name, contact.email, contact.phone]);
        }
      }
    }

    // Insert YouTube videos into the database
    if (youtubeVideos.length > 0) {
      const insertVideoQuery = `
        INSERT INTO youtube_videos (video_id, user_id, title, thumbnail_url, published_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (video_id) DO UPDATE SET
          title = EXCLUDED.title,
          thumbnail_url = EXCLUDED.thumbnail_url,
          published_at = EXCLUDED.published_at;
      `;
      for (const video of youtubeVideos) {
        const videoId = video.id;
        const title = video.snippet.title;
        const thumbnailUrl = video.snippet.thumbnails.default.url;
        const publishedAt = video.snippet.publishedAt;
        await pool.query(insertVideoQuery, [videoId, userId, title, thumbnailUrl, publishedAt]);
      }
    }

    // Save user ID in session
    req.session.userId = userId;

    // Redirect to dashboard after successful sign-in
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).send('Authentication failed.');
  }
});

// Route to handle logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Failed to logout.');
    }
    res.redirect('/');
  });
});

module.exports = router;
