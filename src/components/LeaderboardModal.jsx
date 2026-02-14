import React, { useState, useEffect } from 'react';
import { X, Trophy, Clock, Loader2, Search } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const LeaderboardModal = ({ session, onClose }) => {
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (session?.id) {
            fetchData();
        }
    }, [session]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Participants
            const pSnapshot = await getDocs(collection(db, `sessions/${session.id}/participants`));
            const participantsData = pSnapshot.docs.map(d => d.data());

            // 2. Fetch Answers
            const aSnapshot = await getDocs(collection(db, `sessions/${session.id}/answers`));
            const answersData = aSnapshot.docs.map(d => d.data());

            // 3. Calculate Stats
            const stats = participantsData.map(p => {
                const playerAnswers = answersData.filter(a => a.playerName === p.name);
                const score = playerAnswers.filter(a => a.isCorrect).length;
                const totalTime = playerAnswers.reduce((sum, a) => sum + (a.timeTaken || 0), 0);

                return {
                    ...p,
                    score,
                    totalTime: parseFloat(totalTime.toFixed(2)),
                    answersCount: playerAnswers.length
                };
            });

            // 4. Sort (Score Desc, Time Asc)
            stats.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.totalTime - b.totalTime;
            });

            // 5. Add Rank
            const ranked = stats.map((p, index) => ({
                ...p,
                rank: index + 1
            }));

            setParticipants(ranked);
        } catch (error) {
            console.error("Error fetching leaderboard:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredParticipants = participants.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-gray-800 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                            <Trophy className="w-8 h-8 text-yellow-500" />
                            {session.title} - Leaderboard
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 ml-11">
                            {new Date(session.createdAt?.seconds * 1000).toLocaleDateString()} • {participants.length} Players
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex gap-4 bg-white dark:bg-gray-800">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search player..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-4">
                            <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                            <p className="text-gray-500">Calculating scores...</p>
                        </div>
                    ) : filteredParticipants.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <Scanner className="w-12 h-12 mb-2 opacity-20" /> {/* Placeholder icon */}
                            <p>No participants found.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm">
                                <tr>
                                    <th className="p-4 pl-6 text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Rank</th>
                                    <th className="p-4 text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Player</th>
                                    <th className="p-4 text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Score</th>
                                    <th className="p-4 pr-6 text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Time (s)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {filteredParticipants.map((p) => (
                                    <tr key={p.name} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${p.rank <= 3 ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}`}>
                                        <td className="p-4 pl-6">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                                                ${p.rank === 1 ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400' :
                                                    p.rank === 2 ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                                                        p.rank === 3 ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400' :
                                                            'bg-transparent text-gray-500 dark:text-gray-400'}`}>
                                                {p.rank}
                                            </div>
                                        </td>
                                        <td className="p-4 font-medium text-gray-900 dark:text-white">
                                            {p.name}
                                            {p.rank === 1 && <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Winner</span>}
                                        </td>
                                        <td className="p-4 text-right font-bold text-primary-600 dark:text-primary-400 text-lg">
                                            {p.score}
                                        </td>
                                        <td className="p-4 pr-6 text-right font-mono text-gray-500 dark:text-gray-400 flex items-center justify-end gap-2">
                                            <Clock className="w-3 h-3 opacity-50" />
                                            {p.totalTime}s
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-center text-sm text-gray-500 dark:text-gray-400">
                    Showing top {filteredParticipants.length} results
                </div>
            </div>
        </div>
    );
};

export default LeaderboardModal;
