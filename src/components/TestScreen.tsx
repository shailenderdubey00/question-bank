import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/db';
import { Question, Answer, Test } from '../types';
import { Clock, ShieldAlert, CheckSquare, Bookmark, ArrowLeft, ArrowRight, Save, Send, AlertTriangle, LogOut } from 'lucide-react';

interface TestScreenProps {
  testId: string;
  onTestSubmitted: (testId: string) => void;
  onCancelTest: () => void;
}

interface ShuffledOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export const TestScreen: React.FC<TestScreenProps> = ({ testId, onTestSubmitted, onCancelTest }) => {
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(3600); // 60 minutes
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [optionCache, setOptionCache] = useState<Record<string, ShuffledOption[]>>({});
  const [selectedOpt, setSelectedOpt] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [isMarkedReview, setIsMarkedReview] = useState(false);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadTestData = async () => {
      const currentTest = await api.getTest(testId);
      if (!currentTest) {
        onCancelTest();
        return;
      }

      setTest(currentTest);

      // Load all questions
      const allQuestions = await api.getQuestions();
      // Filter & order questions according to test.question_ids
      const testQuestions = currentTest.question_ids
        .map((id) => allQuestions.find((q) => q.id === id))
        .filter((q): q is Question => !!q);

      setQuestions(testQuestions);

      // Load answers
      const testAnswers = await api.getAnswers(testId);
      setAnswers(testAnswers);

      // Initialize option shuffling cache
      const cache: Record<string, ShuffledOption[]> = {};
      testQuestions.forEach((q) => {
        const opts: ShuffledOption[] = [
          { key: 'A', text: q.option_a },
          { key: 'B', text: q.option_b },
          { key: 'C', text: q.option_c },
          { key: 'D', text: q.option_d },
        ];
        // Shuffling using Fisher-Yates
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        cache[q.id] = opts;
      });
      setOptionCache(cache);

      // Set initial time left based on start_time
      const testDurationMinutes = currentTest.duration_min || 60;
      const testDurationSeconds = testDurationMinutes * 60;
      const startTimeMs = new Date(currentTest.start_time).getTime();
      const elapsedSeconds = Math.floor((Date.now() - startTimeMs) / 1000);
      const remaining = Math.max(0, testDurationSeconds - elapsedSeconds);
      setTimeLeft(remaining);

      // Mark first question as visited
      if (testQuestions.length > 0) {
        setVisited({ [testQuestions[0].id]: true });
        const ans = testAnswers.find((a) => a.question_id === testQuestions[0].id);
        setSelectedOpt(ans?.selected_option || null);
        setIsMarkedReview(ans?.marked_for_review || false);
      }

      setLoading(false);
    };

