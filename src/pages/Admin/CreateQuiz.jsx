import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Play, Save, CheckCircle2, X, Clock, ArrowLeft, Settings, Type, Hash, Mail, Upload, Menu } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getAuth } from "firebase/auth";

const CreateQuiz = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();
    const auth = getAuth();

    const [title, setTitle] = useState("New Interactive Quiz");
    const [questions, setQuestions] = useState([
        {
            text: "What is the capital of France?",
            timeLimit: 30,
            type: "single",
            options: [
                { text: "Paris", isCorrect: true },
                { text: "London", isCorrect: false }
            ]
        }
    ]);
    const [participantFields, setParticipantFields] = useState([
        { id: 'name', label: 'Full Name', type: 'text', required: true }
    ]);

    // New Field State
    const [newFieldLabel, setNewFieldLabel] = useState("");
    const [newFieldType, setNewFieldType] = useState("text");

    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false); // Mobile Drawer State

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchQuiz = async () => {
            if (quizId) {
                setLoading(true);
                try {
                    const docRef = doc(db, "quizzes", quizId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setTitle(data.title);
                        setQuestions(data.questions);
                        setParticipantFields(data.participantFields || []);
                    } else {
                        alert("Quiz not found!");
                        navigate('/admin');
                    }
                } catch (error) {
                    console.error("Error loading quiz:", error);
                } finally {
                    setLoading(false);
                }
            }
        };
        fetchQuiz();
    }, [quizId, navigate]);

    const addQuestion = () => {
        setQuestions([...questions, {
            text: "",
            timeLimit: 30,
            type: "single",
            options: [{ text: "", isCorrect: false }, { text: "", isCorrect: false }]
        }]);
    };

    const updateQuestion = (index, field, value) => {
        const newQs = [...questions];
        newQs[index][field] = value;
        setQuestions(newQs);
    };

    const updateOption = (qIndex, oIndex, field, value) => {
        const newQs = [...questions];

        // Exclusivity logic for Single Choice
        if (field === 'isCorrect' && value === true && (!newQs[qIndex].type || newQs[qIndex].type === 'single')) {
            newQs[qIndex].options.forEach((opt, idx) => {
                opt.isCorrect = (idx === oIndex);
            });
        } else {
            newQs[qIndex].options[oIndex][field] = value;
        }

        setQuestions(newQs);
    };

    const addOption = (qIndex) => {
        const newQs = [...questions];
        if (newQs[qIndex].options.length < 4) {
            newQs[qIndex].options.push({ text: "", isCorrect: false });
            setQuestions(newQs);
        }
    };

    const handleAddField = () => {
        if (!newFieldLabel.trim()) return;
        setParticipantFields([...participantFields, {
            id: newFieldLabel.toLowerCase().replace(/\s+/g, '_'),
            label: newFieldLabel,
            type: newFieldType,
            required: true
        }]);
        setNewFieldLabel("");
        setNewFieldType("text");
    };

    const handleSaveQuiz = async () => {
        setSaving(true);
        try {
            const currentUser = auth.currentUser;
            const quizData = {
                title,
                questions,
                participantFields,
                hostId: currentUser ? currentUser.uid : "anonymous_admin",
                updatedAt: serverTimestamp()
            };

            if (quizId) {
                await updateDoc(doc(db, "quizzes", quizId), quizData);
            } else {
                await addDoc(collection(db, "quizzes"), {
                    ...quizData,
                    createdAt: serverTimestamp()
                });
            }
            navigate('/admin');
        } catch (error) {
            console.error("Error saving quiz:", error);
            alert("Failed to save quiz.");
        } finally {
            setSaving(false);
        }
    };

    const handleStartHosting = async () => {
        setLoading(true);
        try {
            const currentUser = auth.currentUser;
            const pin = Math.floor(100000 + Math.random() * 900000).toString();
            const sessionRef = await addDoc(collection(db, "sessions"), {
                pin,
                title,
                hostId: currentUser ? currentUser.uid : "anonymous_admin",
                status: "waiting",
                currentQuestionIndex: 0,
                questions: questions,
                participantFields: participantFields,
                createdAt: serverTimestamp(),
                templateQuizId: quizId || null
            });
            navigate(`/host/${sessionRef.id}`);
        } catch (error) {
            console.error("Error creating session:", error);
            alert("Failed to start session: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const getIconForType = (type) => {
        switch (type) {
            case 'email': return <Mail className="w-3 h-3" />;
            case 'number': return <Hash className="w-3 h-3" />;
            default: return <Type className="w-3 h-3" />;
        }
    };

    // Reusable Upload Helper
    const uploadToCloudinary = async (file) => {
        const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dwva5ae36';
        let uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'Hitam_ai';
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
        const folderPath = `Hitam_ai/Quize/${safeTitle}`;

        const upload = async (preset) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', preset);
            formData.append('folder', folderPath);
            const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error('Upload failed');
            return await res.json();
        };

        try {
            return await upload(uploadPreset);
        } catch (err) {
            console.warn(`Preset ${uploadPreset} failed. Retrying with fallbacks...`);
            const fallbacks = ['ml_default', 'default', 'cloud_default'];
            for (const fb of fallbacks) {
                try {
                    return await upload(fb);
                } catch (e) { continue; }
            }
            throw new Error("All upload attempts failed.");
        }
    };

    const handleImageUpload = async (e, qIndex, isOption = false, oIndex = null) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            if (isOption) {
                // Ideally toggle a specific loading state for this option
            } else {
                updateQuestion(qIndex, 'uploading', true);
            }

            const data = await uploadToCloudinary(file);

            if (data && data.secure_url) {
                if (isOption) {
                    const opt = questions[qIndex].options[oIndex];
                    const currentImages = opt.images || (opt.imageUrl ? [opt.imageUrl] : []);
                    updateOption(qIndex, oIndex, 'images', [...currentImages, data.secure_url]);
                    // Clear legacy single image field to avoid duplication in logic, relying on 'images' now
                    updateOption(qIndex, oIndex, 'imageUrl', null);
                } else {
                    const q = questions[qIndex];
                    const currentImages = q.images || (q.imageUrl ? [q.imageUrl] : []);
                    updateQuestion(qIndex, 'images', [...currentImages, data.secure_url]);
                }
            }
        } catch (error) {
            console.error("Upload error:", error);
            alert("Upload failed: " + error.message);
        } finally {
            if (!isOption) updateQuestion(qIndex, 'uploading', false);
        }
    };

    return (
        <div className="min-h-screen p-4 pt-4 lg:p-8 lg:pt-24 pb-24 max-w-7xl mx-auto flex gap-8 relative">

            {/* Sidebar / Config - Hidden on Mobile, Visible on LG, OR Visible if Mobile Drawer Open */}
            <div className={`
                fixed inset-y-0 left-0 z-[60] w-72 bg-slate-900 border-r border-gray-800 p-6 transform transition-transform duration-300 lg:translate-x-0 lg:static lg:bg-transparent lg:border-none lg:p-0 lg:block lg:w-72 lg:overflow-visible
                ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} shadow-2xl lg:shadow-none
            `}>
                {/* Mobile Close Button */}
                <button onClick={() => setIsMobileSidebarOpen(false)} className="lg:hidden absolute top-4 right-4 text-gray-400 hover:text-white p-2">
                    <X className="w-6 h-6" />
                </button>

                <div className="h-full overflow-y-auto pr-2 scrollbar-hide">
                    <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors font-bold">
                        <ArrowLeft className="w-5 h-5" /> Back to Dashboard
                    </button>

                    {/* Participant Info Config */}
                    <div className="bg-gray-800/60 backdrop-blur border border-gray-700 p-4 rounded-xl shadow-lg">
                        <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-wider mb-4">
                            <Settings className="w-3 h-3" />
                            Player Info Form
                        </div>

                        <div className="space-y-3 mb-4">
                            {participantFields.map((field, i) => (
                                <div key={i} className="flex justify-between items-center bg-gray-900/50 p-3 rounded-lg border border-gray-700/50 group hover:border-gray-600 transition-all">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="text-gray-500 bg-gray-800 p-1.5 rounded">
                                            {getIconForType(field.type)}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm text-gray-200 font-medium truncate">{field.label}</span>
                                            <span className="text-[10px] text-gray-500 uppercase">{field.type}</span>
                                        </div>
                                    </div>
                                    {field.id !== 'name' && (
                                        <button onClick={() => setParticipantFields(participantFields.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="bg-gray-900/30 p-3 rounded-lg border border-gray-700/30 space-y-3">
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Add New Field</div>
                            <input
                                type="text"
                                value={newFieldLabel}
                                onChange={(e) => setNewFieldLabel(e.target.value)}
                                placeholder="Label (e.g. Roll No)"
                                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors"
                            />
                            <div className="flex gap-2">
                                <select
                                    value={newFieldType}
                                    onChange={(e) => setNewFieldType(e.target.value)}
                                    className="bg-gray-900 border border-gray-700 rounded px-2 py-2 text-xs text-white outline-none focus:border-primary-500 flex-1"
                                >
                                    <option value="text">Text</option>
                                    <option value="number">Number</option>
                                    <option value="email">Email</option>
                                </select>
                                <button
                                    onClick={handleAddField}
                                    disabled={!newFieldLabel.trim()}
                                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-2 rounded text-xs font-bold transition-colors"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-800">
                        <div className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-4">Slides ({questions.length})</div>
                        <div className="space-y-3">
                            {questions.map((q, i) => (
                                <div key={i} className="bg-gray-800/40 backdrop-blur border border-gray-700 p-4 rounded-xl cursor-pointer hover:border-primary-500 transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-gray-700 group-hover:bg-primary-500 transition-colors"></div>
                                    <div className="flex justify-between items-center mb-2 pl-3">
                                        <span className="text-xs font-bold text-gray-500">SLIDE {i + 1}</span>
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm("Delete this slide?")) {
                                                const newQs = questions.filter((_, idx) => idx !== i);
                                                setQuestions(newQs);
                                            }
                                        }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-500 transition-all">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="text-xs text-gray-300 truncate pl-3 font-medium">{q.text || "New Question"}</div>
                                </div>
                            ))}
                        </div>
                        <button onClick={addQuestion} className="w-full mt-4 py-3 border-2 border-dashed border-gray-700 rounded-xl text-gray-500 hover:border-primary-500 hover:text-primary-400 transition-all flex items-center justify-center gap-2 text-sm font-bold group">
                            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" /> Add Slide
                        </button>
                        {/* Spacer for bottom mobile nav if needed */}
                        <div className="h-20 lg:hidden"></div>
                    </div>
                </div>
            </div>


            {/* Mobile Sidebar Overlay */}
            {isMobileSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setIsMobileSidebarOpen(false)}
                />
            )}

            {/* Main Editor Area */}
            <div className="flex-1 min-w-0 space-y-8">

                {/* Header Actions */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-900 md:bg-gray-900/80 backdrop-blur-xl p-4 lg:p-6 rounded-2xl border border-gray-800 sticky top-4 lg:top-24 z-50 shadow-2xl">

                    {/* Mobile Menu Button */}
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="flex items-center gap-2 lg:hidden">
                            <button
                                onClick={() => navigate('/admin')}
                                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <button
                                onClick={() => setIsMobileSidebarOpen(true)}
                                className="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                        </div>

                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-transparent text-xl md:text-3xl font-bold outline-none text-white placeholder-gray-600 w-full"
                            placeholder="Enter Presentation Name..."
                        />
                    </div>
                    <div className="flex gap-3 flex-shrink-0">
                        <button
                            onClick={handleSaveQuiz}
                            disabled={saving}
                            className="px-5 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 transition-all flex items-center gap-2 font-bold border border-gray-700"
                        >
                            {saving ? "Saving..." : <><Save className="w-4 h-4" /> Save</>}
                        </button>
                        <button
                            onClick={handleStartHosting}
                            disabled={loading}
                            className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary-500/20 flex items-center gap-2 transition-transform hover:scale-105"
                        >
                            {loading ? "Starting..." : <><Play className="w-5 h-5 fill-current" /> Present</>}
                        </button>
                    </div>
                </div>

                {/* Questions Scroll */}
                <div className="space-y-12 pb-20">
                    {questions.map((q, qIndex) => (
                        <div key={qIndex} className="bg-gray-800/30 backdrop-blur rounded-3xl border border-gray-700/50 p-8 shadow-xl relative group hover:border-gray-600 transition-colors">

                            <div className="absolute -left-4 -top-4 bg-gray-900 border border-gray-700 rounded-full w-10 h-10 flex items-center justify-center font-bold text-gray-400 shadow-lg z-10 text-sm">
                                {qIndex + 1}
                            </div>

                            <div className="space-y-8">
                                <input
                                    type="text"
                                    value={q.text}
                                    onChange={(e) => updateQuestion(qIndex, 'text', e.target.value)}
                                    placeholder="Type your question here..."
                                    className="w-full bg-transparent text-3xl md:text-4xl font-bold text-center outline-none border-b-2 border-gray-700 focus:border-primary-500 pb-4 transition-colors placeholder-gray-600"
                                />

                                {/* Question Images Upload */}
                                <div className="flex flex-col items-center gap-4">
                                    <div className="flex flex-wrap gap-4 justify-center">
                                        {/* Display Existing Images (from array or legacy single) */}
                                        {(q.images || (q.imageUrl ? [q.imageUrl] : [])).map((imgUrl, imgIdx) => (
                                            <div key={imgIdx} className="relative group">
                                                <img src={imgUrl} alt={`Slide ${imgIdx}`} className="h-48 rounded-xl border border-gray-700 object-cover shadow-lg" />
                                                <button
                                                    onClick={() => {
                                                        const currentImages = q.images || (q.imageUrl ? [q.imageUrl] : []);
                                                        const newImages = currentImages.filter((_, i) => i !== imgIdx);
                                                        updateQuestion(qIndex, 'images', newImages);
                                                        updateQuestion(qIndex, 'imageUrl', null); // clear legacy
                                                    }}
                                                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}

                                        {/* Upload Button */}
                                        <div className="h-48 w-48 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-blue-500 hover:text-blue-400 transition-all cursor-pointer relative bg-gray-900/50">
                                            <Upload className="w-8 h-8" />
                                            <span className="text-xs font-bold">
                                                {q.uploading ? "Uploading..." : "Add Image"}
                                            </span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                onChange={(e) => handleImageUpload(e, qIndex)}
                                                disabled={q.uploading}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-500 font-medium">
                                        Tip: You can upload multiple images for a carousel view.
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {q.options.map((opt, oIndex) => (
                                        <div key={oIndex} className={`relative p-1 rounded-2xl transition-all ${opt.isCorrect ? 'bg-gradient-to-r from-green-500 to-green-600 p-[2px]' : 'bg-gray-700/30'}`}>
                                            <div className="bg-gray-900 rounded-2xl p-4 flex items-center gap-3 relative h-full">
                                                <button
                                                    onClick={() => updateOption(qIndex, oIndex, 'isCorrect', !opt.isCorrect)}
                                                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${opt.isCorrect ? 'bg-green-500 border-green-500 text-white' : 'border-gray-600 hover:border-gray-400 text-transparent'}`}
                                                >
                                                    <CheckCircle2 className="w-5 h-5" />
                                                </button>

                                                {/* Option Images Preview */}
                                                {(opt.images || (opt.imageUrl ? [opt.imageUrl] : [])).map((img, idx) => (
                                                    <div key={idx} className="relative group w-12 h-12 flex-shrink-0">
                                                        <img src={img} alt="Opt" className="w-full h-full object-cover rounded-lg border border-gray-700" />
                                                        <button
                                                            onClick={() => {
                                                                const currentImages = opt.images || (opt.imageUrl ? [opt.imageUrl] : []);
                                                                const newImages = currentImages.filter((_, i) => i !== idx);
                                                                updateOption(qIndex, oIndex, 'images', newImages);
                                                                updateOption(qIndex, oIndex, 'imageUrl', null);
                                                            }}
                                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                        >
                                                            <X className="w-2 h-2" />
                                                        </button>
                                                    </div>
                                                ))}

                                                <input
                                                    type="text"
                                                    value={opt.text}
                                                    onChange={(e) => updateOption(qIndex, oIndex, 'text', e.target.value)}
                                                    placeholder={`Option ${oIndex + 1}`}
                                                    className="flex-1 bg-transparent outline-none font-medium text-lg min-w-0"
                                                />

                                                {/* Option Image Upload Trigger */}
                                                <label className="p-2 text-gray-500 hover:text-blue-400 cursor-pointer transition-colors relative">
                                                    <Upload className="w-4 h-4" />
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => handleImageUpload(e, qIndex, true, oIndex)}
                                                    />
                                                </label>

                                                {q.options.length > 2 && (
                                                    <button onClick={() => {
                                                        const newQs = [...questions];
                                                        newQs[qIndex].options = newQs[qIndex].options.filter((_, idx) => idx !== oIndex);
                                                        setQuestions(newQs);
                                                    }} className="text-gray-600 hover:text-red-500 transition-colors">
                                                        <X className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {q.options.length < 4 && (
                                        <button onClick={() => addOption(qIndex)} className="border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-2xl p-4 flex items-center justify-center gap-2 text-gray-500 font-bold hover:bg-gray-800/50 transition-all h-full min-h-[80px]">
                                            <Plus className="w-5 h-5" /> Add Option
                                        </button>
                                    )}
                                </div>

                                <div className="border-t border-gray-700/50 pt-6 flex justify-between items-center">
                                    <div className="flex items-center gap-3 text-sm font-medium text-gray-400 bg-gray-800/50 px-4 py-2 rounded-lg border border-gray-700/50">
                                        <Clock className="w-4 h-4" />
                                        <span>Time Limit:</span>
                                        <select
                                            value={q.timeLimit}
                                            onChange={(e) => updateQuestion(qIndex, 'timeLimit', parseInt(e.target.value))}
                                            className="bg-transparent outline-none text-white font-bold cursor-pointer"
                                        >
                                            <option value={15}>15s</option>
                                            <option value={30}>30s</option>
                                            <option value={45}>45s</option>
                                            <option value={60}>60s</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-3 text-sm font-medium text-gray-400 bg-gray-800/50 px-4 py-2 rounded-lg border border-gray-700/50">
                                        <span className="uppercase text-xs font-bold tracking-wider">Type:</span>
                                        <div className="flex bg-gray-900 rounded-lg p-1">
                                            <button
                                                onClick={() => {
                                                    // When switching to single, ensure only one is correct (keep first correct one, or none)
                                                    updateQuestion(qIndex, 'type', 'single');
                                                    const firstCorrect = q.options.findIndex(o => o.isCorrect);
                                                    if (firstCorrect !== -1) {
                                                        const newOptions = q.options.map((o, idx) => ({ ...o, isCorrect: idx === firstCorrect }));
                                                        updateQuestion(qIndex, 'options', newOptions);
                                                    }
                                                }}
                                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${(!q.type || q.type === 'single') ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Single Answer
                                            </button>
                                            <button
                                                onClick={() => updateQuestion(qIndex, 'type', 'multiple')}
                                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${q.type === 'multiple' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Multiple Choice
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CreateQuiz;
