// index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const authRoutes = require('./auth');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files from the 'views' directory
app.use(express.static(path.join(__dirname, 'views')));

// Use auth routes for '/auth' path
app.use('/auth', authRoutes);

// Handle the root path and OAuth callback
app.get('/auth/google/callback', (req, res) => {
  // This route is handled in auth.js
});

// Dashboard route
app.get('/dashboard', async (req, res) => {
  // For simplicity, this example doesn't handle sessions or authentication checks.
  // In a real app, you'd verify the user's session or JWT.
  
  // Fetch user data from the database.
  // Here, we'll assume the user ID is known. In practice, retrieve it from the session.
  const userId = req.query.userId; // Placeholder: Replace with actual user identification

  if (!userId) {
    return res.status(400).send('User not identified.');
  }

  try {
    // Fetch user information
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).send('User not found.');
    }

    // Fetch user's YouTube videos
    const videosRes = await pool.query('SELECT * FROM youtube_videos WHERE user_id = $1', [userId]);
    const videos = videosRes.rows;

    // Fetch user's contacts
    const contactsRes = await pool.query('SELECT * FROM contacts WHERE user_id = $1', [userId]);
    const contacts = contactsRes.rows;

    // Render the dashboard with user data
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dashboard - Hive Social</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: auto;
            background-color: #fff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          h1, h2 {
            text-align: center;
          }
          .section {
            margin-bottom: 30px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 10px;
            border: 1px solid #ddd;
            text-align: left;
          }
          th {
            background-color: #f4f4f4;
          }
          img {
            max-width: 100px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Welcome, ${user.name}</h1>
          <p>Email: ${user.email}</p>
          <img src="${user.picture}" alt="Profile Picture" />

          <div class="section">
            <h2>Your YouTube Videos</h2>
            ${videos.length > 0 ? `
              <table>
                <tr>
                  <th>Title</th>
                  <th>Thumbnail</th>
                  <th>Published At</th>
                </tr>
                ${videos.map(video => `
                  <tr>
                    <td>${video.title}</td>
                    <td><img src="${video.thumbnail_url}" alt="Thumbnail" /></td>
                    <td>${new Date(video.published_at).toLocaleDateString()}</td>
                  </tr>
                `).join('')}
              </table>
            ` : `<p>No YouTube videos found.</p>`}
          </div>

          <div class="section">
            <h2>Your Contacts</h2>
            ${contacts.length > 0 ? `
              <table>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
                ${contacts.map(contact => `
                  <tr>
                    <td>${contact.name || 'N/A'}</td>
                    <td>${contact.email || 'N/A'}</td>
                    <td>${contact.phone || 'N/A'}</td>
                  </tr>
                `).join('')}
              </table>
            ` : `<p>No contacts found.</p>`}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).send('Error loading dashboard.');
  }
});

// Handle other routes
app.get('*', (req, res) => {
  res.status(404).send('Page not found.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
