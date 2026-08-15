import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; nickname?: string; password?: string; passwordConfirm?: string }>({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const validate = () => {
    const errs: typeof errors = {};
    if (!email) errs.email = '이메일을 입력해주세요';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = '올바른 이메일 형식이 아닙니다';
    if (!nickname) errs.nickname = '닉네임을 입력해주세요';
    else if (nickname.length < 3 || nickname.length > 20) errs.nickname = '닉네임은 3~20자이어야 합니다';
    else if (!/^[a-zA-Z0-9_-]+$/.test(nickname)) errs.nickname = '영문, 숫자, _, - 만 사용 가능합니다';
    if (!password) errs.password = '비밀번호를 입력해주세요';
    else if (password.length < 6) errs.password = '비밀번호는 6자 이상이어야 합니다';
    if (!passwordConfirm) errs.passwordConfirm = '비밀번호를 확인해주세요';
    else if (passwordConfirm !== password) errs.passwordConfirm = '비밀번호가 일치하지 않습니다';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nickname, password }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        setServerError(result.error?.message || '회원가입에 실패했습니다. 이미 사용 중인 이메일 또는 닉네임일 수 있습니다.');
      } else {
        navigate('/login', { state: { signupSuccess: true } });
      }
    } catch {
      setServerError('서버에 연결할 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const fields = [
    { id: 'email', label: '이메일', type: 'email', value: email, setter: setEmail, placeholder: 'name@example.com', error: errors.email },
    { id: 'nickname', label: '닉네임', type: 'text', value: nickname, setter: setNickname, placeholder: 'cyber_ponger', error: errors.nickname },
    { id: 'password', label: '비밀번호', type: 'password', value: password, setter: setPassword, placeholder: '••••••••', error: errors.password },
    { id: 'passwordConfirm', label: '비밀번호 확인', type: 'password', value: passwordConfirm, setter: setPasswordConfirm, placeholder: '••••••••', error: errors.passwordConfirm },
  ];

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>Acid-Rain</div>
        <div style={S.subtitle}>새 계정을 만드세요</div>

        {serverError && <div style={S.errorBox}>{serverError}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map(f => (
            <div key={f.id}>
              <label style={S.label}>{f.label}</label>
              <input
                type={f.type}
                value={f.value}
                onChange={e => f.setter(e.target.value)}
                placeholder={f.placeholder}
                style={S.input}
              />
              {f.error && <div style={S.fieldError}>{f.error}</div>}
            </div>
          ))}
          <button type="submit" disabled={isLoading} style={{ ...S.submitBtn, marginTop: 6 }}>
            {isLoading ? '가입 중…' : '회원가입'}
          </button>
        </form>

        <div style={S.footer}>
          이미 계정이 있으신가요?{' '}
          <Link to="/login" style={S.link}>로그인</Link>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
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
    minHeight: '100dvh',
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
    padding: '36px 36px',
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
    marginBottom: 24,
  },
  errorBox: {
    background: 'rgba(239,74,99,.1)',
    border: '1px solid rgba(239,74,99,.3)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#ef4a63',
    fontSize: 13,
    marginBottom: 14,
    fontFamily: "'JetBrains Mono',monospace",
  },
  label: {
    display: 'block' as const,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: '.1em',
    color: '#5c6a8a',
    marginBottom: 5,
    textTransform: 'uppercase' as const,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,.1)',
    background: 'rgba(255,255,255,.03)',
    color: '#e2e8f5',
    fontFamily: "'Inter',sans-serif",
    fontSize: 14,
    outline: 'none',
  },
  fieldError: {
    marginTop: 4,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 11,
    color: '#ef4a63',
  },
  submitBtn: {
    width: '100%',
    padding: '12px 0',
    borderRadius: 10,
    border: '1px solid rgba(18,200,168,.5)',
    background: 'rgba(18,200,168,.12)',
    color: '#12c8a8',
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 15,
    cursor: 'pointer',
  },
  footer: {
    marginTop: 20,
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
