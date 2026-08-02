import React from 'react';
import { Link } from 'react-router-dom';

const TermsOfServicePage: React.FC = () => (
  <div className="static-page-container">
    <div className="static-page-card">
      <Link to="/" className="static-page-back">← 홈으로</Link>
      <h1>이용약관</h1>
      <p className="static-page-updated">최종 수정일: 2026년 8월 2일</p>

      <section>
        <h2>제1조 (목적)</h2>
        <p>이 약관은 ft_transcendence 팀(이하 "팀")이 제공하는 Transcendence 서비스(이하 "서비스")의 이용 조건 및 절차, 팀과 이용자의 권리·의무를 규정함을 목적으로 합니다.</p>
      </section>

      <section>
        <h2>제2조 (서비스 소개)</h2>
        <p>서비스는 42Seoul 교육과정의 ft_transcendence 과제로 개발된 웹 기반 실시간 타자 대전 게임 플랫폼입니다. 이용자는 상대방과 1대1 산성비(Acid Rain) 타자 대결을 즐길 수 있습니다.</p>
        <ul>
          <li>게임 로비 및 방 생성·입장</li>
          <li>실시간 산성비 타자 대전 (낙하하는 단어를 먼저 입력해 상대 HP를 감소)</li>
          <li>전적 기록 및 리더보드</li>
          <li>친구 관리 및 친구 초대</li>
          <li>글로벌 채팅 및 1:1 채팅</li>
        </ul>
      </section>

      <section>
        <h2>제3조 (이용 자격)</h2>
        <p>서비스는 이메일 회원가입 또는 42 OAuth 인증을 통해 이용할 수 있습니다. 가입 시 정확한 정보를 제공해야 하며, 타인의 정보를 도용하는 행위는 금지됩니다.</p>
      </section>

      <section>
        <h2>제4조 (금지 행위)</h2>
        <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
        <ul>
          <li>타인의 계정을 무단으로 사용하는 행위</li>
          <li>서비스 운영을 방해하는 행위 (비정상적 트래픽 발생 등)</li>
          <li>게임 진행 중 부정한 방법으로 이득을 취하는 행위</li>
          <li>타 이용자에게 욕설·비하·혐오 표현을 사용하는 행위</li>
          <li>서비스의 소스코드를 무단으로 복제·배포하는 행위</li>
        </ul>
      </section>

      <section>
        <h2>제5조 (서비스 변경 및 중단)</h2>
        <p>서비스는 42Seoul 과제 목적으로 운영되며, 과제 종료 또는 팀의 판단에 따라 사전 고지 없이 변경·중단될 수 있습니다.</p>
      </section>

      <section>
        <h2>제6조 (면책 조항)</h2>
        <p>서비스는 교육 목적으로 제공되며 상업적 서비스가 아닙니다. 서비스 이용 중 발생하는 데이터 손실, 서비스 중단 등에 대해 팀은 법적 책임을 지지 않습니다.</p>
      </section>

      <section>
        <h2>제7조 (준거법)</h2>
        <p>이 약관은 대한민국 법률에 따라 해석·적용됩니다.</p>
      </section>

      <section>
        <h2>문의</h2>
        <ul>
          <li>이메일: ththdk017@gmail.com</li>
          <li>GitHub: <a href="https://github.com/222transcendence" className="static-page-link" target="_blank" rel="noreferrer">github.com/222transcendence</a></li>
        </ul>
      </section>
    </div>
  </div>
);

export default TermsOfServicePage;
