// src/utils/token.js
const crypto = require('crypto');

function generateTokenRaw(size = 48) {
  return crypto.randomBytes(size).toString('base64url'); // url-safe
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { generateTokenRaw, hashToken };
