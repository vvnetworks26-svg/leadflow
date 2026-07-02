import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';

/**
 * POST /api/v1/auth/register
 * Body: { firstName, lastName, email, password }
 * Role is always set to 'owner' — not configurable by the client.
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await AuthService.register(req.body, req);
    res.status(201).json({
      status: 'ok',
      data: { user: result.user, tokens: result.tokens },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await AuthService.login(req.body, req);
    res.status(200).json({
      status: 'ok',
      data: { user: result.user, tokens: result.tokens },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 * Body: { refreshToken }
 * No access token required — works even when the access token has expired.
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ status: 'error', code: 'MISSING_REFRESH_TOKEN', message: 'refreshToken is required' });
      return;
    }
    await AuthService.logout(refreshToken, req);
    res.status(200).json({ status: 'ok', message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/refresh
 * Body: { refreshToken }
 */
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ status: 'error', code: 'MISSING_REFRESH_TOKEN', message: 'refreshToken is required' });
      return;
    }
    const tokens = await AuthService.refresh(refreshToken, req);
    res.status(200).json({ status: 'ok', data: { tokens } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/auth/me
 * Requires: Bearer access token
 */
export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await AuthService.me(req.user!.sub);
    res.status(200).json({ status: 'ok', data: { user } });
  } catch (err) {
    next(err);
  }
}
