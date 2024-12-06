// index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const authRoutes = require('./auth');
const { pool } = require('./db');
const { refreshAccessToken } = require('./tokenUtils');

const app = express();
const PORT = process.env.PORT || 8080;

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-key', // Use a strong secret in production
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' } // Ensure HTTPS in production
}));

// Middleware for logging each request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files from the 'views' directory
app.use(express.static(path.join(__dirname, 'views')));

// Use auth routes for '/auth' path
app.use('/auth', authRoutes);

// Middleware to attach user to request if logged in
app.use(async (req, res, next) => {
  if (req.session.userId) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        
        // Here, you might want to check if the access token is expired.
        // For simplicity, we'll assume it's valid and proceed. Implement token expiration checks as needed.
        
        req.user = user;
        console.log(`User attached to request: ${req.user.name}`);
      }
    } catch (error) {
      console.error('Error fetching user from database:', error);
    }
  }
  next();
});

// Dashboard route
app.get('/dashboard', async (req, res) => {
  if (!req.user) {
    console.warn('Unauthenticated access to dashboard. Redirecting to home.');
    return res.redirect('/');
  }

  console.log(`Rendering dashboard for user: ${req.user.name}`);

  try {
    // Refresh the access token if needed
    // For demonstration, we'll assume the token might be expired and attempt to refresh it
    const newAccessToken = await refreshAccessToken(req.user.id);
    console.log(`New access token: ${newAccessToken}`);

    // Now, proceed with fetching data using the new access token
    // For example, fetch YouTube videos using the new access token
    // You can reuse the logic from the `auth.js` if needed

    // Fetch YouTube videos for the user
    console.log('Fetching YouTube videos from database');
    const videosResult = await pool.query('SELECT * FROM youtube_videos WHERE user_id = $1', [req.user.id]);
    const videos = videosResult.rows;
    console.log(`YouTube videos fetched: ${videos.length}`);

    // Fetch contacts for the user
    console.log('Fetching contacts from database');
    const contactsResult = await pool.query('SELECT * FROM contacts WHERE user_id = $1', [req.user.id]);
    const contacts = contactsResult.rows;
    console.log(`Contacts fetched: ${contacts.length}`);

    // Render a simple dashboard
    let videoList = '<ul>';
    videos.forEach(video => {
      videoList += `<li>${video.title} - <img src="${video.thumbnail_url}" alt="Thumbnail"></li>`;
    });
    videoList += '</ul>';

    let contactList = '<ul>';
    contacts.forEach(contact => {
      contactList += `<li>${contact.name || 'No Name'} - ${contact.email || 'No Email'} - ${contact.phone || 'No Phone'}</li>`;
    });
    contactList += '</ul>';

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dashboard - Hive Social</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
            color: #333;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: auto;
            background-color: #fff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 {
            text-align: center;
          }
          h2 {
            color: #555;
          }
          ul {
            list-style-type: none;
            padding: 0;
          }
          li {
            padding: 10px;
            border-bottom: 1px solid #ddd;
          }
          img {
            width: 100px;
            height: auto;
          }
          .logout {
            display: block;
            text-align: center;
            margin-top: 20px;
            padding: 10px 20px;
            background-color: #4285F4;
            color: #fff;
            text-decoration: none;
            border-radius: 4px;
          }
          .logout:hover {
            background-color: #357AE8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Your Dashboard</h1>
          <h2>Welcome, ${req.user.name}!</h2>
          <h3>Your YouTube Videos</h3>
          ${videos.length > 0 ? videoList : '<p>No videos found.</p>'}
          <h3>Your Contacts</h3>
          ${contacts.length > 0 ? contactList : '<p>No contacts found.</p>'}
          <a href="/auth/logout" class="logout">Logout</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering dashboard:', error.message);
    res.status(500).send('Failed to load dashboard.');
  }
});

// Server time endpoint
app.get('/server-time', (req, res) => {
  const serverTime = new Date().toISOString();
  console.log(`Server Time Endpoint Accessed: ${serverTime}`);
  res.send(`Server Time: ${serverTime}`);
});

// Home route (landing page)
app.get('/', (req, res) => {
  console.log('Serving landing page');
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Handle undefined routes
app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).send('Page not found');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
