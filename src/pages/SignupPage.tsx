import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<{
    email?: string;
    nickname?: string;
    password?: string;
    passwordConfirm?: string;
  }>({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const validate = () => {
    const newErrors: typeof errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const nicknameRegex = /^[a-zA-Z0-9_-]+$/;

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!nickname) {
      newErrors.nickname = 'Nickname is required';
    } else if (nickname.length < 3 || nickname.length > 20) {
      newErrors.nickname = 'Nickname must be between 3 and 20 characters';
    } else if (!nicknameRegex.test(nickname)) {
      newErrors.nickname = 'Nickname can only contain alphanumeric characters, underscores, and hyphens';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long';
    }

    if (!passwordConfirm) {
      newErrors.passwordConfirm = 'Please confirm your password';
    } else if (passwordConfirm !== password) {
      newErrors.passwordConfirm = 'Passwords do not match';
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
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, nickname, password }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setServerError(result.error?.message || 'Registration failed. Nickname or Email may already exist.');
      } else {
        // Success: Redirect to login page
        navigate('/login', { state: { signupSuccess: true } });
      }
    } catch (err) {
      setServerError('Unable to connect to the server. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Create Account</h1>
        <p>Get started with Transcendence today</p>
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
          <label htmlFor="nickname">Nickname</label>
          <input
            id="nickname"
            type="text"
            className="form-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="cyber_ponger"
          />
          {errors.nickname && <div className="form-error">{errors.nickname}</div>}
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

        <div className="form-group">
          <label htmlFor="passwordConfirm">Confirm Password</label>
          <input
            id="passwordConfirm"
            type="password"
            className="form-input"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="••••••••"
          />
          {errors.passwordConfirm && <div className="form-error">{errors.passwordConfirm}</div>}
        </div>

        <button type="submit" className="btn-primary" disabled={isLoading}>
          {isLoading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>

      <div className="auth-footer">
        Already have an account?
        <Link to="/login" className="auth-link">Sign in</Link>
      </div>
    </div>
  );
}
