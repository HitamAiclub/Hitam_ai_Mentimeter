import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Play, MoreVertical, Trash2, Edit, Loader2, Home, FileText, Users, LogOut, BarChart2, Download, Clock, Activity } from 'lucide-react';
import { collection, query, orderBy, getDocs, deleteDoc, doc, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { getAuth, signOut } from 'firebase/auth';

const Dashboard = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const auth = getAuth();

    // Active Tab State
    const [activeTab, setActiveTab] = useState('home');

    // Data States
    const [quizzes, setQuizzes] = useState([]);
    const [sessions, setSessions] = useState([]); // All session history
    const [activeSessions, setActiveSessions] = useState([]); // Currently active

    const [loadingQuizzes, setLoadingQuizzes] = useState(false);
    const [loadingSessions, setLoadingSessions] = useState(false);

    // Initial Fetch
    useEffect(() => {
        fetchQuizzes();
        fetchSessions();
    }, []);

    const fetchQuizzes = async () => {
        setLoadingQuizzes(true);
        try {
            const q = query(collection(db, "quizzes"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const quizList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setQuizzes(quizList);
        } catch (error) {
            console.error("Error fetching quizzes:", error);
        } finally {
            setLoadingQuizzes(false);
        }
    };

    const fetchSessions = async () => {
        setLoadingSessions(true);
        try {
            const q = query(collection(db, "sessions"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const sessionList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setSessions(sessionList);

            // Filter for active/waiting sessions
            const active = sessionList.filter(s => s.status === 'waiting' || s.status === 'active' || s.status === 'showing_results');
            setActiveSessions(active);

        } catch (error) {
            console.error("Error fetching sessions:", error);
        } finally {
            setLoadingSessions(false);
        }
    };

    const handleDelete = async (quizId, e) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this quiz?")) {
            try {
                await deleteDoc(doc(db, "quizzes", quizId));
                setQuizzes(quizzes.filter(q => q.id !== quizId));
            } catch (error) {
                console.error("Error deleting quiz:", error);
                alert("Failed to delete.");
            }
        }
    };

    const handleHost = async (quiz, e) => {
        e.stopPropagation();
        try {
            const currentUser = auth.currentUser;
            const pin = Math.floor(100000 + Math.random() * 900000).toString();

            // Create a new session from this quiz template
            const sessionRef = await addDoc(collection(db, "sessions"), {
                pin,
                title: quiz.title,
                hostId: currentUser ? currentUser.uid : "anonymous_admin",
                status: "waiting",
                currentQuestionIndex: 0,
                questions: quiz.questions,
                participantFields: quiz.participantFields || [],
                createdAt: serverTimestamp(),
                templateQuizId: quiz.id
            });

            navigate(`/host/${sessionRef.id}`);
        } catch (error) {
            console.error("Error hosting quiz:", error);
            alert("Failed to start session.");
        }
    };

    const handleDeleteSession = async (sessionId, e) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this session? This renders the report unavailable permanently.")) {
            try {
                // Delete Participants Subcollection
                const pSnapshot = await getDocs(collection(db, `sessions/${sessionId}/participants`));
                const pDeletePromises = pSnapshot.docs.map(d => deleteDoc(doc(db, `sessions/${sessionId}/participants`, d.id)));
                await Promise.all(pDeletePromises);

                // Delete Answers Subcollection
                const aSnapshot = await getDocs(collection(db, `sessions/${sessionId}/answers`));
                const aDeletePromises = aSnapshot.docs.map(d => deleteDoc(doc(db, `sessions/${sessionId}/answers`, d.id)));
                await Promise.all(aDeletePromises);

                // Delete Session Doc
                await deleteDoc(doc(db, "sessions", sessionId));

                // Update State
                setSessions(sessions.filter(s => s.id !== sessionId));
                setActiveSessions(activeSessions.filter(s => s.id !== sessionId));

            } catch (error) {
                console.error("Error deleting session:", error);
                alert("Failed to delete session data.");
            }
        }
    };

    const handleDownloadCSV = async (session) => {
        try {
            const pSnapshot = await getDocs(collection(db, `sessions/${session.id}/participants`));
            const participants = pSnapshot.docs.map(d => d.data());

            const aSnapshot = await getDocs(collection(db, `sessions/${session.id}/answers`));
            const answers = aSnapshot.docs.map(d => d.data());

            // 3. Construct CSV Data
            const customFieldKeys = session.participantFields?.filter(f => f.id !== 'name').map(f => f.id) || [];

            // Calculate stats for each participant
            const participantStats = participants.map(p => {
                const playerAnswers = answers.filter(a => a.playerName === p.name);
                const score = playerAnswers.filter(a => a.isCorrect).length;
                const totalTime = playerAnswers.reduce((sum, a) => sum + (a.timeTaken || 0), 0);
                return {
                    ...p,
                    score,
                    totalTime: parseFloat(totalTime.toFixed(2))
                };
            });

            // Sort by Score (Desc) then Time (Asc)
            participantStats.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score; // Higher score first
                }
                return a.totalTime - b.totalTime; // Lower time first
            });

            // Add Rank
            const rankedParticipants = participantStats.map((p, index) => ({
                rank: index + 1,
                ...p
            }));

            const headers = ['Rank', 'Name', 'Score', 'Total Time (s)', ...customFieldKeys];

            const rows = rankedParticipants.map(p => {
                return [
                    p.rank,
                    p.name,
                    p.score,
                    p.totalTime,
                    ...customFieldKeys.map(k => p[k] || "")
                ];
            });

            const csvContent = [
                headers.join(','),
                ...rows.map(r => r.join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${session.title}_results.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Error downloading CSV:", error);
            alert("Failed to download results.");
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col">

            {/* Top Navigation Bar */}
            <nav className="fixed top-0 w-full bg-gray-900/80 backdrop-blur-xl border-b border-gray-800 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        {/* Logo */}
                        <div className="flex-shrink-0 flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
                            <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-full shadow-lg" />
                            <span className="font-bold text-xl tracking-tight">Hitam Ai Admin</span>
                        </div>

                        {/* Nav Links */}
                        <div className="hidden md:flex space-x-8">
                            <button
                                onClick={() => setActiveTab('home')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${activeTab === 'home' ? 'text-primary-400 bg-primary-500/10' : 'text-gray-400 hover:text-white'}`}
                            >
                                <Home className="w-4 h-4" /> Home
                            </button>
                            <button
                                onClick={() => setActiveTab('quizzes')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${activeTab === 'quizzes' ? 'text-primary-400 bg-primary-500/10' : 'text-gray-400 hover:text-white'}`}
                            >
                                <FileText className="w-4 h-4" /> Quizzes
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${activeTab === 'history' ? 'text-primary-400 bg-primary-500/10' : 'text-gray-400 hover:text-white'}`}
                            >
                                <Clock className="w-4 h-4" /> History
                            </button>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-4">
                            <button onClick={handleLogout} className="text-gray-400 hover:text-red-400 bg-gray-800/50 hover:bg-gray-800 p-2 rounded-lg transition-colors" title="Logout">
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content Area */}
            <div className="flex-1 w-full max-w-7xl mx-auto p-8 pt-24">

                {/* LIVE SESSIONS WIDGET (Always visible if active sessions exist) */}
                {/* HOME TAB: About & Active/Incomplete Sessions */}
                {activeTab === 'home' && (
                    <div className="space-y-8 animate-fade-in">
                        {/* About / Basic Info Section */}
                        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-3xl p-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                            <h1 className="text-4xl font-bold text-white mb-4 relative z-10">Welcome to Hitam Ai Admin</h1>
                            <p className="text-gray-400 text-lg max-w-2xl relative z-10">
                                This is your command center. From here, you can manage your quizzes, view history, and control live sessions.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 relative z-10">
                                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-primary-400 font-bold mb-1">Total Quizzes</div>
                                    <div className="text-2xl text-white">{quizzes.length}</div>
                                </div>
                                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-green-400 font-bold mb-1">Active Sessions</div>
                                    <div className="text-2xl text-white">{activeSessions.length}</div>
                                </div>
                                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                                    <div className="text-blue-400 font-bold mb-1">Completed History</div>
                                    <div className="text-2xl text-white">{sessions.filter(s => s.status === 'finished').length}</div>
                                </div>
                            </div>
                        </div>

                        {/* Incomplete / Active Quizzes Section */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="relative flex h-3 w-3">
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeSessions.length > 0 ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                                    <span className={`relative inline-flex rounded-full h-3 w-3 ${activeSessions.length > 0 ? 'bg-green-500' : 'bg-gray-600'}`}></span>
                                </div>
                                <h2 className="text-xl font-bold text-white">Incomplete / Active Quizzes</h2>
                            </div>

                            {activeSessions.length > 0 ? (
                                <div className="grid gap-4">
                                    {activeSessions.map(session => (
                                        <div key={session.id} onClick={() => navigate(`/host/${session.id}`)} className="bg-gradient-to-r from-green-900/20 to-gray-800/40 border border-green-500/30 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center cursor-pointer hover:border-green-500 hover:shadow-lg hover:shadow-green-900/20 transition-all group">
                                            <div className="flex items-center gap-4 mb-4 md:mb-0">
                                                <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-green-500/20 group-hover:scale-110 transition-transform">
                                                    <Activity className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold text-white">{session.title}</h3>
                                                    <div className="flex items-center gap-4 mt-1">
                                                        <div className="text-sm text-green-300 font-mono bg-green-900/30 px-2 py-0.5 rounded">PIN: {session.pin}</div>
                                                        <div className="text-sm text-gray-400">{session.questions?.length || 0} Questions</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <button className="bg-green-500 hover:bg-green-400 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-green-500/20 hover:scale-105 active:scale-95 w-full md:w-auto">
                                                Resume Quiz
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 bg-gray-800/30 border border-gray-700/50 rounded-2xl text-center">
                                    <div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Activity className="w-8 h-8 text-gray-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">No Active Quizzes</h3>
                                    <p className="text-gray-500 mb-6">You don't have any incomplete live sessions running right now.</p>
                                    <button onClick={() => setActiveTab('quizzes')} className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2 rounded-xl font-bold transition-colors">
                                        Start a New Quiz
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* QUIZZES TAB (Main Dashboard) */}
                {activeTab === 'quizzes' && (
                    <div className="space-y-12 animate-fade-in">
                        <div className="flex justify-between items-end">
                            <div>
                                <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                                    My Quizzes
                                </h1>
                                <p className="text-gray-400 mt-2">Manage draft templates and create new games</p>
                            </div>
                            <button
                                onClick={() => navigate('/admin/create')}
                                className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary-500/20 flex items-center gap-2 transition-transform hover:scale-105"
                            >
                                <Plus className="w-5 h-5" />
                                New Quiz
                            </button>
                        </div>

                        {loadingQuizzes ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                            </div>
                        ) : quizzes.length === 0 ? (
                            <div className="bg-gray-800/20 border border-gray-700/50 border-dashed rounded-3xl p-12 text-center space-y-6">
                                <Plus className="w-12 h-12 text-gray-600 mx-auto" />
                                <h3 className="text-xl font-bold text-white">No quizzes yet</h3>
                                <button onClick={() => navigate('/admin/create')} className="text-primary-400 hover:text-primary-300 font-bold hover:underline">Create one now</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {quizzes.map((quiz) => (
                                    <div key={quiz.id} className="bg-gray-800/40 backdrop-blur border border-gray-700/50 p-6 rounded-2xl flex flex-col justify-between h-full min-h-[200px] group hover:border-primary-500/50 transition-all">
                                        <div>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="w-12 h-12 bg-gray-700/50 rounded-xl flex items-center justify-center text-primary-400">
                                                    <FileText className="w-6 h-6" />
                                                </div>
                                                <button onClick={(e) => handleDelete(quiz.id, e)} className="p-2 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <h3 className="text-xl font-bold text-white group-hover:text-primary-400 transition-colors line-clamp-2 mb-2">{quiz.title}</h3>
                                            <div className="text-sm text-gray-500">{quiz.questions?.length || 0} Slides</div>
                                        </div>
                                        <div className="pt-4 mt-4 border-t border-gray-700/50 flex gap-2">
                                            <button onClick={(e) => handleHost(quiz, e)} className="flex-1 bg-primary-600/90 hover:bg-primary-500 text-white py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary-500/10">Host Live</button>
                                            <button onClick={() => navigate(`/admin/edit/${quiz.id}`)} className="p-2 px-4 bg-gray-700/30 hover:bg-gray-700/50 text-gray-300 hover:text-white rounded-lg transition-all text-sm font-bold flex items-center gap-2">
                                                <Edit className="w-4 h-4" /> Edit
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* HISTORY (Sessions) TAB */}
                {activeTab === 'history' && (
                    <div className="space-y-12 animate-fade-in">
                        <div>
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                                Session History
                            </h1>
                            <p className="text-gray-400 mt-2">View all active and past quiz sessions</p>
                        </div>

                        {loadingSessions ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="text-center py-20 text-gray-500">No sessions found.</div>
                        ) : (
                            <div className="grid gap-4">
                                {sessions.map((session) => (
                                    <div key={session.id} className="bg-gray-800/40 backdrop-blur border border-gray-700/50 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-800/60 transition-colors">
                                        <div className="flex items-center gap-6">
                                            <div className="w-12 h-12 bg-gray-700/30 rounded-xl flex items-center justify-center text-gray-400 font-bold text-xl">
                                                {session.title?.[0]}
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-white">{session.title}</h3>
                                                <div className="text-sm text-gray-400 flex gap-4 mt-1">
                                                    <span className="font-mono bg-gray-700/50 px-2 rounded text-xs py-0.5">PIN: {session.pin}</span>
                                                    <span>{session.createdAt?.toDate().toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 justify-between md:justify-end w-full md:w-auto">
                                            <div className={`text-sm font-bold px-3 py-1 rounded-full ${session.status === 'finished' ? 'bg-gray-700 text-gray-400' : 'bg-green-500/20 text-green-400 animate-pulse'}`}>
                                                {session.status === 'finished' ? 'Completed' : 'Live'}
                                            </div>
                                            {session.status !== 'finished' && (
                                                <button onClick={() => navigate(`/host/${session.id}`)} className="text-green-400 hover:text-green-300 text-sm font-bold hover:underline">
                                                    Resume
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDownloadCSV(session)}
                                                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors border border-gray-600"
                                            >
                                                <Download className="w-4 h-4" /> CSV
                                            </button>

                                            <button
                                                onClick={(e) => handleDeleteSession(session.id, e)}
                                                className="p-2 bg-gray-700 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-lg transition-colors border border-gray-600 hover:border-red-500/50"
                                                title="Delete Session Data"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};

export default Dashboard;
