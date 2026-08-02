import { useNavigate, Link } from 'react-router-dom';

interface PageLayoutProps {
  title: string;
  children: React.ReactNode;
  backTo?: string;
  actions?: React.ReactNode;
}

export default function PageLayout({ title, children, backTo = '/lobby', actions }: PageLayoutProps) {
  const navigate = useNavigate();
  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => navigate(backTo)} style={S.backBtn}>← 뒤로</button>
            <div style={S.title}>{title}</div>
          </div>
          {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} style={{ color: '#12c8a8', textDecoration: 'none', fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 13 }}>{children}</Link>;
}

const S = {
  page: {
    minHeight: '100vh',
    background: '#05070c',
    padding: '28px 20px',
    fontFamily: "'Inter',sans-serif",
  },
  inner: {},
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    paddingBottom: 18,
    borderBottom: '1px solid rgba(255,255,255,.07)',
  },
  title: {
    fontFamily: "'Rajdhani',sans-serif",
    fontWeight: 700 as const,
    fontSize: 22,
    color: '#e2e8f5',
  },
  backBtn: {
    padding: '6px 12px',
    borderRadius: 7,
    border: '1px solid rgba(255,255,255,.12)',
    background: 'transparent',
    color: '#8a93a8',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10.5,
    cursor: 'pointer',
  },
} as const;
