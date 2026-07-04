import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => (
  <footer className="site-footer">
    <Link to="/privacy-policy" className="footer-link">개인정보처리방침</Link>
    <span className="footer-divider">·</span>
    <Link to="/terms-of-service" className="footer-link">이용약관</Link>
  </footer>
);
