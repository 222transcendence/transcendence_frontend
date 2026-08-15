import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';

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
    <Page>
      <Card>
        <Logo>Acid-Rain</Logo>
        <Subtitle>새 계정을 만드세요</Subtitle>

        {serverError && <ErrorBox>{serverError}</ErrorBox>}

        <Form onSubmit={handleSubmit}>
          {fields.map(f => (
            <div key={f.id}>
              <Label>{f.label}</Label>
              <Input
                type={f.type}
                value={f.value}
                onChange={e => f.setter(e.target.value)}
                placeholder={f.placeholder}
              />
              {f.error && <FieldError>{f.error}</FieldError>}
            </div>
          ))}
          <SubmitBtn type="submit" disabled={isLoading} style={{ marginTop: 6 }}>
            {isLoading ? '가입 중…' : '회원가입'}
          </SubmitBtn>
        </Form>

        <Footer>
          이미 계정이 있으신가요?{' '}
          <FooterActionLink to="/login">로그인</FooterActionLink>
        </Footer>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
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
  padding: 36px 36px;
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
  margin-bottom: 24px;
`;

const ErrorBox = styled.div`
  background: rgba(239, 74, 99, 0.1);
  border: 1px solid rgba(239, 74, 99, 0.3);
  border-radius: 10px;
  padding: 10px 14px;
  color: #ef4a63;
  font-size: 13px;
  margin-bottom: 14px;
  font-family: 'JetBrains Mono', monospace;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Label = styled.label`
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: #5c6a8a;
  margin-bottom: 5px;
  text-transform: uppercase;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: #e2e8f5;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  outline: none;
`;

const FieldError = styled.div`
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #ef4a63;
`;

const SubmitBtn = styled.button`
  width: 100%;
  padding: 12px 0;
  border-radius: 10px;
  border: 1px solid rgba(18, 200, 168, 0.5);
  background: rgba(18, 200, 168, 0.12);
  color: #12c8a8;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
`;

const Footer = styled.div`
  margin-top: 20px;
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
