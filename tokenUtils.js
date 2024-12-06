// tokenUtils.js
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('./db');

// Load environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);

// Function to refresh access token
const refreshAccessToken = async (userId) => {
  try {
    // Retrieve the user's refresh token from the database
    const result = await pool.query('SELECT tokens FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const tokens = result.rows[0].tokens;
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      throw new Error('No refresh token available for user');
    }

    // Set credentials with refresh token
    client.setCredentials({ refresh_token: refreshToken });

    // Refresh the access token
    const refreshedTokens = await client.refreshAccessToken();
    const newAccessToken = refreshedTokens.credentials.access_token;
    const newRefreshToken = refreshedTokens.credentials.refresh_token || refreshToken; // Google may not return a new refresh token

    console.log('Access token refreshed successfully');

    // Update the tokens in the database
    const updatedTokens = {
      access_token: newAccessToken,
      refresh_token: newRefreshToken
      // You can include other tokens like id_token, scope, etc., if needed
    };

    await pool.query(
      'UPDATE users SET tokens = $1 WHERE id = $2',
      [JSON.stringify(updatedTokens), userId]
    );

    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error.message);
    throw error;
  }
};

module.exports = { refreshAccessToken };
