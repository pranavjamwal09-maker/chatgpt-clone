const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey123');
    const extractedUserId = decoded.userId || decoded.id || decoded._id;

    if (!extractedUserId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.user = {
      id: extractedUserId,
      userId: extractedUserId,
      _id: extractedUserId
    };

    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};