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

// Define the scopes you need (Removed language preferences scope)
const scopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/user.birthday.read',
  'https://www.googleapis.com/auth/user.gender.read',
  'https://www.googleapis.com/auth/user.organization.read',
  'https://www.googleapis.com/auth/user.phonenumbers.read',
  'https://www.googleapis.com/auth/user.addresses.read',
  'https://www.googleapis.com/auth/profile.agerange.read',
  // Removed: 'https://www.googleapis.com/auth/profile.language.read',
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
  console.log('Initiating Google OAuth flow');
  const url = client.generateAuthUrl({
    access_type: 'offline', // Request refresh token
    scope: scopes,
    prompt: 'consent' // Force consent screen to get refresh token every time
  });
  console.log(`Redirecting to Google OAuth URL: ${url}`);
  res.redirect(url);
});

// Route to handle OAuth callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;
  console.log('Received OAuth callback');
  console.log(`Server Time: ${new Date().toISOString()}`); // Log server time

  if (!code) {
    console.error('No authorization code provided in callback.');
    return res.status(400).send('No code provided.');
  }

  console.log(`Authorization code received: ${code}`);

  try {
    // Exchange the authorization code for tokens
    console.log('Exchanging authorization code for tokens');
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    console.log('Tokens obtained and set in OAuth2 client');

    // Check if refresh token is present
    if (tokens.refresh_token) {
      console.log('Refresh token obtained');
    } else {
      console.warn('No refresh token obtained. It might have been previously granted.');
    }

    // Fetch user information from Google
    console.log('Fetching user information from Google');
    const userInfoResp = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
    const userData = userInfoResp.data;
    const userId = userData.id;
    console.log(`User data fetched: ${JSON.stringify(userData)}`);

    // Fetch additional user data if needed
    let additionalData = {};

    // Fetch birthday
    if (scopes.includes('https://www.googleapis.com/auth/user.birthday.read')) {
      console.log('Fetching user birthday');
      const birthdayResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=birthdays', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const birthdays = birthdayResp.data.birthdays;
      console.log(`Birthday response: ${JSON.stringify(birthdays)}`);
      if (birthdays && birthdays.length > 0) {
        const birthday = birthdays[0].date;
        if (birthday) {
          additionalData.birthday = `${birthday.year}-${birthday.month}-${birthday.day}`;
          console.log(`Birthday set to: ${additionalData.birthday}`);
        }
      }
    }

    // Fetch gender
    if (scopes.includes('https://www.googleapis.com/auth/user.gender.read')) {
      console.log('Fetching user gender');
      const genderResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=genders', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const genders = genderResp.data.genders;
      console.log(`Gender response: ${JSON.stringify(genders)}`);
      if (genders && genders.length > 0) {
        additionalData.gender = genders[0].value;
        console.log(`Gender set to: ${additionalData.gender}`);
      }
    }

    // Fetch organization
    if (scopes.includes('https://www.googleapis.com/auth/user.organization.read')) {
      console.log('Fetching user organization');
      const orgResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=organizations', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const organizations = orgResp.data.organizations;
      console.log(`Organization response: ${JSON.stringify(organizations)}`);
      if (organizations && organizations.length > 0) {
        additionalData.organization = organizations[0].name;
        console.log(`Organization set to: ${additionalData.organization}`);
      }
    }

    // Fetch phone numbers
    if (scopes.includes('https://www.googleapis.com/auth/user.phonenumbers.read')) {
      console.log('Fetching user phone numbers');
      const phonesResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=phoneNumbers', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const phoneNumbers = phonesResp.data.phoneNumbers;
      console.log(`Phone numbers response: ${JSON.stringify(phoneNumbers)}`);
      if (phoneNumbers && phoneNumbers.length > 0) {
        additionalData.phone_numbers = phoneNumbers.map(phone => ({
          type: phone.type,
          number: phone.value
        }));
        console.log(`Phone numbers set to: ${JSON.stringify(additionalData.phone_numbers)}`);
      }
    }

    // Fetch addresses
    if (scopes.includes('https://www.googleapis.com/auth/user.addresses.read')) {
      console.log('Fetching user addresses');
      const addressesResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=addresses', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const addresses = addressesResp.data.addresses;
      console.log(`Addresses response: ${JSON.stringify(addresses)}`);
      if (addresses && addresses.length > 0) {
        additionalData.addresses = addresses.map(address => ({
          type: address.type,
          formatted: address.formattedValue
        }));
        console.log(`Addresses set to: ${JSON.stringify(additionalData.addresses)}`);
      }
    }

    // Fetch age range
    if (scopes.includes('https://www.googleapis.com/auth/profile.agerange.read')) {
      console.log('Fetching user age range');
      const ageRangeResp = await axios.get('https://people.googleapis.com/v1/people/me?personFields=ageRanges', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const ageRanges = ageRangeResp.data.ageRanges;
      console.log(`Age ranges response: ${JSON.stringify(ageRanges)}`);
      if (ageRanges && ageRanges.length > 0) {
        additionalData.age_range = ageRanges[0].value;
        console.log(`Age range set to: ${additionalData.age_range}`);
      }
    }

    // Fetch contacts (requires sensitive scopes)
    if (scopes.includes('https://www.googleapis.com/auth/contacts')) {
      console.log('Fetching user contacts');
      const contactsResp = await axios.get('https://people.googleapis.com/v1/people/me/connections', {
        params: {
          personFields: 'names,emailAddresses,phoneNumbers'
        },
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const connections = contactsResp.data.connections;
      console.log(`Contacts response: ${JSON.stringify(connections)}`);
      if (connections && connections.length > 0) {
        additionalData.contacts = connections.map(contact => ({
          name: contact.names ? contact.names[0].displayName : null,
          email: contact.emailAddresses ? contact.emailAddresses[0].value : null,
          phone: contact.phoneNumbers ? contact.phoneNumbers[0].value : null
        }));
        console.log(`Contacts set to: ${JSON.stringify(additionalData.contacts)}`);
      }
    }

    // Fetch YouTube videos (requires YouTube scopes)
    let youtubeVideos = [];
    if (
      scopes.includes('https://www.googleapis.com/auth/youtube.readonly') ||
      scopes.includes('https://www.googleapis.com/auth/youtube.force-ssl')
    ) {
      console.log('Fetching user YouTube videos');
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
      console.log(`YouTube videos fetched: ${JSON.stringify(youtubeVideos)}`);
    }

    // Insert or update the user in Postgres
    console.log('Inserting/updating user data in the database');
    const queryText = `
      INSERT INTO users (
        id, email, name, picture, age_range,
        addresses, birthday, gender, organization, phone_numbers, tokens
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        picture = EXCLUDED.picture,
        age_range = EXCLUDED.age_range,
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
      additionalData.addresses ? JSON.stringify(additionalData.addresses) : null,
      additionalData.birthday || null,
      additionalData.gender || null,
      additionalData.organization || null,
      additionalData.phone_numbers ? JSON.stringify(additionalData.phone_numbers) : null,
      JSON.stringify(tokens)
    ];
    console.log(`Executing query with values: ${JSON.stringify(values)}`);
    await pool.query(queryText, values);
    console.log('User data inserted/updated successfully');

    // Insert contacts into the database
    if (additionalData.contacts && additionalData.contacts.length > 0) {
      console.log('Inserting user contacts into the database');
      const insertContactQuery = `
        INSERT INTO contacts (user_id, name, email, phone)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING;
      `;
      for (const contact of additionalData.contacts) {
        if (contact.name || contact.email || contact.phone) {
          console.log(`Inserting contact: ${JSON.stringify(contact)}`);
          await pool.query(insertContactQuery, [userId, contact.name, contact.email, contact.phone]);
        }
      }
      console.log('User contacts inserted successfully');
    }

    // Insert YouTube videos into the database
    if (youtubeVideos.length > 0) {
      console.log('Inserting YouTube videos into the database');
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
        console.log(`Inserting YouTube video: ${videoId} - ${title}`);
        await pool.query(insertVideoQuery, [videoId, userId, title, thumbnailUrl, publishedAt]);
      }
      console.log('YouTube videos inserted successfully');
    }

    // Save user ID in session
    console.log(`Saving user ID ${userId} in session`);
    req.session.userId = userId;

    // Redirect to dashboard after successful sign-in
    console.log('Redirecting user to dashboard');
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error during OAuth callback:', error.response ? error.response.data : error.message);
    res.status(500).send('Authentication failed.');
  }
});

// Route to handle logout
router.get('/logout', (req, res) => {
  console.log('Logout requested');
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Failed to logout.');
    }
    console.log('Session destroyed successfully');
    res.redirect('/');
  });
});

module.exports = router;
