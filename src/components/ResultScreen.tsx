import React, { useState, useEffect } from 'react';
import { api } from '../lib/db';
import { Question, Answer, Test, Topic } from '../types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Award, CheckCircle, XCircle, AlertCircle, RefreshCw, ChevronDown, ChevronUp, BookOpen, AlertTriangle } from 'lucide-react';

interface ResultScreenProps {
  testId: string;
  onBackToDashboard: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({ testId, onBackToDashboard }) => {
  const [test, setTest] = useState<Test | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReview, setExpandedReview] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadResult = async () => {
      const currentTest = await api.getTest(testId);
      if (!currentTest) {
        onBackToDashboard();
        return;
      }

      const allAnswers = await api.getAnswers(testId);
      const allQuestions = await api.getQuestions();
      const allTopics = await api.getTopics();

      // Keep only test questions
      const testQuestions = currentTest.question_ids
        .map((qid) => allQuestions.find((q) => q.id === qid))
        .filter((q): q is Question => !!q);

      setTest(currentTest);
      setAnswers(allAnswers);
      setQuestions(testQuestions);
      setTopics(allTopics);
      setLoading(false);
    };

    loadResult();
  }, [testId]);

  if (loading || !test) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-text-muted text-xs">
        <RefreshCw className="w-8 h-8 text-brand animate-spin mb-3" />
        <p className="font-serif font-bold text-text-app">Analyzing test metrics...</p>
      </div>
    );
  }

  // Calculate stats
  const totalQuestions = questions.length;
  const correctCount = answers.filter((a) => a.is_correct === true).length;
  const wrongCount = answers.filter((a) => a.is_correct === false).length;
  const unattemptedCount = answers.filter((a) => a.selected_option === null).length;

  const totalPositiveScore = answers
    .filter((a) => a.is_correct === true)
    .reduce((sum, a) => sum + a.marks_awarded, 0);

  const totalNegativeScore = test.negative_score;
  const finalPercentage = Math.round(test.total_marks > 0 ? (test.score / test.total_marks) * 100 : 0);
  const isPass = finalPercentage >= 50;

  // Pie Chart Data
  const pieData = [
    { name: 'Correct', value: correctCount, color: '#4E7C59' }, // --color-accent-emerald
    { name: 'Wrong', value: wrongCount, color: '#A34A3E' }, // --color-accent-rose
    { name: 'Unattempted', value: unattemptedCount, color: '#9E9E92' }, // --color-text-muted
  ];

  // Topic-wise analysis
  const topicStatsMap: Record<string, { correct: number; total: number }> = {};
  topics.forEach((t) => {
    topicStatsMap[t.id] = { correct: 0, total: 0 };
  });

  answers.forEach((ans) => {
    const q = questions.find((qi) => qi.id === ans.question_id);
    if (q) {
      topicStatsMap[q.topic_id].total += 1;
      if (ans.is_correct) {
        topicStatsMap[q.topic_id].correct += 1;
      }
    }
  });

  const topicChartData = topics
    .map((t) => {
      const stats = topicStatsMap[t.id];
      const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      return {
        name: t.name.length > 18 ? t.name.slice(0, 16) + '..' : t.name,
        accuracy: pct,
        correct: stats.correct,
        total: stats.total,
      };
    })
    .filter((t) => t.total > 0);

  // Difficulty-wise analysis
  const difficultyStats = {
    Easy: { correct: 0, total: 0 },
    Medium: { correct: 0, total: 0 },
    Hard: { correct: 0, total: 0 },
  };

  answers.forEach((ans) => {
    const q = questions.find((qi) => qi.id === ans.question_id);
    if (q) {
      difficultyStats[q.difficulty].total += 1;
      if (ans.is_correct) {
        difficultyStats[q.difficulty].correct += 1;
      }
    }
  });

  const difficultyChartData = (['Easy', 'Medium', 'Hard'] as const).map((diff) => {
    const stats = difficultyStats[diff];
    const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    return {
      name: diff,
      accuracy: pct,
      correct: stats.correct,
      total: stats.total,
    };
  }).filter((d) => d.total > 0);

  const toggleExpand = (qid: string) => {
    setExpandedReview((prev) => ({ ...prev, [qid]: !prev[qid] }));
  };

  return (
    <div className="space-y-6 font-sans text-text-app">
      
      {/* Grade Header */}
      <div className={`p-6 rounded-2xl text-white flex flex-col md:flex-row items-center justify-between gap-4 border shadow-xl ${
        isPass 
          ? 'bg-accent-emerald border-border-app'
          : 'bg-accent-rose border-border-app'
      }`}>
        <div className="flex items-center gap-4">
          <div className="p-4 bg-white/10 rounded-2xl border border-white/20">
            <Award className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-1 text-center md:text-left">
            <span className="px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-white/20 rounded-full">
              Result Assessment Complete
            </span>
            <h2 className="text-2xl font-serif font-black">{isPass ? 'Congratulations! You Passed' : 'Evaluation Incomplete - Try Again'}</h2>
            <p className="text-xs text-white/90 max-w-md">
              You scored {test.score} out of {test.total_marks} marks, achieving an accuracy rating of {finalPercentage}%.
            </p>
          </div>
        </div>

        <div className="text-center md:text-right space-y-1">
          <div className="text-3xl font-serif font-black">{finalPercentage}%</div>
          <div className="text-xs font-semibold px-3 py-1 bg-white/10 rounded-lg inline-block border border-white/20">
            {isPass ? 'GRADE: PASS (≥ 50%)' : 'GRADE: FAIL (< 50%)'}
          </div>
        </div>
      </div>

      {/* Numeric Highlights Panel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        {/* Correct Answers */}
        <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-center">
          <div className="text-xs text-text-muted font-semibold mb-1">Correct MCQs</div>
          <div className="text-xl font-bold text-accent-emerald flex items-center justify-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            {correctCount} / {totalQuestions}
          </div>
        </div>

        {/* Wrong Answers */}
        <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-center">
          <div className="text-xs text-text-muted font-semibold mb-1">Wrong Answers</div>
          <div className="text-xl font-bold text-accent-rose flex items-center justify-center gap-1.5">
            <XCircle className="w-4 h-4" />
            {wrongCount}
          </div>
        </div>

        {/* Unattempted */}
        <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-center">
          <div className="text-xs text-text-muted font-semibold mb-1">Unattempted</div>
          <div className="text-xl font-bold text-text-muted flex items-center justify-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            {unattemptedCount}
          </div>
        </div>

        {/* Positive vs Negative Score */}
        <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-center">
          <div className="text-xs text-text-muted font-semibold mb-1">Marks Details</div>
          <div className="text-[11px] font-bold text-text-app">
            <span className="text-accent-emerald">+{totalPositiveScore}</span>
            <span className="text-text-muted mx-1">/</span>
            <span className="text-accent-rose">-{totalNegativeScore}</span>
          </div>
        </div>

      </div>

      {/* Visual Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Distribution Pie Chart */}
        <div className="p-5 bg-bg-card border border-border-app rounded-2xl shadow-sm flex flex-col justify-between">
          <h3 className="text-xs font-serif font-bold text-text-app mb-3">Response Distribution</h3>
          
          <div className="h-44 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
              <span className="text-xs font-bold text-text-muted">Total</span>
              <span className="text-lg font-serif font-black text-text-app">{totalQuestions}</span>
            </div>
          </div>

          <div className="flex justify-around text-[10px] text-text-muted mt-2">
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-accent-emerald"></span>Correct ({correctCount})</div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-accent-rose"></span>Wrong ({wrongCount})</div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-text-muted"></span>Skipped ({unattemptedCount})</div>
          </div>
        </div>

        {/* Topic-wise Performance Chart */}
        <div className="p-5 bg-bg-card border border-border-app rounded-2xl shadow-sm lg:col-span-2">
          <h3 className="text-xs font-serif font-bold text-text-app mb-3">Topic Performance Accuracy (%)</h3>
          
          {topicChartData.length > 0 ? (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-app)" />
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={9} interval={0} angle={-15} textAnchor="end" />
                  <YAxis domain={[0, 100]} stroke="var(--color-text-muted)" fontSize={9} />
                  <Tooltip formatter={(value) => [`${value}% Accuracy`]} />
                  <Bar dataKey="accuracy" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-text-muted py-10 text-center">No topic performance analyzed.</p>
          )}
        </div>

      </div>

      {/* Difficulty performance row */}
      <div className="p-5 bg-bg-card border border-border-app rounded-2xl shadow-sm">
        <h3 className="text-xs font-serif font-bold text-text-app mb-3">Difficulty Accuracy Analysis (%)</h3>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={difficultyChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-app)" />
              <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={10} />
              <YAxis domain={[0, 100]} stroke="var(--color-text-muted)" fontSize={10} />
              <Tooltip formatter={(value) => [`${value}%`]} />
              <Bar dataKey="accuracy" fill="var(--color-accent-gold)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Answer Key Review Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-serif font-bold text-text-app flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand" />
            Detailed Question & Answer Key Review
          </h3>
          <button
            onClick={onBackToDashboard}
            className="px-4 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-semibold cursor-pointer transition shadow"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="space-y-3">
          {questions.map((q, idx) => {
            const ans = answers.find((a) => a.question_id === q.id);
            const userSelected = ans?.selected_option || null;
            const isCorrect = ans?.is_correct === true;
            const isUnattempted = userSelected === null;
            const isOpen = expandedReview[q.id];

            return (
              <div
                key={q.id}
                className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
                  isUnattempted
                    ? 'border-border-app bg-bg-panel/50'
                    : isCorrect
                    ? 'border-accent-emerald/30 bg-accent-emerald/5'
                    : 'border-accent-rose/30 bg-accent-rose/5'
                }`}
              >
                
                {/* Accordion Header */}
                <div
                  onClick={() => toggleExpand(q.id)}
                  className="p-4 flex items-start justify-between gap-3 cursor-pointer select-none hover:bg-bg-panel transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-text-muted">Question {idx + 1}</span>
                      <span className={`text-[9px] font-bold px-1.5 rounded uppercase ${
                        q.difficulty === 'Easy'
                          ? 'bg-accent-emerald/10 text-accent-emerald'
                          : q.difficulty === 'Medium'
                          ? 'bg-accent-gold/10 text-accent-gold'
                          : 'bg-accent-rose/10 text-accent-rose'
                      }`}>
                        {q.difficulty}
                      </span>
                      {isUnattempted ? (
                        <span className="text-[9px] font-bold px-1.5 bg-bg-panel text-text-muted rounded uppercase">Skipped</span>
                      ) : isCorrect ? (
                        <span className="text-[9px] font-bold px-1.5 bg-accent-emerald text-white rounded uppercase flex items-center gap-1">
                          ✓ Correct
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 bg-accent-rose text-white rounded uppercase flex items-center gap-1">
                          ✕ Incorrect
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-serif font-bold text-text-app leading-relaxed">
                      {q.question}
                    </h4>
                  </div>

                  <button className="text-text-muted hover:text-text-app mt-1">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Accordion Body */}
                {isOpen && (
                  <div className="p-4 border-t border-border-app bg-bg-card space-y-4 text-xs">
                    
                    {/* Option Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className={`p-2.5 rounded-lg border text-[11px] ${
                        q.correct_option === 'A'
                          ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'
                          : userSelected === 'A'
                          ? 'bg-accent-rose/10 border-accent-rose/30 text-accent-rose'
                          : 'bg-bg-panel border-border-app text-text-app'
                      }`}>
                        <strong>A:</strong> {q.option_a}
                      </div>

                      <div className={`p-2.5 rounded-lg border text-[11px] ${
                        q.correct_option === 'B'
                          ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'
                          : userSelected === 'B'
                          ? 'bg-accent-rose/10 border-accent-rose/30 text-accent-rose'
                          : 'bg-bg-panel border-border-app text-text-app'
                      }`}>
                        <strong>B:</strong> {q.option_b}
                      </div>

                      <div className={`p-2.5 rounded-lg border text-[11px] ${
                        q.correct_option === 'C'
                          ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'
                          : userSelected === 'C'
                          ? 'bg-accent-rose/10 border-accent-rose/30 text-accent-rose'
                          : 'bg-bg-panel border-border-app text-text-app'
                      }`}>
                        <strong>C:</strong> {q.option_c}
                      </div>

                      <div className={`p-2.5 rounded-lg border text-[11px] ${
                        q.correct_option === 'D'
                          ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'
                          : userSelected === 'D'
                          ? 'bg-accent-rose/10 border-accent-rose/30 text-accent-rose'
                          : 'bg-bg-panel border-border-app text-text-app'
                      }`}>
                        <strong>D:</strong> {q.option_d}
                      </div>
                    </div>

                    {/* Verdict Box */}
                    <div className="p-3 bg-bg-panel border border-border-app rounded-xl space-y-2">
                      <div className="flex justify-between flex-wrap text-[10px] text-text-muted font-bold border-b border-border-app pb-1">
                        <span>YOUR ANSWER: <strong className={isCorrect ? 'text-accent-emerald' : 'text-accent-rose'}>{userSelected || 'SKIPPED'}</strong></span>
                        <span>CORRECT OPTION: <strong className="text-accent-emerald">{q.correct_option}</strong></span>
                      </div>
                      
                      {/* Explanations */}
                      <div className="text-[11px] leading-relaxed text-text-app">
                        <span className="font-bold text-text-app block mb-0.5">Pedagogical Explanation:</span>
                        {q.explanation}
                      </div>
                    </div>

                  </div>
                )}

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
