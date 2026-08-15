import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';

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
    <Page>
      <Card>
        {/* Logo */}
        <Logo>Acid-Rain</Logo>
        <Subtitle>계정에 로그인하세요</Subtitle>

        {serverError && <ErrorBox>{serverError}</ErrorBox>}

        <Form onSubmit={handleSubmit}>
          <div>
            <Label>이메일</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
            {errors.email && <FieldError>{errors.email}</FieldError>}
          </div>
          <div>
            <Label>비밀번호</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {errors.password && <FieldError>{errors.password}</FieldError>}
          </div>
          <SubmitBtn type="submit" disabled={isLoading}>
            {isLoading ? '로그인 중…' : '로그인'}
          </SubmitBtn>
        </Form>

        <Divider><DividerText>또는</DividerText></Divider>

        <OauthBtn type="button" onClick={() => { window.location.href = '/api/auth/42'; }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>42</span>
          <span>로 로그인</span>
        </OauthBtn>

        <Footer>
          계정이 없으신가요?{' '}
          <FooterActionLink to="/signup">회원가입</FooterActionLink>
        </Footer>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <FooterLink to="/privacy-policy">개인정보처리방침</FooterLink>
          <span style={{ color: '#3a4256', margin: '0 8px' }}>·</span>
          <FooterLink to="/terms-of-service">이용약관</FooterLink>
        </div>
      </Card>
    </Page>
  );
}

const Page = styled.div`
  min-height: 100dvh;
  background: radial-gradient(ellipse 900px 600px at 50% -10%, #0e1a24 0%, #05070c 60%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Card = styled.div`
  width: 100%;
  max-width: 420px;
  background: #0d1220;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 40px 36px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
`;

const Logo = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 22px;
  letter-spacing: 0.25em;
  color: #12c8a8;
  text-align: center;
  margin-bottom: 6px;
`;

const Subtitle = styled.div`
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #5c6a8a;
  text-align: center;
  margin-bottom: 28px;
`;

const ErrorBox = styled.div`
  background: rgba(239, 74, 99, 0.1);
  border: 1px solid rgba(239, 74, 99, 0.3);
  border-radius: 10px;
  padding: 10px 14px;
  color: #ef4a63;
  font-size: 13px;
  margin-bottom: 16px;
  font-family: 'JetBrains Mono', monospace;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Label = styled.label`
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: #5c6a8a;
  margin-bottom: 6px;
  text-transform: uppercase;
`;

const Input = styled.input`
  width: 100%;
  padding: 11px 14px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: #e2e8f5;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  outline: none;
`;

const FieldError = styled.div`
  margin-top: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #ef4a63;
`;

const SubmitBtn = styled.button`
  width: 100%;
  padding: 13px 0;
  border-radius: 10px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.12);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  margin-top: 4px;
`;

const Divider = styled.div`
  text-align: center;
  margin: 20px 0;
  position: relative;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
`;

const DividerText = styled.span`
  position: relative;
  top: -10px;
  background: #0d1220;
  padding: 0 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #5c6a8a;
`;

const OauthBtn = styled.button`
  width: 100%;
  padding: 12px 0;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #c7cede;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

const Footer = styled.div`
  margin-top: 22px;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #5c6a8a;
`;

const FooterActionLink = styled(Link)`
  color: #12c8a8;
  text-decoration: none;
  font-weight: 600;
`;

const FooterLink = styled(Link)`
  color: #3a4256;
  text-decoration: none;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
`;
