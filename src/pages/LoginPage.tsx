import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // If already logged in, redirect to home
    if (localStorage.getItem('accessToken')) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 4) {
      newErrors.password = 'Password must be at least 4 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    if (!validate()) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setServerError(result.error?.message || 'Login failed. Please try again.');
      } else {
        // Success: Store access & refresh token
        const { accessToken, refreshToken, user } = result.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Redirect to Home page
        navigate('/', { replace: true });
      }
    } catch (err) {
      setServerError('Unable to connect to the server. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = () => {
    // Redirect to 42 OAuth endpoint in backend
    window.location.href = '/api/auth/42';
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Welcome Back</h1>
        <p>Login to your Transcendence account</p>
      </div>

      {serverError && <div className="alert-error">{serverError}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
          {errors.email && <div className="form-error">{errors.email}</div>}
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {errors.password && <div className="form-error">{errors.password}</div>}
        </div>

        <button type="submit" className="btn-primary" disabled={isLoading}>
          {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>

      <div className="divider">or continue with</div>

      <button type="button" className="btn-oauth" onClick={handleOAuthLogin}>
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M0 0h24v24H0z" fill="none"/>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        Sign in with 42
      </button>

      <div className="auth-footer">
        Don't have an account?
        <Link to="/signup" className="auth-link">Sign up</Link>
      </div>
    </div>
  );
}
