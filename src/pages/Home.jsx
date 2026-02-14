import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Users, Tv, Sun, Moon } from 'lucide-react';
import { auth } from '../firebase';
import { useTheme } from '../context/ThemeContext';

const Home = () => {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                navigate('/admin');
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 relative">
            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 p-3 rounded-full bg-white dark:bg-gray-800 shadow-lg text-gray-800 dark:text-yellow-400 hover:scale-110 transition-transform z-50 border border-gray-200 dark:border-gray-700"
                title="Toggle Theme"
            >
                {theme === 'dark' ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </button>
            <div className="max-w-4xl w-full text-center space-y-12">

                <div className="space-y-4 animate-fade-in-up flex flex-col items-center">
                    <img src="/logo.jpg" alt="Hitam Ai Logo" className="w-24 h-24 rounded-full shadow-lg mb-4" />
                    <h1 className="text-6xl md:text-7xl font-extrabold bg-gradient-to-r from-primary-600 via-purple-600 to-primary-600 dark:from-primary-400 dark:via-purple-400 dark:to-secondary-400 bg-clip-text text-transparent pb-2 drop-shadow-sm">
                        Hitam Ai Mentimeter
                    </h1>
                    <p className="text-xl text-gray-600 dark:text-gray-300 font-medium max-w-2xl mx-auto">
                        Interactive presentations & quizzes, powered by real-time sync.
                    </p>
                </div>

                <div className="flex justify-center max-w-2xl mx-auto">
                    {/* Join Game Card */}
                    <Link to="/join" className="group relative p-8 bg-white dark:bg-gray-800/40 backdrop-blur-xl rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-all border border-gray-200 dark:border-gray-700/50 hover:border-primary-500 overflow-hidden shadow-2xl hover:shadow-primary-500/20 w-full max-w-md">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity duration-500">
                            <Users className="w-32 h-32 text-primary-500 transform group-hover:rotate-12 transition-transform" />
                        </div>
                        <div className="text-left space-y-4 relative z-10">
                            <div className="w-14 h-14 bg-primary-100 dark:bg-primary-500/20 rounded-2xl flex items-center justify-center text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/30">
                                <Users className="w-7 h-7" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Join a Game</h2>
                                <p className="text-gray-600 dark:text-gray-400 h-12">Enter a code to join an existing session and start playing immediately.</p>
                            </div>
                            <span className="inline-flex items-center gap-2 text-primary-600 dark:text-primary-400 font-bold group-hover:translate-x-2 transition-transform">
                                Join now <span className="text-xl">&rarr;</span>
                            </span>
                        </div>
                    </Link>
                </div>

            </div>
        </div>
    );
};

export default Home;
