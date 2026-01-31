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
    }, [session?.currentQuestionIndex, session?.status]);

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

    // Reset loop for new questions
    useEffect(() => {
        if (session && session.status === 'active') {
            // If we ruled that this is a NEW question (index changed), reset
            // For now, simpler: if status becomes active, we assume it's time to answer.
            // Ideally we track questionIndex to prevent answering the SAME question twice if re-rendered.

            // Check if we submitted an answer for THIS question index?
            // For simplified MVP, we just rely on local state `hasAnswered`.
            // But if user refreshes, `hasAnswered` is lost. 
            // We won't fix refresh-persistence perfectly now, but let's at least reset only when index changes.
        }
    }, [session?.currentQuestionIndex]);

    // When question becomes active, start timer
    useEffect(() => {
        if (session?.status === 'active' && !hasAnswered) {
            setQuestionStartTime(Date.now());
        }
    }, [session?.status, session?.currentQuestionIndex]); // Reset timer on new question

    const [selectedOptions, setSelectedOptions] = useState([]); // Array of indices

    // Reset loop for new questions
    useEffect(() => {
        if (session && session.status === 'active') {
            // New question became active?
        }
    }, [session?.currentQuestionIndex]);

    // Handle "New Question" reset
    const [lastQuestionIndex, setLastQuestionIndex] = useState(-1);
    if (session && session.currentQuestionIndex !== lastQuestionIndex) {
        setHasAnswered(false);
        setIsCorrect(null);
        setSelectedOptions([]);
        setLastQuestionIndex(session.currentQuestionIndex);
        setQuestionStartTime(Date.now());
    }

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
        <div className="min-h-screen bg-slate-900 flex flex-col p-4">
            {/* Header */}
            <div className="flex justify-between items-center text-white mb-8 pt-4">
                <div className="text-sm text-slate-400 font-bold uppercase tracking-wider">
                    Q{session.currentQuestionIndex + 1}
                </div>
                {isMulti && <div className="text-xs bg-purple-600 px-2 py-1 rounded font-bold uppercase">Multi-Select</div>}
            </div>

            {/* Question Text */}
            <div className="bg-slate-800/50 p-6 rounded-2xl mb-8 border border-slate-700 relative overflow-hidden flex flex-col items-center gap-6">
                {/* Progress Bar */}
                <div className="absolute top-0 left-0 h-1 bg-blue-600 transition-all duration-1000 linear" style={{ width: `${(timeLeft / (question.timeLimit || 30)) * 100}%` }}></div>

                {question.imageUrl && (
                    <img src={question.imageUrl} alt="Question" className="max-h-64 rounded-xl border border-slate-700 shadow-lg object-contain w-full" />
                )}

                <div className="flex justify-between items-start w-full">
                    <h2 className="text-xl md:text-2xl font-bold text-white text-center flex-1">{question.text}</h2>
                </div>

                <div className={`text-sm font-mono font-bold px-3 py-1 rounded-full ${timeLeft <= 5 ? 'text-red-500 bg-red-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                    {timeLeft}s
                </div>
            </div>

            {/* Answers Grid */}
            <div className="grid grid-cols-1 gap-4 flex-1 content-start pb-24">
                {question.options.map((opt, i) => {
                    const isSelected = selectedOptions.includes(i);
                    return (
                        <button
                            key={i}
                            disabled={hasAnswered || timeLeft === 0}
                            onClick={() => toggleOption(i)}
                            className={`
                                p-6 rounded-xl font-bold text-lg text-left shadow-lg transition-all transform flex justify-between items-center
                                ${hasAnswered
                                    ? (isSelected
                                        ? 'bg-blue-600 ring-4 ring-blue-400/50 scale-100'
                                        : 'bg-slate-800 opacity-50 grayscale')
                                    : (isSelected
                                        ? 'bg-blue-600 ring-2 ring-blue-400 scale-[1.02]'
                                        : 'bg-slate-700 hover:bg-slate-600 hover:scale-[1.01]')
                                }
                            `}
                        >
                            <span>{opt.text}</span>
                            {/* Checkbox/Radio Icon */}
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-white bg-white text-blue-600' : 'border-slate-500'}`}>
                                {isSelected && <CheckCircle2 className="w-4 h-4" />}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Submit Button (Always shown for clarity, or update logic to auto-submit for single?) 
                Let's use Explicit Submit for everything to avoid accidental clicks, 
                OR Auto-submit for single if desired. 
                For now -> Explicit Submit is safer for UX unless requested otherwise. 
            */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/80 backdrop-blur border-t border-slate-800">
                <button
                    onClick={handleSubmitAnswer}
                    disabled={hasAnswered || timeLeft === 0 || selectedOptions.length === 0}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xl font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95"
                >
                    {hasAnswered ? "Answer Submitted" : "Submit Answer"}
                </button>
            </div>
        </div>
    );
};

export default GameView;
