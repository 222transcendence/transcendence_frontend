import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import LobbyPage from './pages/LobbyPage';
import WaitingRoomPage from './pages/WaitingRoomPage';
import PrivateRoute from './components/PrivateRoute';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Protected Home Route */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <HomePage />
            </PrivateRoute>
          }
        />

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

        {/* Fallback to Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
