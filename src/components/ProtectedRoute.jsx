import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const ProtectedRoute = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [debugMsg, setDebugMsg] = useState('');

    useEffect(() => {
        // Debug timeout
        const timer = setTimeout(() => {
            if (loading) {
                setDebugMsg("Authentication request timed out. Check your internet connection or console for firebase errors.");
                setLoading(false); // Force stop loading
            }
        }, 5000);

        let unsubscribe;
        try {
            if (!auth) {
                throw new Error("Auth instance not found");
            }
            unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                setUser(currentUser);
                setLoading(false);
                clearTimeout(timer);
            }, (error) => {
                console.error("Auth Error:", error);
                setDebugMsg(`Auth Error: ${error.message}`);
                setLoading(false);
            });
        } catch (err) {
            console.error(err);
            setDebugMsg(`System Error: ${err.message}`);
            setLoading(false);
        }

        return () => {
            if (unsubscribe) unsubscribe();
            clearTimeout(timer);
        };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
                <div className="text-xl font-bold">Verifying Access...</div>
            </div>
        );
    }

    if (debugMsg) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-red-400 p-8 text-center">
                <h2 className="text-2xl font-bold mb-4">Connection Issue</h2>
                <p className="border border-red-500/30 p-4 rounded bg-red-500/10">{debugMsg}</p>
                <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-gray-800 text-white rounded hover:bg-gray-700">
                    Retry
                </button>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

export default ProtectedRoute;
