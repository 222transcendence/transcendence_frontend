import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';

interface PageLayoutProps {
  title: string;
  children: React.ReactNode;
  backTo?: string;
  actions?: React.ReactNode;
}

export default function PageLayout({ title, children, backTo = '/lobby', actions }: PageLayoutProps) {
  const navigate = useNavigate();
  return (
    <Page>
      <Inner>
        <Header>
          <HeaderLeft>
            <BackBtn onClick={() => navigate(backTo)}>← 뒤로</BackBtn>
            <Title>{title}</Title>
          </HeaderLeft>
          {actions && <HeaderActions>{actions}</HeaderActions>}
        </Header>
        {children}
      </Inner>
    </Page>
  );
}

export function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <StyledNavLink to={to}>{children}</StyledNavLink>;
}

const Page = styled.div`
  min-height: 100dvh;
  background: #05070c;
  padding: 28px 20px;
  font-family: 'Inter', sans-serif;
`;

const Inner = styled.div``;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`;

const Title = styled.div`
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 22px;
  color: #e2e8f5;
`;

const BackBtn = styled.button`
  padding: 6px 12px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: #8a93a8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  cursor: pointer;
`;

const StyledNavLink = styled(Link)`
  color: #12c8a8;
  text-decoration: none;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 13px;
`;
