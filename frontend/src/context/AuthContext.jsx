import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = () => {
    try {
      api.post('/auth/logout', {}).catch(() => {});
    } catch {
      // ignore
    }
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  // Initialize auth state
  useEffect(() => {
    const fetchUser = async () => {
      if (token) {
        try {
          const res = await api.get('/auth/me');
          if (res?.user) {
            setUser(res.user);
          } else {
            setUser({ id: 'authenticated-user' });
          }
        } catch (error) {
          console.error('Failed to restore session:', error);
          logout();
        }
      }
      setIsLoading(false);
    };

    fetchUser();
  }, [token]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const accessToken = res.session?.accessToken || res.session?.access_token;
    if (accessToken) {
      localStorage.setItem('token', accessToken);
      setToken(accessToken);
    }
    setUser(res.user);
    return res;
  };

  // Deliberately does NOT persist a token/session here: registering an
  // account should not sign the user in. They land back on /login and must
  // authenticate explicitly with the credentials they just created.
  const register = async (email, password) => {
    const res = await api.post('/auth/register', { email, password });
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
