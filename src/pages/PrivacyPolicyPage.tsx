import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicyPage: React.FC = () => (
  <div className="static-page-container">
    <div className="static-page-card">
      <Link to="/" className="static-page-back">← 홈으로</Link>
      <h1>개인정보처리방침</h1>
      <p className="static-page-updated">최종 수정일: 2026년 6월 29일</p>

      <section>
        <h2>1. 수집하는 개인정보 항목</h2>
        <p>ft_transcendence 서비스(이하 "서비스")는 다음의 개인정보를 수집합니다.</p>
        <ul>
          <li><strong>이메일 주소</strong>: 계정 식별 및 로그인에 사용</li>
          <li><strong>닉네임</strong>: 서비스 내 사용자 표시 이름</li>
          <li><strong>아바타 이미지</strong>: 프로필 사진 (직접 업로드 또는 42 OAuth 제공)</li>
          <li><strong>42 intra 계정 정보</strong>: 42 OAuth 로그인 시 42 API로부터 수신 (이메일, 사용자명, 프로필 이미지)</li>
        </ul>
      </section>

      <section>
        <h2>2. 개인정보 수집 및 이용 목적</h2>
        <ul>
          <li>회원 식별 및 로그인 인증</li>
          <li>게임 서비스(로비, 매칭, 전적 기록) 제공</li>
          <li>친구 관계 관리 및 온라인 상태 표시</li>
          <li>채팅 서비스 제공</li>
        </ul>
      </section>

      <section>
        <h2>3. 개인정보 보존 기간</h2>
        <p>회원 탈퇴 시까지 보존합니다. 서비스 운영 종료 시 모든 데이터는 즉시 파기됩니다.</p>
        <p>단, 관계 법령에 따라 보존 의무가 있는 경우 해당 기간 동안 보관할 수 있습니다.</p>
      </section>

      <section>
        <h2>4. 개인정보 제3자 제공</h2>
        <p>서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 42 OAuth 인증 시 42 API와의 연동을 위해 필요한 최소한의 정보가 42 Network와 공유됩니다.</p>
      </section>

      <section>
        <h2>5. 개인정보 보호를 위한 조치</h2>
        <ul>
          <li>비밀번호는 bcrypt 알고리즘으로 암호화하여 저장</li>
          <li>인증 토큰(JWT)은 HTTPS를 통해 전송</li>
          <li>세션 토큰은 Redis에 저장되며 만료 시 자동 폐기</li>
        </ul>
      </section>

      <section>
        <h2>6. 이용자의 권리</h2>
        <p>이용자는 언제든지 자신의 개인정보를 조회·수정할 수 있으며, 회원 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다.</p>
      </section>

      <section>
        <h2>7. 문의</h2>
        <p>개인정보 처리에 관한 문의는 아래로 연락하시기 바랍니다.</p>
        <ul>
          <li>이메일: ththdk017@gmail.com</li>
          <li>GitHub: <a href="https://github.com/222transcendence" className="static-page-link" target="_blank" rel="noreferrer">github.com/222transcendence</a></li>
        </ul>
      </section>
    </div>
  </div>
);

export default PrivacyPolicyPage;
