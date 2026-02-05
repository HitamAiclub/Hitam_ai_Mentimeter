import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { CheckCircle2, XCircle, Clock, Coffee, BarChart2 } from 'lucide-react';

const GameView = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [isCorrect, setIsCorrect] = useState(null);
    const [questionStartTime, setQuestionStartTime] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);

    // Timer Logic - Synced
    useEffect(() => {
        if (session && session.status === 'active' && session.questionExpiresAt) {
            const updateTimer = () => {
                const now = Date.now();
                const remaining = Math.max(0, Math.ceil((session.questionExpiresAt - now) / 1000));
                setTimeLeft(remaining);
            };

            updateTimer();
            const timer = setInterval(updateTimer, 1000);
            return () => clearInterval(timer);
        } else if (session && session.status === 'active') {
            // Fallback
            const currentQ = session.questions[session.currentQuestionIndex];
            setTimeLeft(currentQ.timeLimit || 30);
        }
    }, [session?.currentQuestionIndex, session?.status, session?.questionExpiresAt]);

    // Get player info from local storage
    const playerId = localStorage.getItem('playerId');
    const playerName = localStorage.getItem('playerName');

    useEffect(() => {
        if (!sessionId) return;

        const unsub = onSnapshot(doc(db, "sessions", sessionId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSession({ id: docSnap.id, ...data });

                // Reset answer state when question changes
                // Simple logic: if new question index != locally stored index, reset
                // But relying on Firestore 'status' is better.
            } else {
                navigate('/');
            }
        });

        return () => unsub();
    }, [sessionId, navigate]);

    // Reset state when Question Index changes
    useEffect(() => {
        if (session) {
            // Log for debugging
            console.log("New Question Detected:", session.currentQuestionIndex);

            setHasAnswered(false);
            setIsCorrect(null);
            setSelectedOptions([]);
            setQuestionStartTime(Date.now());
        }
    }, [session?.currentQuestionIndex]);

    // Timer Start Logic (Separate to ensure it runs on status change too if needed)
    useEffect(() => {
        if (session?.status === 'active' && !hasAnswered) {
            // Only reset time if we haven't answered (or it's a new question flow)
            // Actually, the main reset handles the 'new question' case.
            // This is mostly for 'Waiting -> Active' transition for Q1.
            // But we don't want to overwrite it if we are mid-question?
            // Let's rely on the main reset for now, but ensure we have the state var.
        }
    }, [session?.status]);

    const [selectedOptions, setSelectedOptions] = useState([]); // Array of indices

    const toggleOption = (index) => {
        if (hasAnswered) return;

        const question = session.questions[session.currentQuestionIndex];
        const isMulti = question.type === 'multiple';

        if (isMulti) {
            setSelectedOptions(prev => {
                if (prev.includes(index)) {
                    return prev.filter(i => i !== index);
                } else {
                    return [...prev, index];
                }
            });
        } else {
            // Single choice: select only this one
            setSelectedOptions([index]);
        }
    };

    const handleSubmitAnswer = async () => {
        // Enforce time limit
        if (session.questionExpiresAt && Date.now() > session.questionExpiresAt) {
            return;
        }

        if (hasAnswered || selectedOptions.length === 0) return;

        const endTime = Date.now();
        const timeTaken = (endTime - questionStartTime) / 1000; // Seconds
        const question = session.questions[session.currentQuestionIndex];

        // Determine correctness
        // Strict mapping: All selected options must be correct, and NO incorrect options selected.
        // And count of selected options must match count of correct options?
        // Or just: Are all selected options correct? And did we miss any?
        // Let's go with: Correct if Set(Selected) === Set(CorrectOptions)

        const correctIndices = question.options
            .map((opt, i) => opt.isCorrect ? i : -1)
            .filter(i => i !== -1);

        const isExactMatch =
            selectedOptions.length === correctIndices.length &&
            selectedOptions.every(i => correctIndices.includes(i));

        setHasAnswered(true);
        setIsCorrect(isExactMatch);

        try {
            await addDoc(collection(db, `sessions/${sessionId}/answers`), {
                playerId,
                playerName,
                questionIndex: session.currentQuestionIndex,
                selectedOptions, // Store array
                isCorrect: isExactMatch, // Calculated locally for now
                timeTaken,
                submittedAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error submitting answer:", error);
        }
    };

    // ... (Loading/Waiting/Finished/Reveal screens remain mostly same, check isCorrect logic) ...

    if (!session) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;

    // WAITING SCREEN
    if (session.status === 'waiting') {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white">
                <div className="bg-slate-800 p-8 rounded-full mb-8 animate-pulse">
                    <Coffee className="w-16 h-16 text-blue-400" />
                </div>
                <h1 className="text-3xl font-bold mb-4">You're in!</h1>
                <p className="text-xl text-slate-400">See your nickname on screen?</p>
                <div className="mt-8 px-6 py-2 bg-slate-800 rounded-lg text-sm font-bold border border-slate-700">
                    Waiting for host to start...
                </div>
            </div>
        );
    }

    // FINISHED
    if (session.status === 'finished') {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white">
                <h1 className="text-4xl font-bold text-center">Quiz Complete! 🏆</h1>
                <p className="mt-4 text-slate-400">Check the main screen for the poduim.</p>
            </div>
        );
    }

    // REVEAL ANSWER (Feedback to player)
    if (session.status === 'showing_answer') {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white">
                <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-8 ${isCorrect ? 'bg-green-500' : 'bg-red-500'} animate-scale-in`}>
                    {isCorrect ? <CheckCircle2 className="w-16 h-16" /> : <XCircle className="w-16 h-16" />}
                </div>
                <h2 className="text-3xl font-bold mb-2">{isCorrect ? "Correct!" : "Wrong!"}</h2>
                <p className="text-slate-400">{isCorrect ? "+ Points scored" : "Better luck next time"}</p>
                <div className="mt-20 animate-bounce text-slate-500 text-sm">Waiting for leaderboard...</div>
            </div>
        );
    }

    // RESULTS (Scoreboard on host)
    if (session.status === 'showing_results') {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white">
                <div className="bg-slate-800 p-8 rounded-full mb-8">
                    <BarChart2 className="w-16 h-16 text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Leaderboard Updated!</h2>
                <p className="text-slate-400">Check the big screen to see who's winning.</p>
            </div>
        );
    }

    // ACTIVE QUESTION
    const question = session.questions[session.currentQuestionIndex];
    const isMulti = question.type === 'multiple';

    return (

        <div className="min-h-screen bg-slate-900 flex flex-col items-center p-4">
            <div className="w-full max-w-3xl flex flex-col flex-1 relative">

                {/* Header */}
                <div className="flex justify-between items-center text-white mb-6 pt-2">
                    <div className="text-sm text-slate-400 font-bold uppercase tracking-wider">
                        Question {session.currentQuestionIndex + 1}
                    </div>
                    {isMulti && <div className="text-xs bg-purple-600 px-3 py-1 rounded-full font-bold uppercase tracking-wide shadow-lg shadow-purple-900/20">Multi-Select</div>}
                </div>

                {/* Question Area */}
                <div className="bg-slate-800/50 backdrop-blur-sm p-6 md:p-8 rounded-3xl mb-8 border border-slate-700/50 relative overflow-hidden flex flex-col items-center gap-6 shadow-2xl">
                    {/* Progress Bar */}
                    <div className="absolute top-0 left-0 h-1.5 bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-1000 linear" style={{ width: `${(timeLeft / (question.timeLimit || 30)) * 100}%` }}></div>

                    {/* Question Images - Carousel or Stack */}
                    <div className="w-full flex justify-center gap-4 flex-wrap">
                        {(question.images || (question.imageUrl ? [question.imageUrl] : [])).map((imgUrl, idx) => (
                            <div key={idx} className="max-w-md w-full aspect-video bg-black/20 rounded-xl overflow-hidden flex items-center justify-center border border-slate-700/50">
                                <img src={imgUrl} alt={`Slide ${idx}`} className="max-h-full max-w-full object-contain" />
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col items-center gap-4 w-full">
                        <h2 className="text-2xl md:text-3xl font-bold text-white text-center leading-tight">{question.text}</h2>
                        <div className={`text-sm font-mono font-bold px-4 py-1.5 rounded-full border ${timeLeft <= 5 ? 'text-red-400 border-red-500/30 bg-red-500/10 animate-pulse' : 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'}`}>
                            {timeLeft}s remaining
                        </div>
                    </div>
                </div>

                {/* Answers Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-32 w-full">
                    {question.options.map((opt, i) => {
                        const isSelected = selectedOptions.includes(i);
                        return (
                            <button
                                key={i}
                                disabled={hasAnswered || timeLeft === 0}
                                onClick={() => toggleOption(i)}
                                className={`
                                    p-5 rounded-2xl font-bold text-lg text-left shadow-lg transition-all transform group relative overflow-hidden flex flex-col gap-3
                                    ${hasAnswered
                                        ? (isSelected
                                            ? 'bg-blue-600 ring-4 ring-blue-500/30 scale-100 z-10'
                                            : 'bg-slate-800/80 opacity-50 grayscale')
                                        : (isSelected
                                            ? 'bg-blue-600 ring-4 ring-blue-500/30 scale-[1.02] shadow-blue-900/20 z-10'
                                            : 'bg-slate-800 hover:bg-slate-700 hover:scale-[1.02] hover:shadow-xl border border-slate-700 hover:border-slate-600')
                                    }
                                `}
                            >
                                {/* Option Image if exists */}
                                {/* Option Image if exists */}
                                {(() => {
                                    const images = opt.images && opt.images.length > 0 ? opt.images : (opt.imageUrl ? [opt.imageUrl] : []);

                                    if (images.length === 0) return null;

                                    return (
                                        <div className="h-32 w-full rounded-xl overflow-hidden mb-2 flex items-center justify-center relative">
                                            {images.map((img, idx) => (
                                                <img
                                                    key={idx}
                                                    src={img}
                                                    alt="Option"
                                                    className="w-full h-full object-contain absolute inset-0"
                                                    style={{
                                                        opacity: images.length > 1 ? undefined : 1,
                                                        animation: images.length > 1 ? `fade-cycle ${images.length * 3}s infinite ${idx * 3}s` : 'none'
                                                    }}
                                                    onError={(e) => e.target.style.display = 'none'}
                                                />
                                            ))}
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

                                <div className="flex justify-between items-center w-full relative z-10">
                                    <span className="pr-4">{opt.text}</span>
                                    {/* Checkbox/Radio Icon */}
                                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${isSelected ? 'border-white bg-white text-blue-600' : 'border-slate-500 group-hover:border-slate-400'}`}>
                                        {isSelected && <CheckCircle2 className="w-5 h-5" />}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Submit Button Fixed Container */}
                <div className="fixed bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent z-50 pointer-events-none flex justify-center safe-pb">
                    <div className="w-full max-w-3xl pointer-events-auto">
                        <button
                            onClick={handleSubmitAnswer}
                            disabled={hasAnswered || timeLeft === 0 || selectedOptions.length === 0}
                            className={`w-full text-white text-xl font-bold py-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2
                                ${hasAnswered || timeLeft === 0 || selectedOptions.length === 0
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/20'
                                }
                            `}
                        >
                            {hasAnswered ? "Answer Submitted" : "Submit Answer"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GameView;
