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
    if (localStorage.getItem('accessToken')) navigate('/lobby', { replace: true });
  }, [navigate]);

  const validate = () => {
    const errs: typeof errors = {};
    if (!email) errs.email = '이메일을 입력해주세요';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = '올바른 이메일 형식이 아닙니다';
    if (!password) errs.password = '비밀번호를 입력해주세요';
    else if (password.length < 4) errs.password = '비밀번호는 4자 이상이어야 합니다';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        setServerError(result.error?.message || '로그인에 실패했습니다.');
      } else {
        const { accessToken, refreshToken, user } = result.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        navigate('/lobby', { replace: true });
      }
    } catch {
      setServerError('서버에 연결할 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>TRANSCENDENCE</div>
        <div style={S.subtitle}>계정에 로그인하세요</div>

        {serverError && <div style={S.errorBox}>{serverError}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={S.label}>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@example.com"
              style={S.input}
            />
            {errors.email && <div style={S.fieldError}>{errors.email}</div>}
          </div>
          <div>
            <label style={S.label}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={S.input}
            />
            {errors.password && <div style={S.fieldError}>{errors.password}</div>}
          </div>
          <button type="submit" disabled={isLoading} style={S.submitBtn}>
            {isLoading ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <div style={S.divider}><span style={S.dividerText}>또는</span></div>

        <button type="button" onClick={() => { window.location.href = '/api/auth/42'; }} style={S.oauthBtn}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>42</span>
          <span>로 로그인</span>
        </button>

        <div style={S.footer}>
          계정이 없으신가요?{' '}
          <Link to="/signup" style={S.link}>회원가입</Link>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Link to="/privacy-policy" style={S.footerLink}>개인정보처리방침</Link>
          <span style={{ color: '#3a4256', margin: '0 8px' }}>·</span>
          <Link to="/terms-of-service" style={S.footerLink}>이용약관</Link>
        </div>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse 900px 600px at 50% -10%, #0e1a24 0%, #05070c 60%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: '#0d1220',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 20,
    padding: '40px 36px',
    boxShadow: '0 24px 60px rgba(0,0,0,.5)',
  },
  logo: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 22,
    letterSpacing: '.25em',
    color: '#12c8a8',
    textAlign: 'center' as const,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: "'Inter',sans-serif",
    fontSize: 13,
    color: '#5c6a8a',
    textAlign: 'center' as const,
    marginBottom: 28,
  },
  errorBox: {
    background: 'rgba(239,74,99,.1)',
    border: '1px solid rgba(239,74,99,.3)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#ef4a63',
    fontSize: 13,
    marginBottom: 16,
    fontFamily: "'JetBrains Mono',monospace",
  },
  label: {
    display: 'block' as const,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: '.1em',
    color: '#5c6a8a',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,.1)',
    background: 'rgba(255,255,255,.03)',
    color: '#e2e8f5',
    fontFamily: "'Inter',sans-serif",
    fontSize: 14,
    outline: 'none',
  },
  fieldError: {
    marginTop: 5,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 11,
    color: '#ef4a63',
  },
  submitBtn: {
    width: '100%',
    padding: '13px 0',
    borderRadius: 10,
    border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.12)',
    color: '#12c8a8',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 15,
    cursor: 'pointer',
    marginTop: 4,
  },
  divider: {
    textAlign: 'center' as const,
    margin: '20px 0',
    position: 'relative' as const,
    borderTop: '1px solid rgba(255,255,255,.07)',
  },
  dividerText: {
    position: 'relative' as const,
    top: -10,
    background: '#0d1220',
    padding: '0 12px',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    color: '#5c6a8a',
  },
  oauthBtn: {
    width: '100%',
    padding: '12px 0',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,.12)',
    background: 'rgba(255,255,255,.03)',
    color: '#c7cede',
    fontFamily: "'Inter',sans-serif",
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footer: {
    marginTop: 22,
    textAlign: 'center' as const,
    fontFamily: "'Inter',sans-serif",
    fontSize: 13,
    color: '#5c6a8a',
  },
  link: {
    color: '#12c8a8',
    textDecoration: 'none',
    fontWeight: 600 as const,
  },
  footerLink: {
    color: '#3a4256',
    textDecoration: 'none',
    fontSize: 11,
    fontFamily: "'JetBrains Mono',monospace",
  },
} as const;
