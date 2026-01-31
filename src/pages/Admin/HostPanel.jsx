import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { Users, Play, BarChart2, ArrowRight, Trophy, Clock, CheckCircle2 } from 'lucide-react';
import QRCode from 'react-qr-code';

const HostPanel = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [participants, setParticipants] = useState([]);
    const [answers, setAnswers] = useState([]);
    const [timeLeft, setTimeLeft] = useState(0);

    // Timer Logic
    useEffect(() => {
        if (session && session.status === 'active') {
            const currentQ = session.questions[session.currentQuestionIndex];
            setTimeLeft(currentQ.timeLimit || 30);

            const timer = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [session?.id, session?.status, session?.currentQuestionIndex]);

    // 1. Listen to Session & Participants
    useEffect(() => {
        if (!sessionId) return;

        // Session Listener
        const sessionUnsub = onSnapshot(doc(db, "sessions", sessionId), (docSnap) => {
            if (docSnap.exists()) {
                setSession({ id: docSnap.id, ...docSnap.data() });
            } else {
                alert("Session ended or not found");
                navigate('/admin');
            }
            setLoading(false);
        });

        // Participants Listener (LIVE JOIN)
        const participantsUnsub = onSnapshot(collection(db, `sessions/${sessionId}/participants`), (snapshot) => {
            const pList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setParticipants(pList);
        });

        // Answers Listener (For Leaderboard)
        // Optimization: In real app, might want to only fetch this when needed, 
        // but for "Live" counting of answers during a question, we listen to all.
        const answersUnsub = onSnapshot(collection(db, `sessions/${sessionId}/answers`), (snapshot) => {
            const aList = snapshot.docs.map(doc => doc.data());
            setAnswers(aList);
        });

        return () => {
            sessionUnsub();
            participantsUnsub();
            answersUnsub();
        };
    }, [sessionId, navigate]);

    const handleNext = async () => {
        if (!session) return;

        // If already finished, just go home
        if (session.status === 'finished') {
            navigate('/admin');
            return;
        }

        const nextIndex = session.currentQuestionIndex + 1;

        if (nextIndex < session.questions.length) {
            await updateDoc(doc(db, "sessions", sessionId), {
                currentQuestionIndex: nextIndex,
                status: 'active' // Back to active for next question
            });
        } else {
            await updateDoc(doc(db, "sessions", sessionId), {
                status: 'finished'
            });
        }
    };

    const handleStartGame = async () => {
        await updateDoc(doc(db, "sessions", sessionId), {
            status: 'active'
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
        // ... (existing logic)
        // Compute stats per player
        const stats = {};

        // Initialize with 0 for all known participants
        participants.forEach(p => {
            stats[p.id] = {
                name: p.name || "Unknown",
                details: p, // Keep full details for custom fields
                correctCount: 0,
                totalTime: 0
            };
        });

        answers.forEach(ans => {
            if (stats[ans.playerId]) {
                if (ans.isCorrect) stats[ans.playerId].correctCount += 1;
                stats[ans.playerId].totalTime += (ans.timeTaken || 0);
            }
        });

        return Object.values(stats).sort((a, b) => {
            // Sort by Correct Count (Desc), then Time (Asc)
            if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
            return a.totalTime - b.totalTime;
        });
    };

    if (loading) return <div className="h-screen flex items-center justify-center text-white">Loading Session...</div>;
    if (!session) return null;

    const currentQuestion = session.questions[session.currentQuestionIndex];
    const leaderboard = session.status === 'showing_results' || session.status === 'finished' ? getLeaderboard() : [];

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col">

            {/* Top Bar */}
            <div className="bg-slate-800 p-4 shadow-lg flex justify-between items-center z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-full" />
                        <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Hitam Ai Mentimeter</h2>
                    </div>
                    <div className="bg-slate-700 px-4 py-1 rounded-full text-sm font-mono flex gap-2 items-center border border-slate-600">
                        <span className="text-slate-400">Join at Hitam Ai</span>
                        <span className="font-bold text-white text-lg tracking-widest">{session.pin}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-1 rounded-lg">
                        <Users className="w-5 h-5 text-blue-400" />
                        <span className="font-bold">{participants.length}</span>
                    </div>
                </div>
            </div>

            {/* Waiting Room */}
            {session.status === 'waiting' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-900 to-slate-900 z-0" />

                    <div className="z-10 text-center space-y-12 w-full max-w-4xl">
                        <div className="space-y-4">
                            <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight animate-fade-in-up">
                                Join the Game!
                            </h1>
                            <div className="inline-block bg-white p-4 rounded-3xl shadow-2xl animate-scale-in">
                                <QRCode value={`https://metomer.app/join?pin=${session.pin}`} size={200} />
                            </div>
                        </div>

                        {/* Player Grid */}
                        <div className="flex flex-wrap justify-center gap-4 min-h-[100px]">
                            {participants.map((p, i) => (
                                <div key={p.id} className="bg-slate-800/80 backdrop-blur border border-slate-700 px-6 py-3 rounded-full animate-pop-in flex items-center gap-3">
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
                                <div className={`text-4xl font-black font-mono p-4 rounded-full border-4 shadow-xl w-24 h-24 flex items-center justify-center transition-all ${timeLeft <= 5 ? 'text-red-500 border-red-500 animate-pulse scale-110' : 'text-blue-400 border-blue-400'}`}>
                                    {timeLeft}
                                </div>
                                <span className="text-xs font-bold text-gray-500 mt-2 uppercase">Seconds</span>
                            </div>

                            <span className="bg-blue-500/20 text-blue-300 px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider">
                                Question {session.currentQuestionIndex + 1} of {session.questions.length}
                            </span>
                            <h2 className="text-4xl md:text-6xl font-bold leading-tight max-w-4xl mx-auto mb-8">{currentQuestion.text}</h2>

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

                        {/* Options */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {currentQuestion.options.map((opt, i) => {
                                // Count votes: Support both new array-based and old scalar answers for safety
                                const voteCount = answers.filter(a => {
                                    if (a.selectedOptions && Array.isArray(a.selectedOptions)) {
                                        return a.selectedOptions.includes(i);
                                    }
                                    // Fallback for old sessions or single-choice legacy
                                    return a.optionIndex === i;
                                }).length;

                                const isRevealed = session.status === 'showing_answer';
                                const isCorrect = opt.isCorrect;

                                let cardClass = "bg-slate-800 border-slate-700 opacity-80";
                                if (isRevealed) {
                                    cardClass = isCorrect
                                        ? "bg-green-600 border-green-400 opacity-100 ring-4 ring-green-400/50 scale-105 shadow-xl"
                                        : "bg-slate-800 border-slate-700 opacity-40 grayscale";
                                }

                                return (
                                    <div key={i} className={`${cardClass} p-8 rounded-2xl border-2 flex items-center justify-between transition-all duration-500 relative overflow-hidden`}>
                                        <div className="relative z-10 flex justify-between w-full items-center">
                                            <span className="text-2xl font-bold">{opt.text}</span>
                                            <span className="bg-slate-900/50 px-4 py-2 rounded-xl font-mono text-xl font-bold text-white border border-white/10 shadow-inner">
                                                {voteCount}
                                            </span>
                                        </div>
                                        {isRevealed && isCorrect && <CheckCircle2 className="absolute right-4 top-4 w-6 h-6 text-green-200 opacity-50" />}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Controls: Reveal -> Leaderboard */}
                        <div className="flex justify-center pt-8">
                            <button
                                onClick={handleReveal}
                                className={`${session.status === 'active' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'} text-white px-8 py-4 rounded-xl font-bold flex items-center gap-3 shadow-lg hover:scale-105 transition-all`}
                            >
                                <BarChart2 className="w-6 h-6" />
                                {session.status === 'active'
                                    ? (timeLeft === 0 ? "Time's Up! Reveal Answer" : "Reveal Answer")
                                    : "Show Leaderboard"
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
                        <h2 className="text-5xl font-bold mb-2">Results</h2>
                    </div>

                    {/* Leaderboard Table */}
                    <div className="w-full max-w-4xl bg-slate-800/50 backdrop-blur rounded-3xl border border-slate-700 overflow-hidden shadow-2xl">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase font-bold tracking-wider">
                                <tr>
                                    <th className="p-6">#</th>
                                    <th className="p-6">Player</th>
                                    {/* Dynamic Headers for Custom Fields */}
                                    {session.participantFields?.slice(1).map(f => ( // Skip simple name
                                        <th key={f.id} className="p-6">{f.label}</th>
                                    ))}
                                    <th className="p-6 text-right">Correct</th>
                                    <th className="p-6 text-right">Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {leaderboard.map((p, i) => (
                                    <tr key={p.id || i} className="hover:bg-slate-700/50 transition-colors">
                                        <td className="p-6 font-bold text-slate-500">
                                            {i === 0 ? <Trophy className="w-6 h-6 text-yellow-500" /> : i + 1}
                                        </td>
                                        <td className="p-6 font-bold text-xl">{p.name}</td>

                                        {/* Dynamic Data for Custom Fields */}
                                        {session.participantFields?.slice(1).map(f => (
                                            <td key={f.id} className="p-6 text-slate-300">
                                                {p.details?.[f.id] || "-"}
                                            </td>
                                        ))}

                                        <td className="p-6 text-right font-mono text-xl text-green-400 font-bold">{p.correctCount}</td>
                                        <td className="p-6 text-right font-mono text-slate-400">
                                            {p.totalTime.toFixed(1)}s
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
                <div className="fixed bottom-8 right-8 bg-slate-800 text-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-bounce-subtle">
                    <div className="text-right">
                        <div className="text-3xl font-bold leading-none">{answers.filter(a => a.questionIndex === session.currentQuestionIndex).length}</div>
                        <div className="text-xs text-slate-400 font-bold uppercase">Submissions</div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-400" />
                    </div>
                </div>
            )}

        </div>
    );
};

export default HostPanel;