    loadTestData();
  }, [testId]);

  // Timer mechanism
  useEffect(() => {
    if (loading || timeLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, timeLeft]);

  const handleAutoSubmit = async () => {
    const testDurationMinutes = test?.duration_min || 60;
    alert(`⏱️ Time limit of ${testDurationMinutes} minutes reached! Your test is being automatically submitted.`);
    await submitTest();
  };

  const submitTest = async () => {
    if (!test) return;
    const testDurationSeconds = (test.duration_min || 60) * 60;
    const timeSpent = testDurationSeconds - timeLeft;
    const updated = await api.submitTest(test.id, timeSpent);
    if (updated) {
      onTestSubmitted(test.id);
    }
  };

  const handleQuestionSelect = (index: number) => {
    // Save current states or simply change index
    const nextQ = questions[index];
    if (nextQ) {
      setCurrentIndex(index);
      setVisited((prev) => ({ ...prev, [nextQ.id]: true }));
      const ans = answers.find((a) => a.question_id === nextQ.id);
      setSelectedOpt(ans?.selected_option || null);
      setIsMarkedReview(ans?.marked_for_review || false);
    }
  };

  const handleSaveAnswer = async () => {
    if (!test || questions.length === 0) return;
    const q = questions[currentIndex];
    
    // Save locally and in database
    const updatedAnswer = await api.saveAnswer(test.id, q.id, selectedOpt, isMarkedReview);
    if (updatedAnswer) {
      // Update local answers array
      setAnswers((prev) =>
        prev.map((a) => (a.question_id === q.id ? { ...a, ...updatedAnswer } : a))
      );
    }

    // Auto proceed to next question if not at the end
    if (currentIndex < questions.length - 1) {
      handleQuestionSelect(currentIndex + 1);
    }
  };

  const handleSkipQuestion = () => {
    if (currentIndex < questions.length - 1) {
      handleQuestionSelect(currentIndex + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentIndex > 0) {
      handleQuestionSelect(currentIndex - 1);
    }
  };

  if (loading || !test) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-text-muted text-xs">
        <Clock className="w-8 h-8 text-brand animate-spin mb-3" />
        <p className="font-serif font-bold text-text-app">Loading exam questions...</p>
        <p className="text-[10px] mt-1 text-text-muted">Shuffling options and initializing navigation map.</p>
      </div>
    );
  }

  const activeQuestion = questions[currentIndex];
  const activeOptions = optionCache[activeQuestion?.id] || [];

  // Count answer states for stats banner
  const totalQuestions = questions.length;
  const attemptedCount = answers.filter((a) => a.selected_option !== null).length;
  const markedReviewCount = answers.filter((a) => a.marked_for_review).length;

  // Formatter for timer minutes:seconds
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Decide button color for navigation panel
  const getNavButtonClass = (index: number) => {
    const q = questions[index];
    const isCurrent = currentIndex === index;
    const ans = answers.find((a) => a.question_id === q.id);
    const hasAnswered = ans && ans.selected_option !== null;
    const isMarked = ans && ans.marked_for_review;
    const hasVisited = visited[q.id];

    let base = 'w-9 h-9 text-xs font-bold rounded-lg border flex items-center justify-center transition cursor-pointer ';

    if (isCurrent) {
      base += 'ring-2 ring-brand ring-offset-2 dark:ring-offset-slate-950 ';
    }

    if (isMarked) {
      base += 'bg-brand border-brand-hover text-white';
    } else if (hasAnswered) {
      base += 'bg-accent-emerald border-accent-emerald text-white';
    } else if (hasVisited) {
      base += 'bg-accent-gold/15 border-accent-gold/30 text-accent-gold';
    } else {
      base += 'bg-bg-panel border-border-app text-text-muted';
    }

    return base;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 font-sans text-text-app">
      
      {/* Main Question & Answer Zone */}
      <div className="lg:col-span-3 space-y-4">
        
        {/* Active Header (Time & Marks) */}
        <div className="flex flex-wrap items-center justify-between p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm gap-3">
          <div className="flex flex-col gap-1">
            {test?.mock_series_title && (
              <span className="text-xs font-bold text-brand uppercase tracking-wider block">
                {test.mock_series_title}
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-1 bg-bg-panel rounded text-text-muted">
                MCQ {currentIndex + 1} of {totalQuestions}
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                activeQuestion?.difficulty === 'Easy'
                  ? 'bg-accent-emerald/10 text-accent-emerald'
                  : activeQuestion?.difficulty === 'Medium'
                  ? 'bg-accent-gold/10 text-accent-gold'
                  : 'bg-accent-rose/10 text-accent-rose'
              }`}>
                {activeQuestion?.difficulty}
              </span>
            </div>
          </div>

          {/* Core Marking Criteria */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-accent-emerald font-bold">
              +{activeQuestion?.marks} Marks
            </span>
            <span className="text-accent-rose font-bold">
              -{activeQuestion?.negative_marks} Neg Marking
            </span>
          </div>

          {/* Countdown Clock */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold font-mono text-sm ${
            timeLeft < 300 
              ? 'bg-accent-rose/15 text-accent-rose animate-pulse'
              : 'bg-brand/10 text-brand'
          }`}>
            <Clock className="w-4 h-4" />
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Question Body */}
        <div className="p-6 bg-bg-card border border-border-app rounded-2xl shadow-sm space-y-6">
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-text-muted">
              Exam Core Question Section
            </div>
            <h3 className="text-base font-serif font-bold text-text-app leading-relaxed">
              {activeQuestion?.question}
            </h3>
          </div>

          {/* Dynamic Options List */}
          <div className="space-y-3">
            {activeOptions.map((opt) => {
              const isSelected = selectedOpt === opt.key;
              return (
                <button
                  key={opt.key}
                  id={`opt-btn-${opt.key}`}
                  onClick={() => setSelectedOpt(opt.key)}
                  className={`w-full p-4 text-left rounded-xl border text-xs font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-brand/10 border-brand text-brand'
                      : 'bg-bg-panel border-border-app text-text-app hover:bg-border-app/20'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full font-bold flex items-center justify-center border text-[11px] ${
                    isSelected
                      ? 'bg-brand text-white border-brand'
                      : 'bg-bg-card border-border-app text-text-muted'
                  }`}>
                    {opt.key}
                  </span>
                  <span className="flex-1">{opt.text}</span>
                </button>
              );
            })}
          </div>

          {/* Review and Checkbox Indicator */}
          <div className="flex items-center gap-2">
            <input
              id="mark-review-checkbox"
              type="checkbox"
              checked={isMarkedReview}
              onChange={(e) => setIsMarkedReview(e.target.checked)}
              className="rounded border-border-app text-brand focus:ring-brand w-4 h-4 bg-bg-panel"
            />
            <label htmlFor="mark-review-checkbox" className="text-xs font-semibold text-text-app select-none flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-brand" />
              Mark this question for later review
            </label>
          </div>
        </div>

        {/* Action Controls Panel */}
        <div className="flex justify-between items-center p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm flex-wrap gap-2">
          
          <div className="flex gap-2">
            <button
              onClick={handlePrevQuestion}
              disabled={currentIndex === 0}
              className="px-3 py-2 bg-bg-panel hover:bg-border-app disabled:opacity-40 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer text-text-app"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              onClick={handleSkipQuestion}
              disabled={currentIndex === totalQuestions - 1}
              className="px-3 py-2 bg-bg-panel hover:bg-border-app disabled:opacity-40 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer text-text-app"
            >
              Skip
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedOpt(null);
                setIsMarkedReview(false);
              }}
              className="px-3 py-2 text-xs font-semibold text-text-muted hover:text-text-app transition"
            >
              Clear Selection
            </button>
            <button
              onClick={handleSaveAnswer}
              className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-brand/10"
            >
              <Save className="w-3.5 h-3.5" />
              Save & Next
            </button>
          </div>

        </div>

      </div>

      {/* Right Sidebar: Progress Mapping & Submit */}
      <div className="space-y-4">
        
        {/* Exam statistics summary */}
        <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm text-xs space-y-3">
          <h4 className="font-serif font-bold text-text-app">Exam Overview Metrics</h4>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-accent-emerald/5 border border-accent-emerald/10 rounded-lg text-center">
              <div className="font-bold text-accent-emerald text-sm">{attemptedCount}</div>
              <div className="text-[9px] text-text-muted font-medium">Attempted</div>
            </div>
            <div className="p-2 bg-brand/5 border border-brand/15 rounded-lg text-center">
              <div className="font-bold text-brand text-sm">{markedReviewCount}</div>
              <div className="text-[9px] text-text-muted font-medium">For Review</div>
            </div>
          </div>
        </div>

        {/* Question grid navigation panel */}
        <div className="p-4 bg-bg-card border border-border-app rounded-2xl shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-serif font-bold text-text-app">Question Map</h4>
            <span className="text-[10px] text-text-muted">Scroll Map</span>
          </div>

          <div className="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
            {questions.map((_, index) => (
              <button
                key={index}
                onClick={() => handleQuestionSelect(index)}
                className={getNavButtonClass(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="border-t border-border-app pt-3 text-[10px] text-text-muted space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-accent-emerald"></span>
              <span>Saved & Answered</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-brand"></span>
              <span>Marked for Review</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-accent-gold/15 border border-accent-gold/30"></span>
              <span>Skipped / Visited</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-bg-panel border border-border-app"></span>
              <span>Not Visited yet</span>
            </div>
          </div>
        </div>

        {/* Global Submit Button */}
        <button
          onClick={() => setShowSubmitConfirm(true)}
          className="w-full py-2.5 bg-accent-rose hover:opacity-95 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-accent-rose/15"
        >
          <Send className="w-4 h-4" />
          Finish & Submit Exam
        </button>

        {/* Leave/Discard Button if no questions are attempted */}
        {attemptedCount === 0 && (
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="w-full py-2.5 bg-bg-panel hover:bg-border-app/40 border border-border-app text-text-app rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <LogOut className="w-4 h-4 text-accent-rose animate-pulse" />
            Leave & Discard Exam
          </button>
        )}

      </div>

      {/* Confirmation Modal Popup */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-card border border-border-app p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-accent-rose/10 text-accent-rose rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-sm font-serif font-black text-text-app">Submit Examination?</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                You have answered **{attemptedCount} out of {totalQuestions}** questions. Any negative marks from wrong answers will be deducted. Are you ready to submit?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="py-2 px-3 bg-bg-panel hover:bg-border-app text-text-app rounded-xl text-xs font-semibold transition"
              >
                No, Keep Editing
              </button>
              <button
                onClick={submitTest}
                className="py-2 px-3 bg-accent-rose hover:opacity-95 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Yes, Submit Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Test Confirmation Modal Popup */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-card border border-border-app p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-accent-rose/10 text-accent-rose rounded-full flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-sm font-serif font-black text-text-app">Leave & Discard Exam?</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                It looks like you entered this test by mistake. Since you have **not attempted** any questions, you can leave now and this session will be completely discarded without any record.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="py-2 px-3 bg-bg-panel hover:bg-border-app text-text-app rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowLeaveConfirm(false);
                  setLoading(true);
                  await api.discardTest(test.id);
                  onCancelTest();
                }}
                className="py-2 px-3 bg-accent-rose hover:opacity-95 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Yes, Leave Test
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
