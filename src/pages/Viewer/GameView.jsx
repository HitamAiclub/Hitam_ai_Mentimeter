import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { CheckCircle2, XCircle, Clock, Coffee, BarChart2, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const GameView = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [session, setSession] = useState(null);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [isCorrect, setIsCorrect] = useState(null);
    const [questionStartTime, setQuestionStartTime] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);

    // Timer Logic - Synced
    useEffect(() => {
        if (session && session.status === 'active') {
            if (session.questionExpiresAt) {
                const updateTimer = () => {
                    const now = Date.now();
                    const remaining = Math.max(0, Math.ceil((session.questionExpiresAt - now) / 1000));
                    setTimeLeft(remaining);
                };

                updateTimer();
                const timer = setInterval(updateTimer, 1000);
                return () => clearInterval(timer);
            } else {
                // Infinite Time
                setTimeLeft(null);
            }
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


            setHasAnswered(false);
            setIsCorrect(null);
            setSelectedOptions([]);
            setAnswerText("");
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

    const [answerText, setAnswerText] = useState(""); // For text answers
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

    const [showFeedback, setShowFeedback] = useState(false);

    const handleSubmitAnswer = async () => {
        // Enforce time limit
        if (session.questionExpiresAt && Date.now() > session.questionExpiresAt) {
            return;
        }

        const question = session.questions[session.currentQuestionIndex];
        const isTextType = question.type === 'word_cloud' || question.type === 'open_ended';

        if (hasAnswered) return;
        if (!isTextType && selectedOptions.length === 0) return;
        if (isTextType && !answerText.trim()) return;

        const endTime = Date.now();
        const timeTaken = (endTime - questionStartTime) / 1000; // Seconds

        let isExactMatch = false;

        if (isTextType) {
            // Text answers are always "valid" submissions, correctness depends on context (graded vs survey)
            // For now, treat as "submitted" (true) so they get positive feedback
            isExactMatch = false; // Explicitly NOT correct for scoring purposes
        } else {
            // Determine correctness
            // Strict mapping: All selected options must be correct, and NO incorrect options selected.
            const correctIndices = question.options
                .map((opt, i) => opt.isCorrect ? i : -1)
                .filter(i => i !== -1);

            isExactMatch =
                selectedOptions.length === correctIndices.length &&
                selectedOptions.every(i => correctIndices.includes(i));
        }

        if (!isTextType) {
            setHasAnswered(true);
        }
        setIsCorrect(isExactMatch);

        try {
            const answerData = {
                playerId,
                playerName,
                questionIndex: session.currentQuestionIndex,
                timeTaken: isTextType ? 0 : timeTaken, // 0 time for text types so it doesn't skew stats
                submittedAt: serverTimestamp(),
                isCorrect: isExactMatch
            };

            if (isTextType) {
                answerData.answerText = answerText;
                answerData.type = question.type;
                setAnswerText(""); // Clear input for next submission

                // Show "Sent!" feedback
                setShowFeedback(true);
                setTimeout(() => setShowFeedback(false), 2000);
            } else {
                answerData.selectedOptions = selectedOptions;
                answerData.type = question.type || 'single';
            }

            await addDoc(collection(db, `sessions/${sessionId}/answers`), answerData);
        } catch (error) {
            console.error("Error submitting answer:", error);
        }
    };

    const handleReaction = async (type) => {
        try {
            await addDoc(collection(db, `sessions/${sessionId}/reactions`), {
                type,
                playerId,
                playerName,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error sending reaction:", error);
        }
    };

    // ... (Loading/Waiting/Finished/Reveal screens remain mostly same, check isCorrect logic) ...

    if (!session) return <div className="h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center text-gray-900 dark:text-white transition-colors">Loading...</div>;

    // WAITING SCREEN
    if (session.status === 'waiting') {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-8 text-gray-900 dark:text-white transition-colors relative">
                <button
                    onClick={toggleTheme}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg text-gray-600 dark:text-yellow-400 hover:scale-110 transition-transform z-50 border border-gray-200 dark:border-gray-700"
                    title="Toggle Theme"
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <div className="bg-white dark:bg-slate-800 p-8 rounded-full mb-8 animate-pulse shadow-xl dark:shadow-none">
                    <Coffee className="w-16 h-16 text-primary-500 dark:text-blue-400" />
                </div>
                <h1 className="text-3xl font-bold mb-4">You're in!</h1>
                <p className="text-xl text-gray-500 dark:text-slate-400">See your nickname on screen?</p>
                <div className="mt-8 px-6 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm font-bold border border-gray-200 dark:border-slate-700 shadow-sm">
                    Waiting for host to start...
                </div>
            </div>
        );
    }

    // FINISHED
    if (session.status === 'finished') {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-8 text-gray-900 dark:text-white transition-colors relative">
                <button
                    onClick={toggleTheme}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg text-gray-600 dark:text-yellow-400 hover:scale-110 transition-transform z-50 border border-gray-200 dark:border-gray-700"
                    title="Toggle Theme"
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <h1 className="text-4xl font-bold text-center">Quiz Complete! 🏆</h1>
                <p className="mt-4 text-gray-500 dark:text-slate-400">Check the main screen for the podium.</p>
            </div>
        );
    }

    // REVEAL ANSWER (Feedback to player)
    // REVEAL ANSWER (Feedback to player)
    if (session.status === 'showing_answer') {
        const question = session.questions[session.currentQuestionIndex];
        const isTextType = question.type === 'word_cloud' || question.type === 'open_ended';

        return (
            <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-8 text-gray-900 dark:text-white transition-colors relative">
                <button
                    onClick={toggleTheme}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg text-gray-600 dark:text-yellow-400 hover:scale-110 transition-transform z-50 border border-gray-200 dark:border-gray-700"
                    title="Toggle Theme"
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-8 ${isCorrect ? 'bg-green-100 dark:bg-green-500 text-green-600 dark:text-white' : 'bg-red-100 dark:bg-red-500 text-red-600 dark:text-white'} animate-scale-in`}>
                    {isCorrect ? <CheckCircle2 className="w-16 h-16" /> : <XCircle className="w-16 h-16" />}
                </div>
                <h2 className="text-3xl font-bold mb-2">
                    {isTextType ? "Submitted!" : (isCorrect ? "Correct!" : "Wrong!")}
                </h2>
                <p className="text-gray-500 dark:text-slate-400">
                    {isTextType ? "Check the big screen in front." : (isCorrect ? "You got it right!" : "Better luck next time")}
                </p>
                <div className="mt-20 animate-bounce text-gray-400 dark:text-slate-500 text-sm">Waiting for leaderboard...</div>
            </div>
        );
    }

    // RESULTS (Scoreboard on host)
    if (session.status === 'showing_results') {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-8 text-gray-900 dark:text-white transition-colors relative">
                <button
                    onClick={toggleTheme}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg text-gray-600 dark:text-yellow-400 hover:scale-110 transition-transform z-50 border border-gray-200 dark:border-gray-700"
                    title="Toggle Theme"
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <div className="bg-white dark:bg-slate-800 p-8 rounded-full mb-8 shadow-xl dark:shadow-none">
                    <BarChart2 className="w-16 h-16 text-primary-500 dark:text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Leaderboard Updated!</h2>
                <p className="text-gray-500 dark:text-slate-400">Check the big screen to see who's winning.</p>
            </div>
        );
    }

    // ACTIVE QUESTION
    const question = session.questions[session.currentQuestionIndex];
    const isMulti = question.type === 'multiple';
    const isTextType = question.type === 'word_cloud' || question.type === 'open_ended';

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col items-center p-4 transition-colors duration-300 relative">
            {/* Theme Toggle */}
            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 p-2 rounded-full bg-white dark:bg-gray-800 shadow-md text-gray-600 dark:text-yellow-400 hover:scale-110 transition-transform z-50 border border-gray-200 dark:border-gray-700"
                title="Toggle Theme"
            >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <div className="w-full max-w-3xl flex flex-col flex-1 relative">

                {/* Header */}
                <div className="flex justify-between items-center text-gray-900 dark:text-white mb-6 pt-2">
                    <div className="text-sm text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                        Question {session.currentQuestionIndex + 1}
                    </div>
                    {/* Timer Display */}
                    <div className={`text-xl font-black font-mono px-4 py-2 rounded-xl border-2 flex items-center justify-center transition-all ${timeLeft !== null && timeLeft <= 5 ? 'text-red-500 border-red-500 animate-pulse' : 'text-primary-500 dark:text-blue-400 border-primary-200 dark:border-blue-400'}`}>
                        {timeLeft === null ? "∞" : timeLeft}
                    </div>
                </div>

                <div className="flex justify-between items-center text-white mb-4">
                    {isMulti && <div className="text-xs bg-purple-600 px-3 py-1 rounded-full font-bold uppercase tracking-wide shadow-lg shadow-purple-900/20">Multi-Select</div>}
                    {isTextType && <div className="text-xs bg-pink-600 px-3 py-1 rounded-full font-bold uppercase tracking-wide shadow-lg shadow-pink-900/20">{question.type === 'word_cloud' ? 'Word Cloud' : 'Open Ended'}</div>}
                </div>

                {/* Question Area */}
                <div className="bg-white dark:bg-slate-800/50 backdrop-blur-sm p-6 md:p-8 rounded-3xl mb-8 border border-gray-200 dark:border-slate-700/50 relative overflow-hidden flex flex-col items-center gap-6 shadow-2xl transition-colors">
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
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center leading-tight whitespace-pre-wrap">{question.text}</h2>
                        <div className={`text-sm font-mono font-bold px-4 py-1.5 rounded-full border ${timeLeft !== null && timeLeft <= 5 ? 'text-red-400 border-red-500/30 bg-red-500/10 animate-pulse' : 'text-primary-500 dark:text-cyan-400 border-primary-200 dark:border-cyan-500/30 bg-primary-50 dark:bg-cyan-500/10'}`}>
                            {timeLeft === null ? "Infinite Time" : `${timeLeft}s remaining`}
                        </div>
                    </div>
                </div>

                {/* Answers Grid */}
                {/* Answers Input Area */}
                <div className="pb-32 w-full">
                    {isTextType ? (
                        <div className="w-full">
                            <textarea
                                value={answerText}
                                onChange={(e) => setAnswerText(e.target.value)}
                                disabled={hasAnswered || (timeLeft !== null && timeLeft === 0)}
                                placeholder={question.type === 'word_cloud' ? "Type a word... (Max 30 chars)" : "Type your answer here..."}
                                className="w-full bg-white dark:bg-slate-800/80 border border-gray-300 dark:border-slate-600 rounded-2xl p-6 text-gray-900 dark:text-white text-xl outline-none focus:border-primary-500 dark:focus:border-blue-500 focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-blue-500/20 transition-all placeholder-gray-400 dark:placeholder-slate-500 resize-none min-h-[150px]"
                                maxLength={question.type === 'word_cloud' ? 30 : 280}
                            />
                            <div className="text-right text-slate-500 text-sm mt-2">
                                {answerText.length} / {question.type === 'word_cloud' ? 30 : 280}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {question.options.map((opt, i) => {
                                const isSelected = selectedOptions.includes(i);
                                return (
                                    <button
                                        key={i}
                                        disabled={hasAnswered || (timeLeft !== null && timeLeft === 0)}
                                        onClick={() => toggleOption(i)}
                                        className={`
                                            p-5 rounded-2xl font-bold text-lg text-left shadow-lg transition-all transform group relative overflow-hidden flex flex-col gap-3
                                            ${hasAnswered
                                                ? (isSelected
                                                    ? 'bg-primary-600 dark:bg-blue-600 ring-4 ring-primary-500/30 dark:ring-blue-500/30 scale-100 z-10 text-white'
                                                    : 'bg-gray-100 dark:bg-slate-800/80 opacity-50 grayscale text-gray-500 dark:text-slate-400')
                                                : (isSelected
                                                    ? 'bg-primary-600 dark:bg-blue-600 ring-4 ring-primary-500/30 dark:ring-blue-500/30 scale-[1.02] shadow-primary-900/20 dark:shadow-blue-900/20 z-10 text-white'
                                                    : 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 hover:scale-[1.02] hover:shadow-xl border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 text-gray-900 dark:text-white')
                                            }
                                        `}
                                    >
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
                                            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${isSelected ? 'border-white bg-white text-primary-600 dark:text-blue-600' : 'border-gray-300 dark:border-slate-500 group-hover:border-gray-400 dark:group-hover:border-slate-400'}`}>
                                                {isSelected && <CheckCircle2 className="w-5 h-5" />}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Submit Button Fixed Container */}
                <div className="fixed bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent z-50 pointer-events-none flex justify-center safe-pb">
                    <div className="w-full max-w-3xl pointer-events-auto">
                        <button
                            onClick={handleSubmitAnswer}
                            disabled={hasAnswered || (timeLeft !== null && timeLeft === 0) || (!isTextType && selectedOptions.length === 0) || (isTextType && !answerText.trim())}
                            className={`w-full text-white text-xl font-bold py-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2
                                ${hasAnswered || (timeLeft !== null && timeLeft === 0) || (!isTextType && selectedOptions.length === 0) || (isTextType && !answerText.trim())
                                    ? 'bg-gray-300 dark:bg-slate-800 text-gray-500 dark:text-slate-500 cursor-not-allowed'
                                    : (showFeedback ? 'bg-green-500 ring-4 ring-green-500/30' : 'bg-gradient-to-r from-primary-600 to-purple-600 dark:from-blue-600 dark:to-indigo-600 hover:from-primary-500 hover:to-purple-500 dark:hover:from-blue-500 dark:hover:to-indigo-500 shadow-primary-900/20 dark:shadow-blue-900/20')
                                }
                            `}
                        >
                            {hasAnswered ? "Answer Submitted" : (showFeedback ? "Sent!" : (isTextType ? "Submit" : "Submit Answer"))}
                        </button>
                    </div>

                    {/* Reaction Bar */}
                    <div className="absolute right-0 bottom-full mb-4 flex gap-2 justify-center w-full pointer-events-auto">
                        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur p-2 rounded-full shadow-lg border border-gray-200 dark:border-slate-700 flex gap-2">
                            <ReactionButton emoji="❤️" type="heart" onClick={() => handleReaction('heart')} />
                            <ReactionButton emoji="👍" type="like" onClick={() => handleReaction('like')} />
                            <ReactionButton emoji="😂" type="laugh" onClick={() => handleReaction('laugh')} />
                            <ReactionButton emoji="😮" type="wow" onClick={() => handleReaction('wow')} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper Component for Reaction Button
const ReactionButton = ({ emoji, onClick }) => (
    <button
        onClick={onClick}
        className="w-10 h-10 flex items-center justify-center text-xl hover:scale-125 transition-transform active:scale-95 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
    >
        {emoji}
    </button>
);

export default GameView;
