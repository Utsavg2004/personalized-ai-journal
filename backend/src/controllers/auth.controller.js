import { supabaseAdmin } from '../config/supabase.js';
import { BadRequestError, UnauthorizedError } from '../utils/errors.js';

export const registerHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!supabaseAdmin) {
      return res.status(201).json({
        user: { id: 'mock-user-id', email },
        session: { accessToken: 'mock_at_token', refreshToken: 'mock_rt_token' },
      });
    }

    const { data, error } = await supabaseAdmin.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new BadRequestError(error.message);
    }

    const user = data.user;
    const session = data.session;

    res.status(201).json({
      user: {
        id: user?.id,
        email: user?.email,
      },
      session: session
        ? {
            accessToken: session.access_token || session.accessToken,
            refreshToken: session.refresh_token || session.refreshToken,
            expiresIn: session.expires_in || session.expiresIn,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
};

export const loginHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!supabaseAdmin) {
      return res.status(200).json({
        user: { id: 'mock-user-id', email },
        session: { accessToken: 'mock_at_token', refreshToken: 'mock_rt_token' },
      });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session) {
      throw new BadRequestError(error?.message || 'Invalid credentials');
    }

    const user = data.user;
    const session = data.session;

    res.status(200).json({
      user: {
        id: user?.id,
        email: user?.email,
      },
      session: {
        accessToken: session.access_token || session.accessToken,
        refreshToken: session.refresh_token || session.refreshToken,
        expiresIn: session.expires_in || session.expiresIn,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const logoutHandler = async (req, res, next) => {
  try {
    if (supabaseAdmin) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        await supabaseAdmin.auth.admin?.signOut?.(token);
      }
    }
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

export const meHandler = async (req, res, next) => {
  try {
    res.status(200).json({ user: req.user });
  } catch (err) {
    next(err);
  }
};
