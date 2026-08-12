import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import ProfilePage from './pages/ProfilePage';
import LobbyPage from './pages/LobbyPage';
import WaitingRoomPage from './pages/WaitingRoomPage';
import PhaseAnimationsDemoPage from './pages/dev/PhaseAnimationsDemoPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import StatsPage from './pages/StatsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import GameBoardPage from './pages/GameBoardPage';
import SpectateBoardPage from './pages/SpectateBoardPage';
import PrivateRoute from './components/PrivateRoute';
import InviteNotification from './components/InviteNotification';
import { GameSocketProvider } from './context/GameSocketContext';
import './App.css';

function App() {
  return (
    <GameSocketProvider>
    <BrowserRouter>
      <Routes>
        {/* Home → Lobby */}
        <Route path="/" element={<PrivateRoute><Navigate to="/lobby" replace /></PrivateRoute>} />

        {/* Protected Profile Routes */}
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <ProfilePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile/:id"
          element={
            <PrivateRoute>
              <ProfilePage />
            </PrivateRoute>
          }
        />

        {/* Protected Lobby Routes */}
        <Route
          path="/lobby"
          element={
            <PrivateRoute>
              <LobbyPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/lobby/:roomId"
          element={
            <PrivateRoute>
              <WaitingRoomPage />
            </PrivateRoute>
          }
        />

        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

        {/* Static Pages (public) */}
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />

        {/* Stats & Leaderboard (#7) */}
        <Route path="/stats" element={<PrivateRoute><StatsPage /></PrivateRoute>} />
        <Route path="/stats/:userId" element={<PrivateRoute><StatsPage /></PrivateRoute>} />
        <Route path="/leaderboard" element={<PrivateRoute><LeaderboardPage /></PrivateRoute>} />

        {/* Game Board (#5) */}
        <Route
          path="/game/:roomId"
          element={<PrivateRoute><GameBoardPage /></PrivateRoute>}
        />

        {/* Spectator Mode (deploy#70) */}
        <Route
          path="/spectate/:roomId"
          element={<PrivateRoute><SpectateBoardPage /></PrivateRoute>}
        />

        {/* Dev-only animation demo (#6), not linked from nav */}
        <Route
          path="/dev/phase-animations"
          element={
            <PrivateRoute>
              <PhaseAnimationsDemoPage />
            </PrivateRoute>
          }
        />

        {/* Fallback to Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InviteNotification />
    </BrowserRouter>
    </GameSocketProvider>
  );
}

export default App;
