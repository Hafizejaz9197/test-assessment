/**
 * Optional password protection for the whole app (HTTP Basic Auth).
 * Active only when APP_PASSWORD is set. The browser shows its own login box;
 * any username works – only the password is checked.
 */
const crypto = require('crypto');
const config = require('../config');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** Compare in constant time so the password can't be guessed by timing. */
function passwordMatches(given) {
  return crypto.timingSafeEqual(sha256(given), sha256(config.appPassword));
}

function requirePassword(req, res, next) {
  if (!config.appPassword) return next();
  if (req.path === '/api/health') return next(); // lets the host check the app is up

  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    if (passwordMatches(password)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="PaperCheck", charset="UTF-8"');
  res.status(401).send('Password required. Any username works; enter the PaperCheck password.');
}

module.exports = { requirePassword };
