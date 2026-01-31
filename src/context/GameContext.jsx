import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
    const [currentSession, setCurrentSession] = useState(null);
    const [activeQuestion, setActiveQuestion] = useState(null);
    const [players, setPlayers] = useState([]);
    const [timeLeft, setTimeLeft] = useState(0);

    // Helper to create a new session
    const createSession = async (quizTitle) => {
        try {
            const pin = Math.floor(100000 + Math.random() * 900000).toString();
            const sessionRef = await addDoc(collection(db, 'sessions'), {
                pin,
                title: quizTitle,
                status: 'waiting', // waiting, active, showing_results, finished
                currentQuestionIndex: 0,
                createdAt: serverTimestamp(),
                questions: [] // Array of question objects
            });
            return { id: sessionRef.id, pin };
        } catch (error) {
            console.error("Error creating session:", error);
            throw error;
        }
    };

    // Helper to join a session
    const joinSession = async (pin, playerName) => {
        // This would involve a query to find session by PIN
        // Then adding player to subcollection
        // For now, placeholder
        console.log("Joining session", pin, playerName);
    };

    // Helper to start the timer for a question
    const startTimer = async (sessionId, duration) => {
        const sessionRef = doc(db, 'sessions', sessionId);
        await updateDoc(sessionRef, {
            currentQuestionStartTime: serverTimestamp(),
            currentQuestionDuration: duration,
            status: 'active'
        });
    };

    const value = {
        currentSession,
        setCurrentSession,
        activeQuestion,
        players,
        timeLeft,
        createSession,
        joinSession,
        startTimer
    };

    return (
        <GameContext.Provider value={value}>
            {children}
        </GameContext.Provider>
    );
};
