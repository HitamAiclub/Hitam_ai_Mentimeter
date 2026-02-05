import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ArrowRight, User, Hash, Mail, Type } from 'lucide-react';

const JoinGame = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1); // 1: PIN, 2: Details
    const [pin, setPin] = useState("");
    const [loading, setLoading] = useState(false);
    const [sessionData, setSessionData] = useState(null);

    // Dynamic Form Data
    const [formData, setFormData] = useState({});
    const [searchParams] = useSearchParams();

    // Check for PIN in URL
    useEffect(() => {
        const urlPin = searchParams.get("pin");
        if (urlPin) {
            setPin(urlPin);
            verifyPin(urlPin);
        }
    }, [searchParams]);

    // Step 1: Verify PIN
    const verifyPin = async (paramPin) => {
        const pinToVerify = paramPin || pin;
        if (!pinToVerify || pinToVerify.length < 6) return;

        setLoading(true);

        try {
            const q = query(collection(db, "sessions"), where("pin", "==", pinToVerify), where("status", "in", ["waiting", "active"]));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const docData = querySnapshot.docs[0].data();
                const sessionDocId = querySnapshot.docs[0].id;

                setSessionData({ id: sessionDocId, ...docData });
                setStep(2);

                // Initialize form data with default values if needed
                const initialData = {};
                (docData.participantFields || []).forEach(field => {
                    initialData[field.id] = "";
                });
                setFormData(initialData);
                // Also update the local pin state if it came from URL
                if (paramPin) setPin(paramPin);

            } else {
                alert("Invalid or expired PIN");
            }
        } catch (error) {
            console.error("Error joining:", error);
            alert("Error joining game");
        } finally {
            setLoading(false);
        }
    };

    const handlePinSubmit = (e) => {
        e.preventDefault();
        verifyPin();
    };

    // Step 2: Submit Details
    const handleDetailsSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Save to subcollection
            const participantRef = await addDoc(collection(db, `sessions/${sessionData.id}/participants`), {
                ...formData,
                name: formData.name || "Anonymous", // Ensure 'name' exists for simple display
                joinedAt: serverTimestamp(),
                score: 0
            });

            // Store locally for re-joining / persistence
            localStorage.setItem('sessionId', sessionData.id);
            localStorage.setItem('playerId', participantRef.id);
            localStorage.setItem('playerName', formData.name);

            // Navigate to Game View
            navigate(`/play/${sessionData.id}`);

        } catch (error) {
            console.error("Error registering:", error);
            alert("Failed to join session");
        } finally {
            setLoading(false);
        }
    };

    const getIconForType = (type) => {
        switch (type) {
            case 'email': return <Mail className="w-5 h-5 text-gray-400" />;
            case 'number': return <Hash className="w-5 h-5 text-gray-400" />;
            default: return <User className="w-5 h-5 text-gray-400" />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 relative overflow-x-hidden">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-600/20 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[100px]"></div>
            </div>

            <div className="z-10 w-full max-w-md text-center">
                <img src="/logo.jpg" alt="Logo" className="w-20 h-20 rounded-full mx-auto mb-6 shadow-2xl animate-fade-in-up" />
                <h1 className="text-4xl font-black text-center mb-8 tracking-tight">
                    <span className="text-white">Hitam Ai</span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-purple-400">Mentimeter</span>
                </h1>

                <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 p-8 rounded-3xl shadow-2xl">

                    {step === 1 ? (
                        <form onSubmit={handlePinSubmit} className="space-y-6">
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl font-bold text-white">Enter Game PIN</h2>
                                <p className="text-gray-400 text-sm">Join the session using the code on the screen</p>
                            </div>

                            <input
                                type="text"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} // Only numbers, max 6
                                placeholder="000000"
                                className="w-full bg-gray-900/80 border-2 border-gray-700 focus:border-primary-500 rounded-2xl py-4 text-center text-3xl font-bold tracking-[0.5em] text-white outline-none transition-colors placeholder-gray-700"
                                autoFocus
                            />

                            <button
                                type="submit"
                                disabled={loading || pin.length < 6}
                                className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-primary-600/20 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
                            >
                                {loading ? "Finding Session..." : <>Enter <ArrowRight className="w-5 h-5" /></>}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleDetailsSubmit} className="space-y-6 animate-fade-in-up">
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl font-bold text-white">Join {sessionData?.title || "Quiz"}</h2>
                                <p className="text-gray-400 text-sm">Please enter your details to start</p>
                            </div>

                            <div className="space-y-4">
                                {sessionData?.participantFields?.map((field) => (
                                    <div key={field.id} className="space-y-1">
                                        <label className="text-xs font-bold uppercase text-gray-500 ml-1">{field.label}</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                                {getIconForType(field.type)}
                                            </div>
                                            <input
                                                type={field.type || "text"} // Use the configured type!
                                                value={formData[field.id] || ""}
                                                onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                                                required={field.required}
                                                placeholder={`Enter your ${field.label.toLowerCase()}`}
                                                className="w-full bg-gray-900/80 border border-gray-700 focus:border-primary-500 rounded-xl py-3 pl-12 pr-4 text-white outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                ))}

                                {/* Fallback if no fields defined */}
                                {(!sessionData?.participantFields || sessionData.participantFields.length === 0) && (
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                            <User className="w-5 h-5 text-gray-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={formData.name || ""}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            placeholder="Choose a nickname"
                                            className="w-full bg-gray-900/80 border border-gray-700 focus:border-primary-500 rounded-xl py-3 pl-12 pr-4 text-white outline-none transition-colors"
                                        />
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
                            >
                                {loading ? "Joining..." : <>Ready to Play <ArrowRight className="w-5 h-5" /></>}
                            </button>
                        </form>
                    )}

                </div>
            </div>
        </div>
    );
};

export default JoinGame;
