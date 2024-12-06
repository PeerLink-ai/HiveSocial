// index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const authRoutes = require('./auth');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-key', // Use a strong secret in production
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true } // Ensure HTTPS in production
}));

// Middleware to log incoming requests
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
    console.log(`Fetching user data for userId: ${req.session.userId}`);
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
      if (result.rows.length > 0) {
        req.user = result.rows[0];
        console.log(`User data retrieved: ${req.user.name} (${req.user.email})`);
      } else {
        console.warn(`No user found with id: ${req.session.userId}`);
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
    console.warn('Unauthorized access to dashboard');
    return res.redirect('/');
  }

  console.log(`Rendering dashboard for user: ${req.user.name} (${req.user.email})`);

  try {
    // Fetch YouTube videos for the user
    const videosResult = await pool.query('SELECT * FROM youtube_videos WHERE user_id = $1', [req.user.id]);
    const videos = videosResult.rows;
    console.log(`Fetched ${videos.length} YouTube videos for userId: ${req.user.id}`);

    // Fetch contacts for the user
    const contactsResult = await pool.query('SELECT * FROM contacts WHERE user_id = $1', [req.user.id]);
    const contacts = contactsResult.rows;
    console.log(`Fetched ${contacts.length} contacts for userId: ${req.user.id}`);

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
    console.error('Error rendering dashboard:', error);
    res.status(500).send('Failed to load dashboard.');
  }
});

// Home route (landing page)
app.get('/', (req, res) => {
  console.log('Serving landing page');
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Handle undefined routes
app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).send('Page not found.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
