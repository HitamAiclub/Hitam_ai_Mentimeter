import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from '../../firebase';
import { Lock, ArrowRight } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                navigate('/admin');
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await setPersistence(auth, browserLocalPersistence);
            await signInWithEmailAndPassword(auth, email, password);
            navigate('/admin');
        } catch (err) {
            setError('Invalid email or password.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-gray-800/40 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-gray-700/50 w-full max-w-md space-y-8 animate-fade-in-up">

                <div className="text-center space-y-2">
                    <div className="bg-primary-500/20 p-4 rounded-2xl inline-flex mb-2 ring-1 ring-primary-500/30">
                        <Lock className="w-8 h-8 text-primary-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-white">Admin Login</h1>
                    <p className="text-gray-400">Sign in to manage and host quizzes</p>
                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 text-red-500 text-sm rounded-xl border border-red-500/20 flex items-center gap-2">
                        <span>!</span> {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300 ml-1">Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-3 bg-gray-900/50 border border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-white placeholder-gray-500 transition-all"
                            placeholder="admin@example.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-300 ml-1">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 bg-gray-900/50 border border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-white placeholder-gray-500 transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2 group"
                    >
                        {loading ? "Signing in..." : "Access Dashboard"}
                        {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                    </button>
                </form>

            </div>
        </div>
    );
};

export default Login;
