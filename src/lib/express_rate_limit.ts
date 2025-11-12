import { rateLimit } from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 60, // Limit each IP to 60 requests per windowMs
  standardHeaders: 'draft-8',
  legacyHeaders: false, // Disable deprecated X-RateLimit headers
  message: {
    error: 'Too many requests, please try again later.',
  },
});

export default limiter;
