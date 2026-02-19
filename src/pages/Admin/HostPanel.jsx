import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { Users, Play, BarChart2, ArrowRight, Trophy, Clock, CheckCircle2, Sun, Moon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { useTheme } from '../../context/ThemeContext';

import WordCloud from 'react-d3-cloud';

const HostPanel = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [participants, setParticipants] = useState([]);
    const [answers, setAnswers] = useState([]);
    const [timeLeft, setTimeLeft] = useState(0);

    // Timer Logic - Synced
    useEffect(() => {
        if (session && session.status === 'active') {
            // Infinite Time Check (No Limit)
            if (!session.questionExpiresAt) {
                setTimeLeft(null); // Indicator for "Infinite"
                return;
            }

            const updateTimer = () => {
                const now = Date.now();
                const remaining = Math.max(0, Math.ceil((session.questionExpiresAt - now) / 1000));
                setTimeLeft(remaining);
            };

            updateTimer(); // Initial call
            const timer = setInterval(updateTimer, 1000);
            return () => clearInterval(timer);
        }
    }, [session?.id, session?.status, session?.currentQuestionIndex, session?.questionExpiresAt]);

    // ... (Listeners remain same) ...

    // Data Fetching
    useEffect(() => {
        if (!sessionId) return;
        setLoading(true);

        const sessionRef = doc(db, "sessions", sessionId);
        const unsubSession = onSnapshot(sessionRef, (docSnap) => {
            if (docSnap.exists()) {
                setSession({ id: docSnap.id, ...docSnap.data() });
                setLoading(false);
            } else {
                console.error("Session not found");
                navigate('/admin');
            }
        });

        const participantsRef = collection(db, `sessions/${sessionId}/participants`);
        const unsubParticipants = onSnapshot(participantsRef, (snapshot) => {
            const parts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setParticipants(parts);
        });

        const answersRef = collection(db, `sessions/${sessionId}/answers`);
        const unsubAnswers = onSnapshot(answersRef, (snapshot) => {
            const ans = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setAnswers(ans);
        });

        return () => {
            unsubSession();
            unsubParticipants();
            unsubAnswers();
        };
    }, [sessionId, navigate]);

    // Reactions Logic
    const [reactions, setReactions] = useState([]);

    useEffect(() => {
        if (!sessionId) return;

        // Listen to reactions added after mount (approx)
        // Actually, just listen to all and filter by recent on the UI side or assume we only show new ones arriving via 'added' change type?
        // Let's use 'added' change type to trigger animation

        const reactionsRef = collection(db, `sessions/${sessionId}/reactions`);
        // Limit to recent? Or just listen. If lots of reactions, might need limit.
        // For now, simple listener.
        const unsubReactions = onSnapshot(reactionsRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    // Only show if created recently (within last 5 sec) to avoid flood on reload
                    // Use local time check if serverTimestamp is null (pending) or estimatable
                    // or just basic "it's new to the stream"
                    const newReaction = {
                        id: change.doc.id,
                        type: data.type,
                        // Random position
                        left: Math.random() * 80 + 10 + '%', // 10% to 90%
                    };

                    setReactions(prev => [...prev, newReaction]);

                    // Cleanup after animation (3s)
                    setTimeout(() => {
                        setReactions(prev => prev.filter(r => r.id !== newReaction.id));
                    }, 3000);
                }
            });
        });

        return () => unsubReactions();
    }, [sessionId]);

    const handleNext = async () => {
        if (!session) return;

        // If already finished, just go home
        if (session.status === 'finished') {
            navigate('/admin');
            return;
        }

        const nextIndex = session.currentQuestionIndex + 1;

        if (nextIndex < session.questions.length) {
            const nextQ = session.questions[nextIndex];
            const timeLimit = nextQ.timeLimit !== undefined ? nextQ.timeLimit : 30; // Default 30s
            // If timeLimit is 0 -> Infinite -> No ExpiresAt
            const expiresAt = timeLimit > 0 ? (Date.now() + (timeLimit * 1000)) : null;

            await updateDoc(doc(db, "sessions", sessionId), {
                currentQuestionIndex: nextIndex,
                status: 'active', // Back to active for next question
                questionExpiresAt: expiresAt
            });
        } else {
            await updateDoc(doc(db, "sessions", sessionId), {
                status: 'finished'
            });
        }
    };

    const handleStartGame = async () => {
        const firstQ = session.questions[0];
        const timeLimit = firstQ.timeLimit !== undefined ? firstQ.timeLimit : 30;
        const expiresAt = timeLimit > 0 ? (Date.now() + (timeLimit * 1000)) : null;

        await updateDoc(doc(db, "sessions", sessionId), {
            status: 'active',
            questionExpiresAt: expiresAt
        });
    };

    const handleReveal = async () => {
        if (session.status === 'active') {
            await updateDoc(doc(db, "sessions", sessionId), {
                status: 'showing_answer'
            });
        } else if (session.status === 'showing_answer') {
            await updateDoc(doc(db, "sessions", sessionId), {
                status: 'showing_results'
            });
        }
    };



    // Calculate Leaderboard
    const getLeaderboard = () => {
        const stats = {};

        // Initialize
        participants.forEach(p => {
            stats[p.id] = {
                name: p.name || "Unknown",
                details: p,
                correctCount: 0,
                totalTimeTaken: 0
            };
        });

        answers.forEach(ans => {
            if (stats[ans.playerId]) {
                const question = session.questions[ans.questionIndex];
                if (question) {
                    const isSurvey = question.type === 'word_cloud' || question.type === 'open_ended';

                    // Check correctness (Only for non-survey types)
                    if (!isSurvey && ans.isCorrect) {
                        stats[ans.playerId].correctCount += 1;
                    }

                    // Track time ONLY for scored questions (ignore survey types for speed metrics)
                    if (!isSurvey) {
                        // Use timeLimit or default 30, but allow 0 if explicitly set (Infinite)
                        const timeLimit = (question.timeLimit !== undefined) ? question.timeLimit : 30;

                        // Use actual timeTaken if present, else default to timeLimit (penalty for no time logged?)
                        // If timeTaken is 0 (fast answer), keep it 0.
                        const took = (ans.timeTaken !== undefined) ? ans.timeTaken : timeLimit;

                        stats[ans.playerId].totalTimeTaken += took;
                    }
                }
            }
        });

        return Object.values(stats).sort((a, b) => {
            // Primary: Correct Count (Desc)
            if (b.correctCount !== a.correctCount) {
                return b.correctCount - a.correctCount;
            }
            // Secondary: Total Time (Asc) - Lower is better
            return a.totalTimeTaken - b.totalTimeTaken;
        });
    };

    if (loading) return <div className="h-screen flex items-center justify-center text-gray-900 dark:text-white">Loading Session...</div>;
    if (!session) return null;

    const currentQuestion = session.questions[session.currentQuestionIndex];
    const leaderboard = session.status === 'showing_results' || session.status === 'finished' ? getLeaderboard() : [];

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white flex flex-col px-0 sm:px-0 transition-colors duration-300 relative overflow-hidden">
            {/* Reaction Container */}
            <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
                {reactions.map(r => (
                    <div
                        key={r.id}
                        className="absolute bottom-0 text-4xl animate-float-up"
                        style={{ left: r.left }}
                    >
                        {r.type === 'heart' ? '❤️' :
                            r.type === 'like' ? '👍' :
                                r.type === 'laugh' ? '😂' : '😮'}
                    </div>
                ))}
            </div>

            {/* Top Bar */}
            <div className="bg-white dark:bg-slate-800 p-4 shadow-lg flex justify-between items-center z-10 sticky top-0 transition-colors duration-300">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-full" />
                        <h2 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">Hitam Ai Mentimeter</h2>
                    </div>
                    <div className="bg-gray-100 dark:bg-slate-700 px-4 py-1 rounded-full text-sm font-mono flex gap-2 items-center border border-gray-200 dark:border-slate-600">
                        <span className="text-gray-500 dark:text-slate-400">Join at Hitam Ai</span>
                        <span className="font-bold text-gray-900 dark:text-white text-lg tracking-widest">{session.pin}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg bg-gray-100 dark:bg-slate-700/50 text-gray-600 dark:text-gray-400 hover:text-primary-500 dark:hover:text-yellow-400 transition-colors"
                        title="Toggle Theme"
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-700/50 px-3 py-1 rounded-lg">
                        <Users className="w-5 h-5 text-primary-500 dark:text-blue-400" />
                        <span className="font-bold text-gray-900 dark:text-white">{participants.length}</span>
                    </div>
                </div>
            </div>

            {/* Waiting Room */}
            {session.status === 'waiting' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary-100/40 via-white to-white dark:from-blue-900/40 dark:via-slate-900 dark:to-slate-900 z-0" />

                    <div className="z-10 text-center space-y-12 w-full max-w-4xl">
                        <div className="space-y-4">
                            <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold text-gray-900 dark:text-white tracking-tight animate-fade-in-up">
                                Join the Game!
                            </h1>
                            <div className="inline-block bg-white p-2 md:p-4 rounded-3xl shadow-2xl animate-scale-in">
                                <QRCode value={`${window.location.origin}/#/join?pin=${session.pin}`} size={window.innerWidth < 768 ? 150 : 200} />
                            </div>
                        </div>

                        {/* Player Grid */}
                        <div className="flex flex-wrap justify-center gap-4 min-h-[100px]">
                            {participants.map((p, i) => (
                                <div key={p.id} className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-gray-200 dark:border-slate-700 px-6 py-3 rounded-full animate-pop-in flex items-center gap-3 shadow-md dark:shadow-none">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-xs uppercase">
                                        {p.name?.[0] || "?"}
                                    </div>
                                    <span className="font-bold">{p.name}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleStartGame}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-6 rounded-2xl font-bold text-2xl shadow-xl shadow-blue-600/20 hover:scale-105 transition-all flex items-center gap-4 mx-auto"
                        >
                            <Play className="w-8 h-8 fill-current" />
                            Start Quiz
                        </button>
                    </div>
                </div>
            )}

            {/* Active Question OR Reveal Answer */}
            {(session.status === 'active' || session.status === 'showing_answer') && (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    <div className="w-full max-w-5xl space-y-12">

                        {/* Timer & Question Info */}
                        <div className="text-center space-y-6 relative">
                            {/* Floating Timer */}
                            <div className="absolute top-0 right-0 hidden md:flex flex-col items-center">
                                <div className={`text-4xl font-black font-mono p-4 rounded-full border-4 shadow-xl w-24 h-24 flex items-center justify-center transition-all ${timeLeft !== null && timeLeft <= 5 ? 'text-red-500 border-red-500 animate-pulse scale-110' : 'text-primary-500 dark:text-blue-400 border-primary-200 dark:border-blue-400 bg-white dark:bg-slate-800'}`}>
                                    {timeLeft === null ? "∞" : timeLeft}
                                </div>
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-500 mt-2 uppercase">Seconds</span>
                            </div>

                            <span className="bg-primary-100 dark:bg-blue-500/20 text-primary-600 dark:text-blue-300 px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider">
                                Question {session.currentQuestionIndex + 1} of {session.questions.length}
                            </span>
                            <h2 className="text-4xl md:text-6xl font-bold leading-tight max-w-4xl mx-auto mb-8 text-gray-900 dark:text-white">{currentQuestion.text}</h2>

                            {currentQuestion.imageUrl && (
                                <div className="flex justify-center mb-8">
                                    <img src={currentQuestion.imageUrl} alt="Question" className="max-h-[400px] rounded-2xl border-2 border-slate-700 shadow-2xl object-contain" />
                                </div>
                            )}

                            {/* Mobile Timer */}
                            <div className="md:hidden flex justify-center">
                                <div className={`text-2xl font-black font-mono px-4 py-2 rounded-xl border-2 flex items-center gap-2 ${timeLeft <= 5 ? 'text-red-500 border-red-500 bg-red-500/10' : 'text-blue-400 border-blue-400 bg-blue-500/10'}`}>
                                    <Clock className="w-5 h-5" /> {timeLeft}s
                                </div>
                            </div>
                        </div>

                        {/* Visualization Area */}
                        {(currentQuestion.type === 'word_cloud') ? (
                            <div className="bg-gray-100 dark:bg-slate-800/50 p-8 rounded-3xl min-h-[500px] h-[600px] w-full flex items-center justify-center relative shadow-inner dark:shadow-none overflow-hidden text-black">
                                {(() => {
                                    const words = answers
                                        .filter(a => a.questionIndex === session.currentQuestionIndex && a.answerText)
                                        .map(a => a.answerText.trim());

                                    const counts = {};
                                    words.forEach(w => { counts[w.toLowerCase()] = (counts[w.toLowerCase()] || 0) + 1; });

                                    // REACT-D3-CLOUD EXPECTS: { text: string, value: number }
                                    const data = Object.entries(counts).map(([text, value]) => ({
                                        text,
                                        value: value * 10
                                    }));

                                    const fontSizeMapper = word => Math.log2(word.value) * 15 + 20; // More dramatic scaling
                                    const rotate = () => (Math.random() > 0.5 ? 90 : 0); // Random visual rotation

                                    // Professional Palette (Blues, Greens, Earth Tones) matching the image
                                    const onWordClick = () => { };
                                    const colors = ['#2563eb', '#059669', '#d97706', '#db2777', '#4b5563', '#9333ea', '#0891b2'];
                                    // Blue, Green, Amber, Pink, Gray, Purple, Cyan

                                    return data.length > 0 ? (
                                        <div style={{ width: '100%', height: '100%' }}>
                                            <WordCloud
                                                data={data}
                                                width={800} // Increased base width for resolution
                                                height={600}
                                                font="Inter, sans-serif"
                                                fontSize={fontSizeMapper}
                                                rotate={rotate}
                                                padding={4}
                                                fill={(d, i) => colors[i % colors.length]} // Custom colors
                                            />
                                        </div>
                                    ) : (
                                        <div className="text-slate-500 text-xl font-bold italic animate-pulse">Waiting for responses...</div>
                                    );
                                })()}
                            </div>
                        ) : (currentQuestion.type === 'open_ended') ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {answers.filter(a => a.questionIndex === session.currentQuestionIndex && a.answerText).map((ans, idx) => (
                                    <div key={idx} className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white p-6 rounded-t-2xl rounded-br-2xl rounded-bl-none shadow-lg transform transition-all hover:scale-105 animate-fade-in-up border border-gray-100 dark:border-slate-700">
                                        <p className="text-xl font-bold font-handwriting leading-relaxed">"{ans.answerText}"</p>
                                        <div className="mt-4 flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-gray-600 dark:text-slate-300">
                                                {ans.playerName?.[0]}
                                            </div>
                                            <span className="text-xs font-bold text-gray-500 dark:text-slate-400">{ans.playerName}</span>
                                        </div>
                                    </div>
                                ))}
                                {answers.filter(a => a.questionIndex === session.currentQuestionIndex).length === 0 && (
                                    <div className="col-span-full flex justify-center py-20 text-gray-400 dark:text-slate-500 text-xl font-bold italic animate-pulse">
                                        Waiting for thoughts...
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Classic Grid for Single/Multi */
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {currentQuestion.options.map((opt, i) => {
                                    // Count votes: Support both new array-based and old scalar answers for safety
                                    const voteCount = answers.filter(a => {
                                        // Must match current question index
                                        if (a.questionIndex !== session.currentQuestionIndex) return false;

                                        if (a.selectedOptions && Array.isArray(a.selectedOptions)) {
                                            return a.selectedOptions.includes(i);
                                        }
                                        // Fallback for old sessions or single-choice legacy
                                        return a.optionIndex === i;
                                    }).length;

                                    const isRevealed = session.status === 'showing_answer';
                                    const isCorrect = opt.isCorrect;

                                    let cardClass = "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-lg dark:shadow-none opacity-100";
                                    if (isRevealed) {
                                        cardClass = isCorrect
                                            ? "bg-green-100 dark:bg-green-600 border-green-500 dark:border-green-400 opacity-100 ring-4 ring-green-400/50 scale-105 shadow-xl"
                                            : "bg-gray-100 dark:bg-slate-800 border-gray-300 dark:border-slate-700 opacity-40 grayscale";
                                    }

                                    return (
                                        <div key={i} className={`${cardClass} p-6 rounded-2xl border-2 flex flex-col gap-4 transition-all duration-500 relative overflow-hidden h-full`}>
                                            {/* Option Image */}
                                            {/* Option Image if exists */}
                                            {(() => {
                                                const images = opt.images && opt.images.length > 0 ? opt.images : (opt.imageUrl ? [opt.imageUrl] : []);

                                                if (images.length === 0) return null;

                                                return (
                                                    <div className="w-full h-48 flex-shrink-0 flex items-center justify-center rounded-xl overflow-hidden relative">
                                                        {images.map((img, idx) => (
                                                            <img
                                                                key={idx}
                                                                src={img}
                                                                alt="Option"
                                                                className={`w-full h-full object-contain absolute inset-0 transition-opacity duration-1000 ${
                                                                    // Simple time-based inline rotation if strictly needed without extra component state complexity
                                                                    // But let's rely on a key-based re-render or CSS animation? 
                                                                    // CSS animation is cleaner for "no state clutter" in a map loop.
                                                                    // Actually, infinite CSS animation is easiest.
                                                                    images.length > 1 ? 'animate-pulse-slow' : ''
                                                                    }`}
                                                                style={{
                                                                    opacity: images.length > 1 ? undefined : 1, // Let CSS handle it or just show
                                                                    animation: images.length > 1 ? `fade-cycle ${images.length * 3}s infinite ${idx * 3}s` : 'none'
                                                                }}
                                                                onError={(e) => e.target.style.display = 'none'}
                                                            />
                                                        ))}
                                                        {/* Style for the fade cycle */}
                                                        <style>{`
                                                    @keyframes fade-cycle {
                                                        0% { opacity: 0; z-index: 0; }
                                                        10% { opacity: 1; z-index: 10; }
                                                        30% { opacity: 1; z-index: 10; }
                                                        40% { opacity: 0; z-index: 0; }
                                                        100% { opacity: 0; z-index: 0; }
                                                    }
                                                `}</style>
                                                    </div>
                                                );
                                            })()}

                                            <div className="relative z-10 flex justify-between w-full items-center flex-1">
                                                <span className="text-2xl font-bold break-words">{opt.text}</span>
                                                <span className="bg-slate-900/50 px-4 py-2 rounded-xl font-mono text-xl font-bold text-white border border-white/10 shadow-inner flex-shrink-0 ml-4">
                                                    {voteCount}
                                                </span>
                                            </div>
                                            {isRevealed && isCorrect && <CheckCircle2 className="absolute right-4 top-4 w-6 h-6 text-green-200 opacity-50" />}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Controls: Reveal -> Leaderboard or Next Question */}
                        <div className="flex justify-center pt-8">
                            <button
                                onClick={
                                    (session.status === 'showing_answer' && (currentQuestion.type === 'word_cloud' || currentQuestion.type === 'open_ended'))
                                        ? handleNext
                                        : handleReveal
                                }
                                className={`${session.status === 'active' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'} text-white px-8 py-4 rounded-xl font-bold flex items-center gap-3 shadow-lg hover:scale-105 transition-all`}
                            >
                                <BarChart2 className="w-6 h-6" />
                                {session.status === 'active'
                                    ? (timeLeft === 0 ? "Time's Up! Reveal Answer" : "Reveal Answer")
                                    : (
                                        (currentQuestion.type === 'word_cloud' || currentQuestion.type === 'open_ended')
                                            ? "Next Question"
                                            : "Show Leaderboard"
                                    )
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Leaderboard / Results */}
            {(session.status === 'showing_results' || session.status === 'finished') && (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    <div className="text-center mb-12">
                        <div className="w-20 h-20 bg-green-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-500/20">
                            <BarChart2 className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-5xl font-bold mb-2 text-gray-900 dark:text-white">Results</h2>
                    </div>

                    {/* Leaderboard Table */}
                    <div className="w-full max-w-4xl bg-white dark:bg-slate-800/50 backdrop-blur rounded-3xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-2xl overflow-x-auto">
                        <table className="w-full text-left min-w-[600px]">
                            <thead className="bg-gray-50 dark:bg-slate-900/50 text-gray-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider">
                                <tr>
                                    <th className="p-6">#</th>
                                    <th className="p-6">Player</th>
                                    {/* Dynamic Headers for Custom Fields */}
                                    {session.participantFields?.slice(1).map(f => ( // Skip simple name
                                        <th key={f.id} className="p-6">{f.label}</th>
                                    ))}
                                    <th className="p-6 text-right">Correct</th>
                                    <th className="p-6 text-right">Time (s)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {leaderboard.map((p, i) => (
                                    <tr key={p.id || i} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="p-6 font-bold text-gray-400 dark:text-slate-500">
                                            {i === 0 ? <Trophy className="w-6 h-6 text-yellow-500" /> : i + 1}
                                        </td>
                                        <td className="p-6 font-bold text-xl text-gray-900 dark:text-white">{p.name}</td>

                                        {/* Dynamic Data for Custom Fields */}
                                        {session.participantFields?.slice(1).map(f => (
                                            <td key={f.id} className="p-6 text-gray-600 dark:text-slate-300">
                                                {p.details?.[f.id] || "-"}
                                            </td>
                                        ))}

                                        <td className="p-6 text-right font-mono text-xl text-green-600 dark:text-green-400 font-bold">{p.correctCount}</td>
                                        <td className="p-6 text-right font-mono text-gray-500 dark:text-slate-400">
                                            {p.totalTimeTaken.toFixed(1)}s
                                        </td>
                                    </tr>
                                ))}
                                {leaderboard.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="p-12 text-center text-slate-500">No participants yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-12">
                        <button
                            onClick={handleNext}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-xl font-bold text-xl shadow-lg hover:scale-105 transition-all flex items-center gap-3"
                        >
                            {session.status === 'finished' ? "Back to Home" : "Next Question"}
                            <ArrowRight className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}

            {/* Answer count indicator (for Active state) */}
            {session.status === 'active' && (
                <div className="fixed bottom-8 right-8 bg-white dark:bg-slate-800 text-gray-900 dark:text-white px-6 py-4 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 flex items-center gap-4 animate-bounce-subtle">
                    <div className="text-right">
                        <div className="text-3xl font-bold leading-none">{answers.filter(a => a.questionIndex === session.currentQuestionIndex).length}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase">Submissions</div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary-500 dark:text-blue-400" />
                    </div>
                </div>
            )}

        </div>
    );
};

export default HostPanel;
