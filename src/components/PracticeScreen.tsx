import React, { useState, useEffect } from 'react';
import { api } from '../lib/db';
import { Question, Topic } from '../types';
import { Brain, ArrowLeft, ArrowRight, CheckCircle2, XCircle, Info, BookOpen } from 'lucide-react';

interface PracticeScreenProps {
  topicId: string;
  onBackToDashboard: () => void;
}

export const PracticeScreen: React.FC<PracticeScreenProps> = ({ topicId, onBackToDashboard }) => {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [hasChecked, setHasChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPracticeData = async () => {
      const allTopics = await api.getTopics();
      const currentTopic = allTopics.find((t) => t.id === topicId) || null;
      setTopic(currentTopic);

      const allQuestions = await api.getQuestions();
      const topicQuestions = allQuestions.filter((q) => q.topic_id === topicId);
      
      // Shuffle question list
      const shuffled = [...topicQuestions].sort(() => 0.5 - Math.random());
      setQuestions(shuffled);
      setLoading(false);
    };

    loadPracticeData();
  }, [topicId]);

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-400 text-xs">
        <Brain className="w-8 h-8 text-indigo-500 animate-pulse mb-3" />
        <p className="font-bold">Assembling practice material...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow text-center max-w-md mx-auto space-y-4">
        <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">No Questions in Topic</h3>
        <p className="text-xs text-slate-500">
          This topic currently contains no active database questions. You can add them in the admin dashboard.
        </p>
        <button
          onClick={onBackToDashboard}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const activeQuestion = questions[currentIndex];

  const handleOptionClick = (opt: 'A' | 'B' | 'C' | 'D') => {
    if (hasChecked) return;
    setSelectedOption(opt);
  };

  const handleCheck = () => {
    if (!selectedOption) return;
    setHasChecked(true);
  };

  const handleNext = () => {
    setSelectedOption(null);
    setHasChecked(false);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Re-shuffle and start again
      alert('🎉 You have completed all available practice questions in this topic! Starting a fresh shuffled loop.');
      const shuffled = [...questions].sort(() => 0.5 - Math.random());
      setQuestions(shuffled);
      setCurrentIndex(0);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToDashboard}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Targeted Study Mode</div>
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">{topic?.name}</h3>
          </div>
        </div>

        <span className="text-[11px] font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 rounded-lg">
          Question {currentIndex + 1} of {questions.length}
        </span>
      </div>

      {/* Main Question Body */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm space-y-5">
        
        <div className="space-y-1.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
            activeQuestion.difficulty === 'Easy'
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
              : activeQuestion.difficulty === 'Medium'
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
              : 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400'
          }`}>
            {activeQuestion.difficulty} ({activeQuestion.marks} Marks)
          </span>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white leading-relaxed">
            {activeQuestion.question}
          </h4>
        </div>

        {/* Options */}
        <div className="space-y-2.5">
          {(['A', 'B', 'C', 'D'] as const).map((opt) => {
            const isSelected = selectedOption === opt;
            const optionText = 
              opt === 'A' ? activeQuestion.option_a :
              opt === 'B' ? activeQuestion.option_b :
              opt === 'C' ? activeQuestion.option_c :
              activeQuestion.option_d;

            let optClass = 'w-full p-3.5 text-left rounded-xl border text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ';

            if (hasChecked) {
              const isCorrectOpt = activeQuestion.correct_option === opt;
              if (isCorrectOpt) {
                optClass += 'bg-emerald-50 border-emerald-400 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300';
              } else if (isSelected) {
                optClass += 'bg-rose-50 border-rose-400 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300';
              } else {
                optClass += 'bg-slate-50/50 border-slate-100 text-slate-400 dark:bg-slate-950/50 dark:border-slate-900';
              }
            } else {
              if (isSelected) {
                optClass += 'bg-indigo-50 border-indigo-400 text-indigo-900 dark:bg-indigo-950/30 dark:border-indigo-700 dark:text-indigo-300';
              } else {
                optClass += 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/50 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300';
              }
            }

            return (
              <button
                key={opt}
                disabled={hasChecked}
                onClick={() => handleOptionClick(opt)}
                className={optClass}
              >
                <span className={`w-5 h-5 rounded-full font-bold flex items-center justify-center text-[10px] border ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white text-slate-500 border-slate-300 dark:bg-slate-900 dark:border-slate-800'
                }`}>
                  {opt}
                </span>
                <span>{optionText}</span>
              </button>
            );
          })}
        </div>

        {/* Immediate check & feedback panel */}
        {hasChecked && (
          <div className={`p-4 rounded-xl border space-y-2 text-xs ${
            selectedOption === activeQuestion.correct_option
              ? 'bg-emerald-50/50 border-emerald-200 text-slate-700 dark:bg-emerald-950/10 dark:border-emerald-900/30 dark:text-slate-300'
              : 'bg-rose-50/50 border-rose-200 text-slate-700 dark:bg-rose-950/10 dark:border-rose-900/30 dark:text-slate-300'
          }`}>
            <div className="flex items-center gap-1.5 font-bold">
              {selectedOption === activeQuestion.correct_option ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-500" />
              )}
              {selectedOption === activeQuestion.correct_option ? 'Correct Answer!' : `Wrong Answer (Correct: Option ${activeQuestion.correct_option})`}
            </div>
            
            <p className="leading-relaxed text-[11px]">
              <strong className="block text-slate-950 dark:text-white mb-0.5">Pedagogical Explanation:</strong>
              {activeQuestion.explanation}
            </p>
          </div>
        )}

        {/* Footer controls */}
        <div className="flex justify-end pt-2">
          {!hasChecked ? (
            <button
              disabled={!selectedOption}
              onClick={handleCheck}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <Info className="w-4 h-4" />
              Check Answer
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <span>Next MCQ</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </div>

    </div>
  );
};
