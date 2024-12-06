// db.js
const { Pool } = require('pg');

// Create a new pool instance to manage PostgreSQL connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for some managed databases
  }
});

// Initialize the database tables if they don't exist
const initializeDB = async () => {
  try {
    // Create 'users' table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT,
        name TEXT,
        picture TEXT,
        age_range TEXT,
        language_preferences TEXT,
        addresses JSONB,
        birthday DATE,
        gender TEXT,
        organization TEXT,
        phone_numbers JSONB,
        tokens JSONB
      );
    `);
    console.log("Users table is ready!");

    // Create 'contacts' table (for contacts scopes)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        name TEXT,
        email TEXT,
        phone TEXT
      );
    `);
    console.log("Contacts table is ready!");

    // Create 'youtube_videos' table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS youtube_videos (
        video_id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id),
        title TEXT,
        thumbnail_url TEXT,
        published_at TIMESTAMP
      );
    `);
    console.log("YouTube Videos table is ready!");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

// Initialize the database
initializeDB();

module.exports = { pool };
