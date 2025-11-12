import { validationResult } from 'express-validator';

import type { Request, Response, NextFunction } from 'express';

const validationError = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'Validation Error',
      errors: errors.mapped(),
    });
    return;
  }

  next();
};

export default validationError;
