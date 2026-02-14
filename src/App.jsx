import { Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import { ThemeProvider } from './context/ThemeContext';

// Pages (to be created)
// Pages (to be created)
import Login from './pages/Admin/Login';
import Dashboard from './pages/Admin/Dashboard';
import CreateQuiz from './pages/Admin/CreateQuiz';
import HostPanel from './pages/Admin/HostPanel';
import JoinGame from './pages/Viewer/JoinGame';
import GameView from './pages/Viewer/GameView';
import Home from './pages/Home';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <GameProvider>
      <ThemeProvider>
        <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-sans relative transition-colors duration-300">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />


            <Route path="/admin" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />

            <Route path="/admin/create" element={
              <ProtectedRoute>
                <CreateQuiz />
              </ProtectedRoute>
            } />

            <Route path="/admin/edit/:quizId" element={
              <ProtectedRoute>
                <CreateQuiz />
              </ProtectedRoute>
            } />

            <Route path="/host/:sessionId" element={
              <ProtectedRoute>
                <HostPanel />
              </ProtectedRoute>
            } />

            <Route path="/join" element={<JoinGame />} />
            <Route path="/play/:sessionId" element={<GameView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </ThemeProvider>
    </GameProvider>
  );
}

export default App;
