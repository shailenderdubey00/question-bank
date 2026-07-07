import React, { useState, useEffect } from 'react';
import { api, generateUUID } from '../lib/db';
import { Question, Topic, Test, Profile } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Shield, Plus, Edit, Trash2, Search, Filter, Upload, Users, ListFilter, AlertCircle, CheckCircle2, Download, BarChart4, FileSpreadsheet, RefreshCw } from 'lucide-react';

interface AdminDashboardProps {
  profile: Profile;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ profile, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'questions' | 'csv' | 'users'>('analytics');
  
  // Data States
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');

  // CRUD Question Modal State
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState({
    question: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_option: 'A' as 'A' | 'B' | 'C' | 'D',
    explanation: '',
    difficulty: 'Easy' as 'Easy' | 'Medium' | 'Hard',
    topic_id: '',
    marks: 1,
    negative_marks: 0.25,
  });

  // CSV Importer State
  const [csvText, setCsvText] = useState('');
  const [importSummary, setImportSummary] = useState<{
    successCount: number;
    failedRows: { row: number; reason: string; data?: string }[];
    importedQuestions: any[];
  } | null>(null);

  // Load Admin Data
  const loadAdminData = async () => {
    setLoading(true);
    const qs = await api.getQuestions();
    const ts = await api.getTopics();
    const tsts = await api.getAllTests();
    
    // Get users from localStorage profiles table safely
    const profiles = JSON.parse(localStorage.getItem('os_qbank_profiles') || '[]');
    setUsers(profiles);
    
    setQuestions(qs);
    setTopics(ts);
    setTests(tsts);

    if (ts.length > 0 && !formData.topic_id) {
      setFormData((prev) => ({ ...prev, topic_id: ts[0].id }));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Update marks & negative marks based on difficulty standard defaults
  const handleDifficultyChange = (diff: 'Easy' | 'Medium' | 'Hard') => {
    let m = 1;
    let nm = 0.25;
    if (diff === 'Medium') {
      m = 2;
      nm = 0.50;
    } else if (diff === 'Hard') {
      m = 3;
      nm = 1.0;
    }
    setFormData((prev) => ({
      ...prev,
      difficulty: diff,
      marks: m,
      negative_marks: nm,
    }));
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.question || !formData.option_a || !formData.option_b || !formData.topic_id) {
      alert('Please fill out all required fields');
      return;
    }

    if (editingQuestion) {
      const updated = await api.updateQuestion(editingQuestion.id, formData);
      if (updated) {
        alert('Question updated successfully!');
      }
    } else {
      await api.addQuestion(formData);
      alert('Question added successfully!');
    }

    setShowForm(false);
    setEditingQuestion(null);
    setFormData({
      question: '',
      option_a: '',
      option_b: '',
      option_c: '',
      option_d: '',
      correct_option: 'A',
      explanation: '',
      difficulty: 'Easy',
      topic_id: topics[0]?.id || '',
      marks: 1,
      negative_marks: 0.25,
    });
    loadAdminData();
  };

  const handleEditClick = (q: Question) => {
    setEditingQuestion(q);
    setFormData({
      question: q.question,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_option: q.correct_option,
      explanation: q.explanation,
      difficulty: q.difficulty,
      topic_id: q.topic_id,
      marks: q.marks,
      negative_marks: q.negative_marks,
    });
    setShowForm(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (confirm('⚠️ Are you sure you want to delete this question? This action is irreversible.')) {
      const success = await api.deleteQuestion(id);
      if (success) {
        alert('Question deleted successfully.');
        loadAdminData();
      }
    }
  };

  // CSV Bulk Parsing & Validation
  const handleCSVImport = async () => {
    if (!csvText.trim()) {
      alert('Please paste or upload some CSV text.');
      return;
    }

    const lines = csvText.split('\n');
    if (lines.length < 2) {
      alert('CSV must contain a header row and at least one data row.');
      return;
    }

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
    
    // Required columns
    const requiredCols = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option', 'explanation', 'difficulty', 'topic'];
    const missing = requiredCols.filter((col) => !header.includes(col));
    if (missing.length > 0) {
      alert(`Invalid CSV headers. Missing required columns: ${missing.join(', ')}`);
      return;
    }

    const findIndex = (col: string) => header.indexOf(col);
    const qIdx = findIndex('question');
    const aIdx = findIndex('option_a');
    const bIdx = findIndex('option_b');
    const cIdx = findIndex('option_c');
    const dIdx = findIndex('option_d');
    const ansIdx = findIndex('correct_option');
    const expIdx = findIndex('explanation');
    const diffIdx = findIndex('difficulty');
    const topicIdx = findIndex('topic');

    let successCount = 0;
    const failedRows: { row: number; reason: string; data?: string }[] = [];
    const importedQuestions: any[] = [];

    const existingQuestions = questions.map((q) => q.question.toLowerCase().trim());
    const dbQuestions = JSON.parse(localStorage.getItem('os_qbank_questions') || '[]');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle CSV cell splitting with commas inside quotes safely
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const cells = matches.map((c) => c.replace(/^"|"$/g, '').trim());

      if (cells.length < requiredCols.length) {
        failedRows.push({ row: i + 1, reason: 'Incomplete columns on this row', data: line });
        continue;
      }

      const qText = cells[qIdx];
      const optA = cells[aIdx];
      const optB = cells[bIdx];
      const optC = cells[cIdx];
      const optD = cells[dIdx];
      const correctAns = cells[ansIdx]?.toUpperCase() as 'A' | 'B' | 'C' | 'D';
      const explanation = cells[expIdx];
      const diff = cells[diffIdx];
      const topicName = cells[topicIdx];

      // Validation
      if (!qText || !optA || !optB || !correctAns || !topicName) {
        failedRows.push({ row: i + 1, reason: 'Missing mandatory fields', data: line });
        continue;
      }

      if (!['A', 'B', 'C', 'D'].includes(correctAns)) {
        failedRows.push({ row: i + 1, reason: `Invalid correct option '${correctAns}' (must be A, B, C, or D)`, data: line });
        continue;
      }

      const parsedDiff = (diff && ['Easy', 'Medium', 'Hard'].includes(diff) ? diff : 'Easy') as 'Easy' | 'Medium' | 'Hard';

      // Check for duplicates
      if (existingQuestions.includes(qText.toLowerCase().trim())) {
        failedRows.push({ row: i + 1, reason: 'Duplicate question text already exists in database', data: qText });
        continue;
      }

      // Check / Create Topic
      let matchedTopic = topics.find((t) => t.name.toLowerCase() === topicName.toLowerCase());
      if (!matchedTopic) {
        // Create topic on the fly to support smooth uploads!
        matchedTopic = await api.addTopic(topicName);
        // Refresh topics list locally
        topics.push(matchedTopic);
      }

      // Standardize scores based on difficulty rules
      let marks = 1;
      let negMarks = 0.25;
      if (parsedDiff === 'Medium') {
        marks = 2;
        negMarks = 0.5;
      } else if (parsedDiff === 'Hard') {
        marks = 3;
        negMarks = 1.0;
      }

      const newQ: Question = {
        id: generateUUID(),
        question: qText,
        option_a: optA,
        option_b: optB,
        option_c: optC || '',
        option_d: optD || '',
        correct_option: correctAns,
        explanation: explanation || 'Pedagogical Explanation pending.',
        difficulty: parsedDiff,
        topic_id: matchedTopic.id,
        marks,
        negative_marks: negMarks,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      dbQuestions.push(newQ);
      importedQuestions.push(newQ);
      successCount++;
    }

    if (successCount > 0) {
      localStorage.setItem('os_qbank_questions', JSON.stringify(dbQuestions));
    }

    setImportSummary({
      successCount,
      failedRows,
      importedQuestions,
    });

    loadAdminData();
  };

  const handlePromoteUser = (userId: string) => {
    const profiles = JSON.parse(localStorage.getItem('os_qbank_profiles') || '[]');
    const index = profiles.findIndex((p: any) => p.id === userId);
    if (index !== -1) {
      profiles[index].role = profiles[index].role === 'admin' ? 'student' : 'admin';
      localStorage.setItem('os_qbank_profiles', JSON.stringify(profiles));
      alert(`User role toggled successfully.`);
      loadAdminData();
    }
  };

  const handleDownloadSampleCSV = () => {
    const csvContent = "question,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty,topic\n" +
      "\"What is CPU Scheduling?\",\"Allocating CPU cycles\",\"Disk seek operations\",\"Paging layouts\",\"Thread termination\",\"A\",\"CPU scheduling allows one process to use the CPU while another is waiting.\",\"Easy\",\"Scheduling\"\n" +
      "\"Which algorithm has the lowest seek time?\",\"C-LOOK\",\"FCFS\",\"SSTF\",\"SCAN\",\"C\",\"SSTF selects the request with minimum seek time from current head.\",\"Medium\",\"Disk Scheduling\"";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "os_sample_questions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Compute Analytics Data
  const totalQuestions = questions.length;
  const totalStudents = users.filter((u) => u.role === 'student').length;
  const totalTestsCount = tests.length;
  
  let globalAverageScorePct = 0;
  const completedTests = tests.filter((t) => t.status === 'completed');
  if (completedTests.length > 0) {
    const pcts = completedTests.map((t) => (t.total_marks > 0 ? (t.score / t.total_marks) * 100 : 0));
    globalAverageScorePct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  }

  // Recharts Topic Distribution
  const topicDistribution = topics.map((t) => {
    const count = questions.filter((q) => q.topic_id === t.id).length;
    return {
      name: t.name.length > 15 ? t.name.slice(0, 12) + '..' : t.name,
      questions: count,
    };
  }).filter((t) => t.questions > 0);

  // Recharts Difficulty Distribution
  const difficultyCounts = {
    Easy: questions.filter((q) => q.difficulty === 'Easy').length,
    Medium: questions.filter((q) => q.difficulty === 'Medium').length,
    Hard: questions.filter((q) => q.difficulty === 'Hard').length,
  };

  const difficultyPieData = [
    { name: 'Easy', value: difficultyCounts.Easy, color: '#4E7C59' }, // --color-accent-emerald
    { name: 'Medium', value: difficultyCounts.Medium, color: '#D4A373' }, // --color-accent-gold
    { name: 'Hard', value: difficultyCounts.Hard, color: '#A34A3E' }, // --color-accent-rose
  ];

  // Filtering questions for display
  const filteredQuestions = questions.filter((q) => {
    const matchesSearch = q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.explanation.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTopic = selectedTopic ? q.topic_id === selectedTopic : true;
    const matchesDifficulty = selectedDifficulty ? q.difficulty === selectedDifficulty : true;
    return matchesSearch && matchesTopic && matchesDifficulty;
  });

  return (
    <div className="space-y-6 font-sans text-text-app">
      
      {/* Top Banner Control Panel */}
      <div className="p-6 bg-brand rounded-2xl text-white flex flex-col sm:flex-row items-center justify-between gap-4 border border-brand-hover shadow-xl">
        <div className="space-y-1 text-center sm:text-left">
          <span className="px-2.5 py-0.5 bg-white/20 text-white rounded-full text-[10px] font-bold tracking-wider">
            SYSTEM ADMIN CONTROL
          </span>
          <h2 className="text-2xl font-serif font-black">Professor Command Center</h2>
          <p className="text-xs text-white/90">
            Welcome, {profile.name}. Manage topics, questions, database seeds, and monitor test attempts.
          </p>
        </div>

        <button
          onClick={onLogout}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition border border-white/25 cursor-pointer"
        >
          Logout Administrator
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-app scrollbar-none overflow-x-auto gap-4">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'analytics'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-muted hover:text-text-app'
          }`}
        >
          <BarChart4 className="w-4 h-4" />
          Statistics & Charts
        </button>
        <button
          onClick={() => setActiveTab('questions')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'questions'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-muted hover:text-text-app'
          }`}
        >
          <Search className="w-4 h-4" />
          Question Manager ({filteredQuestions.length})
        </button>
        <button
          onClick={() => setActiveTab('csv')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'csv'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-muted hover:text-text-app'
          }`}
        >
          <Upload className="w-4 h-4" />
          CSV Question Importer
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-brand text-brand'
              : 'border-transparent text-text-muted hover:text-text-app'
          }`}
        >
          <Users className="w-4 h-4" />
          User Management ({users.length})
        </button>
      </div>

      {/* Content based on Active Tab */}
      
      {/* 1. ANALYTICS VIEW */}
      {activeTab === 'analytics' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Key Metrics Cards Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-center">
              <div className="text-2xl font-serif font-black text-brand">{totalQuestions}</div>
              <div className="text-[10px] text-text-muted font-bold uppercase mt-1">Total MCQs</div>
            </div>

            <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-center">
              <div className="text-2xl font-serif font-black text-accent-emerald">{totalStudents}</div>
              <div className="text-[10px] text-text-muted font-bold uppercase mt-1">Active Students</div>
            </div>

            <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-center">
              <div className="text-2xl font-serif font-black text-accent-gold">{totalTestsCount}</div>
              <div className="text-[10px] text-text-muted font-bold uppercase mt-1">Total Exams Taken</div>
            </div>

            <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-center">
              <div className="text-2xl font-serif font-black text-brand">{globalAverageScorePct}%</div>
              <div className="text-[10px] text-text-muted font-bold uppercase mt-1">Average Student Score</div>
            </div>

          </div>

          {/* Graphical Distributions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Topic Distribution */}
            <div className="p-5 bg-bg-card border border-border-app rounded-2xl shadow-sm lg:col-span-2 space-y-3">
              <h3 className="text-xs font-serif font-bold text-text-app">Topic Distribution (Question Count)</h3>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topicDistribution} margin={{ top: 5, right: 10, left: -30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-app)" />
                    <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={9} interval={0} angle={-10} textAnchor="end" />
                    <YAxis stroke="var(--color-text-muted)" fontSize={9} />
                    <Tooltip formatter={(v) => [`${v} Questions`]} />
                    <Bar dataKey="questions" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Difficulty Pie Chart */}
            <div className="p-5 bg-bg-card border border-border-app rounded-2xl shadow-sm space-y-3">
              <h3 className="text-xs font-serif font-bold text-text-app">Difficulty Distribution</h3>
              <div className="h-44 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={difficultyPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {difficultyPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center mt-1 pointer-events-none">
                  <span className="text-[10px] text-text-muted font-bold">Standard</span>
                  <span className="text-base font-serif font-black text-text-app">{totalQuestions}</span>
                </div>
              </div>
              <div className="flex justify-around text-[10px] text-text-muted">
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-accent-emerald"></span>Easy ({difficultyCounts.Easy})</div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-accent-gold"></span>Medium ({difficultyCounts.Medium})</div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-accent-rose"></span>Hard ({difficultyCounts.Hard})</div>
              </div>
            </div>

          </div>

          {/* Recent Activity Logs */}
          <div className="p-5 bg-bg-card border border-border-app rounded-2xl shadow-sm">
            <h3 className="text-xs font-serif font-bold text-text-app mb-3">Recent Test Submission Logs</h3>
            {completedTests.length > 0 ? (
              <div className="space-y-3">
                {completedTests.slice(0, 5).map((t, idx) => {
                  const student = users.find((u) => u.id === t.user_id);
                  const dateStr = new Date(t.start_time).toLocaleString();
                  return (
                    <div key={idx} className="p-3 border border-border-app rounded-xl bg-bg-panel/50 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-semibold text-text-app">
                          {student?.name || 'Unknown Student'} ({student?.email})
                        </div>
                        <div className="text-[10px] text-text-muted">{dateStr}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-serif font-bold text-brand">{t.score} / {t.total_marks} Marks</div>
                        <div className="text-[9px] text-accent-rose">Neg Loss: -{t.negative_score}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted py-6 text-center">No tests submitted yet.</p>
            )}
          </div>

        </div>
      )}

      {/* 2. QUESTION CRUD MANAGER */}
      {activeTab === 'questions' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Filtering Controls */}
          <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search question text or details..."
                className="w-full bg-bg-panel border border-border-app rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-brand text-text-app"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="px-2 py-1.5 text-xs bg-bg-panel border border-border-app rounded-xl text-text-app focus:outline-none focus:border-brand"
              >
                <option value="">All Topics</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="px-2 py-1.5 text-xs bg-bg-panel border border-border-app rounded-xl text-text-app focus:outline-none focus:border-brand"
              >
                <option value="">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <button
                onClick={() => {
                  setEditingQuestion(null);
                  setFormData({
                    question: '',
                    option_a: '',
                    option_b: '',
                    option_c: '',
                    option_d: '',
                    correct_option: 'A',
                    explanation: '',
                    difficulty: 'Easy',
                    topic_id: topics[0]?.id || '',
                    marks: 1,
                    negative_marks: 0.25,
                  });
                  setShowForm(true);
                }}
                className="px-4 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md shadow-brand/10 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Question
              </button>
            </div>
          </div>

          {/* Form Modal for Add/Edit */}
          {showForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-bg-card border border-border-app p-6 rounded-2xl max-w-lg w-full text-xs space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center pb-2 border-b border-border-app">
                  <h3 className="text-sm font-serif font-black text-text-app">
                    {editingQuestion ? 'Edit Question Entry' : 'Create New MCQ Question'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setEditingQuestion(null);
                    }}
                    className="text-text-muted hover:text-text-app"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateOrUpdate} className="space-y-3">
                  <div>
                    <label className="block font-bold text-text-muted mb-1">Question Text</label>
                    <textarea
                      required
                      value={formData.question}
                      onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                      rows={2}
                      placeholder="e.g. What is the CPU scheduling algorithm that resolves convoy effect?"
                      className="w-full px-3 py-2 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-text-muted mb-1">Option A</label>
                      <input
                        type="text"
                        required
                        value={formData.option_a}
                        onChange={(e) => setFormData({ ...formData, option_a: e.target.value })}
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-text-muted mb-1">Option B</label>
                      <input
                        type="text"
                        required
                        value={formData.option_b}
                        onChange={(e) => setFormData({ ...formData, option_b: e.target.value })}
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-text-muted mb-1">Option C</label>
                      <input
                        type="text"
                        value={formData.option_c}
                        onChange={(e) => setFormData({ ...formData, option_c: e.target.value })}
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-text-muted mb-1">Option D</label>
                      <input
                        type="text"
                        value={formData.option_d}
                        onChange={(e) => setFormData({ ...formData, option_d: e.target.value })}
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-text-muted mb-1">Correct Option Key</label>
                      <select
                        value={formData.correct_option}
                        onChange={(e) => setFormData({ ...formData, correct_option: e.target.value as any })}
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-text-muted mb-1">Select Topic</label>
                      <select
                        value={formData.topic_id}
                        onChange={(e) => setFormData({ ...formData, topic_id: e.target.value })}
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                      >
                        {topics.map((t) => (
                           <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-text-muted mb-1">Difficulty</label>
                      <select
                        value={formData.difficulty}
                        onChange={(e) => handleDifficultyChange(e.target.value as any)}
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-text-muted mb-1">Positive Marks</label>
                      <input
                        type="number"
                        value={formData.marks}
                        readOnly
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg text-text-muted cursor-not-allowed focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-text-muted mb-1">Negative Marks</label>
                      <input
                        type="number"
                        value={formData.negative_marks}
                        readOnly
                        className="w-full px-3 py-1.5 bg-bg-panel border border-border-app rounded-lg text-text-muted cursor-not-allowed focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-text-muted mb-1">Pedagogical Explanation</label>
                    <textarea
                      value={formData.explanation}
                      onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                      rows={2}
                      placeholder="Why is this the correct answer?"
                      className="w-full px-3 py-2 bg-bg-panel border border-border-app rounded-lg focus:outline-none focus:border-brand text-text-app"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setEditingQuestion(null);
                      }}
                      className="px-4 py-2 bg-bg-panel hover:bg-border-app text-text-app rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl font-bold cursor-pointer"
                    >
                      {editingQuestion ? 'Save Updates' : 'Publish Question'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Table list of questions */}
          <div className="bg-bg-card border border-border-app rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border-app text-text-muted bg-bg-panel/50">
                    <th className="p-3 font-semibold w-1/12">Difficulty</th>
                    <th className="p-3 font-semibold w-2/12">Topic</th>
                    <th className="p-3 font-semibold w-6/12">Question Content</th>
                    <th className="p-3 font-semibold text-center w-1/12">Correct</th>
                    <th className="p-3 font-semibold text-right w-2/12">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-app/40">
                  {filteredQuestions.map((q) => {
                    const topicObj = topics.find((t) => t.id === q.topic_id);
                    return (
                      <tr key={q.id} className="hover:bg-bg-panel/40">
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            q.difficulty === 'Easy'
                              ? 'bg-accent-emerald/10 text-accent-emerald'
                              : q.difficulty === 'Medium'
                              ? 'bg-accent-gold/10 text-accent-gold'
                              : 'bg-accent-rose/10 text-accent-rose'
                          }`}>
                            {q.difficulty}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-text-muted truncate max-w-[150px]">
                          {topicObj?.name || 'Generic Topic'}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-text-app truncate max-w-[400px]" title={q.question}>
                            {q.question}
                          </div>
                        </td>
                        <td className="p-3 text-center font-black text-accent-emerald">{q.correct_option}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleEditClick(q)}
                              className="p-1 hover:bg-bg-panel text-text-muted hover:text-brand rounded transition cursor-pointer"
                              title="Edit Question"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(q.id)}
                              className="p-1 hover:bg-bg-panel text-text-muted hover:text-accent-rose rounded transition cursor-pointer"
                              title="Delete Question"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredQuestions.length === 0 && (
              <div className="py-8 text-center text-text-muted">No questions match your current search/filters.</div>
            )}
          </div>

        </div>
      )}

      {/* 3. CSV BULK IMPORTER */}
      {activeTab === 'csv' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          <div className="p-5 bg-bg-card border border-border-app rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-serif font-bold text-text-app flex items-center gap-1.5">
                  <FileSpreadsheet className="w-5 h-5 text-brand" />
                  Paste CSV Questions List
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Validate correct answers, topic matching, and duplicate checks instantly before insertion.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadSampleCSV}
                  className="px-3 py-1.5 bg-bg-panel hover:bg-border-app rounded-xl text-text-app text-xs font-semibold flex items-center gap-1.5 transition border border-border-app"
                >
                  <Download className="w-3.5 h-3.5" />
                  Sample CSV
                </button>
              </div>
            </div>

            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              placeholder="question,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty,topic&#10;&quot;What is paging?&quot;,&quot;Fixed size frames&quot;,&quot;Variable size partitions&quot;,&quot;Hard disk partitions&quot;,&quot;System commands&quot;,&quot;A&quot;,&quot;Paging splits physical RAM into frames and logical addresses into pages.&quot;,&quot;Easy&quot;,&quot;Paging&quot;"
              className="w-full p-4 font-mono text-[10px] bg-bg-panel border border-border-app rounded-xl focus:outline-none focus:border-brand text-text-app leading-relaxed"
            />

            <button
              onClick={handleCSVImport}
              className="px-5 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md shadow-brand/10"
            >
              <Upload className="w-4 h-4" />
              Analyze & Import Questions
            </button>
          </div>

          {/* Import Summary Result Output */}
          {importSummary && (
            <div className="p-5 bg-bg-card border border-border-app rounded-2xl shadow-sm space-y-4 animate-in slide-in-from-bottom duration-200">
              <h4 className="text-xs font-serif font-bold text-text-app flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-accent-emerald" />
                Bulk CSV Import Summary
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-accent-emerald/5 border border-accent-emerald/15 rounded-xl text-center">
                  <div className="text-2xl font-serif font-black text-accent-emerald">{importSummary.successCount}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase mt-0.5">Imported Successfully</div>
                </div>

                <div className="p-3 bg-accent-rose/5 border border-accent-rose/15 rounded-xl text-center">
                  <div className="text-2xl font-serif font-black text-accent-rose">{importSummary.failedRows.length}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase mt-0.5">Failed / Skipped Rows</div>
                </div>
              </div>

              {importSummary.failedRows.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-[11px] font-bold text-accent-rose flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Detailed Row Failures Report
                  </h5>
                  <div className="max-h-40 overflow-y-auto border border-border-app rounded-lg divide-y divide-border-app text-[10px]">
                    {importSummary.failedRows.map((f, idx) => (
                      <div key={idx} className="p-2.5 flex justify-between items-start gap-4 bg-bg-panel/50">
                        <span className="font-bold text-text-muted">Row {f.row}</span>
                        <span className="flex-1 text-text-app font-medium">{f.reason}</span>
                        <span className="text-[9px] text-text-muted truncate max-w-[150px] font-mono">{f.data}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      )}

      {/* 4. USER MANAGER */}
      {activeTab === 'users' && (
        <div className="bg-bg-card border border-border-app rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-app text-text-muted bg-bg-panel/50">
                  <th className="p-3 font-semibold">User Details</th>
                  <th className="p-3 font-semibold">System Role</th>
                  <th className="p-3 font-semibold">Registered</th>
                  <th className="p-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-app/40">
                {users.map((u) => {
                  const dateReg = new Date(u.created_at).toLocaleDateString();
                  return (
                    <tr key={u.id} className="hover:bg-bg-panel/30">
                      <td className="p-3">
                        <div className="font-bold text-text-app">{u.name}</div>
                        <div className="text-[10px] text-text-muted">{u.email}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          u.role === 'admin'
                            ? 'bg-brand text-white'
                            : 'bg-bg-panel border border-border-app text-text-muted'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3 text-text-muted">{dateReg}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handlePromoteUser(u.id)}
                          className="px-3 py-1 bg-bg-panel hover:bg-border-app text-text-app font-semibold rounded text-[11px] cursor-pointer border border-border-app"
                        >
                          {u.role === 'admin' ? 'Demote to Student' : 'Promote to Admin'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
