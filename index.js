require('dotenv').config();
const express = require('express');
const path = require('path');
const authRoutes = require('./auth');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files (front-end)
app.use(express.static(path.join(__dirname, 'views')));

// Auth routes
app.use('/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
