import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameRoomProvider } from './context/GameRoomContext';
import { OpeningScreen } from './pages/OpeningScreen';
import { HomeScreen } from './pages/HomeScreen';
import { PassAndPlaySetup } from './pages/PassAndPlaySetup';
import { PassAndPlayGame } from './pages/PassAndPlayGame';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import ResultsPage from './pages/ResultsPage';

export default function App() {
  const [showOpening, setShowOpening] = useState(() => {
    // Only show opening screen once per browser tab session
    const shown = sessionStorage.getItem('ludoverse_opening_shown');
    return !shown;
  });

  const handleOpeningComplete = () => {
    sessionStorage.setItem('ludoverse_opening_shown', 'true');
    setShowOpening(false);
  };

  return (
    <GameRoomProvider>
      {showOpening && <OpeningScreen onComplete={handleOpeningComplete} />}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/pass-and-play" element={<PassAndPlaySetup />} />
          <Route path="/pass-and-play/game" element={<PassAndPlayGame />} />
          <Route path="/room/:roomId" element={<LobbyPage />} />
          <Route path="/room/:roomId/game" element={<GamePage />} />
          <Route path="/room/:roomId/results" element={<ResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </GameRoomProvider>
  );
}
