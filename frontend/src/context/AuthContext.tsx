import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserSummary, LoginCredentials, AuthContextValue } from '../types/auth';
import { fetchCurrentUser, loginUser, logoutUser } from '../services/auth';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      setError(null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (credentials: LoginCredentials): Promise<UserSummary> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await loginUser(credentials);
      setUser(response.user);
      setIsLoading(false);
      return response.user;
    } catch (err: any) {
      const message = err.message || 'Login failed. Please check your credentials.';
      setError(message);
      setIsLoading(false);
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await logoutUser();
    } catch (err) {
      // Continue client logout even if backend returns error
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setError(null);
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  const value: AuthContextValue = {
    user,
    role: user?.role || null,
    isAuthenticated: Boolean(user),
    isLoading,
    error,
    login,
    logout,
    refreshUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
