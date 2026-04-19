import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuizStore } from "@/lib/quiz-store";
import { Trophy, ChevronLeft, ChevronRight, ChevronDown, Check, X, Eye, Lightbulb, RotateCcw } from "lucide-react";

type Phase = "waiting" | "answering" | "leaderboard" | "review";

interface RankedStudent {
  id: string;
  name: string;
  score: number;
  correctCount: number;
  answeredCount: number;
  rank: number;
}

const StudentArena = () => {
  const {
    questions,
    quizStatus,
    students,
    reloadQuestions,
    submitAnswerForQuestion,
    studentAnswers,
    playerId,
    roomSettings,
    nameMasks,
    recoverStudentSession,
  } = useQuizStore();

  const [phase, setPhase] = useState<Phase>("waiting");
  const [localQuestionIndex, setLocalQuestionIndex] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<number, { selected: number; revealed: boolean }>>({});
  const [showHint, setShowHint] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [questionLoadState, setQuestionLoadState] = useState<"idle" | "loading" | "failed">("idle");
  const [questionLoadError, setQuestionLoadError] = useState("");
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
  const [answerSubmitError, setAnswerSubmitError] = useState("");
  const [recovering, setRecovering] = useState(!playerId);

  // Auto-recover student session from localStorage
  useEffect(() => {
    if (playerId) {
      setRecovering(false);
      return;
    }
    let cancelled = false;
    setRecovering(true);
    recoverStudentSession().then((result) => {
      if (cancelled) return;
      setRecovering(false);
      if (!result.success) {
        window.location.replace("/join");
      }
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prevent accidental navigation (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const question = questions[localQuestionIndex];
  const currentAnswer = answeredQuestions[localQuestionIndex];
  const isAnswered = !!currentAnswer;
  const isRevealed = currentAnswer?.revealed ?? false;

  // How many questions answered
  const localAnsweredCount = Object.keys(answeredQuestions).length;
  const allAnswered = localAnsweredCount === questions.length && questions.length > 0;

  // --- Sync phase with quiz status ---
  useEffect(() => {
    if (quizStatus === "active" && phase === "waiting") {
      setPhase("answering");
    }
  }, [quizStatus, phase]);

  // Hydrate local answeredQuestions from DB snapshot (studentAnswers) so review works after refresh/finish.
  useEffect(() => {
    if (!playerId) return;
    if (questions.length === 0) return;
    if (Object.keys(answeredQuestions).length > 0) return;
    if (Object.keys(studentAnswers).length === 0) return;

    const next: Record<number, { selected: number; revealed: boolean }> = {};

    questions.forEach((q, index) => {
      const answersForQuestion = studentAnswers[q.id] || [];
      const mine = answersForQuestion.find((a) => a.studentId === playerId) || null;
      if (!mine) return;
      next[index] = { selected: mine.selectedIndex, revealed: true };
    });

    if (Object.keys(next).length > 0) {
      setAnsweredQuestions(next);
    }
  }, [playerId, questions, studentAnswers, answeredQuestions]);

  useEffect(() => {
    if (!roomSettings.hintModeEnabled && showHint) {
      setShowHint(false);
    }
  }, [roomSettings.hintModeEnabled, showHint]);

  // If quiz is active but no questions are present, retry loading for a short period.
  useEffect(() => {
    if (quizStatus !== "active" || questions.length > 0) {
      return;
    }

    let cancelled = false;
    const loadWithRetry = async () => {
      setQuestionLoadState("loading");
      setQuestionLoadError("");

      for (let attempt = 0; attempt < 10; attempt++) {
        const ok = await reloadQuestions();
        if (cancelled) return;

        if (ok) {
          setQuestionLoadState("idle");
          return;
        }

        if (attempt < 9) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          if (cancelled) return;
        }
      }

      setQuestionLoadState("failed");
      setQuestionLoadError("Sorular henüz gelmedi. Öğretmenin soruları kaydettiğinden emin olun.");
    };

    void loadWithRetry();

    return () => {
      cancelled = true;
    };
  }, [quizStatus, questions.length, reloadQuestions]);

  const retryQuestionLoad = useCallback(async () => {
    setQuestionLoadState("loading");
    setQuestionLoadError("");

    for (let attempt = 0; attempt < 5; attempt++) {
      const ok = await reloadQuestions();
      if (ok) {
        setQuestionLoadState("idle");
        return;
      }

      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    setQuestionLoadState("failed");
    setQuestionLoadError("Sorular halen yüklenemedi. Lütfen öğretmene haber verin.");
  }, [reloadQuestions]);

  // --- Handle answer selection ---
  const handleSelect = useCallback(async (optIndex: number) => {
    if (isAnswered || answerSubmitting || !question) return;

    setAnswerSubmitting(true);
    setAnswerSubmitError("");

    const result = await submitAnswerForQuestion(
      question.id,
      optIndex,
      question.correctIndex,
      question.points,
    );

    if (!result.success) {
      setAnswerSubmitError(result.error || "Cevap kaydedilemedi. Tekrar deneyin.");
      setAnswerSubmitting(false);
      return;
    }

    setAnsweredQuestions((prev) => ({
      ...prev,
      [localQuestionIndex]: { selected: optIndex, revealed: true },
    }));
    setShowHint(false);
    setAnswerSubmitting(false);
  }, [isAnswered, answerSubmitting, question, submitAnswerForQuestion, localQuestionIndex]);

  // --- Navigate to next question ---
  const goNext = useCallback(() => {
    if (localQuestionIndex < questions.length - 1) {
      setLocalQuestionIndex((i) => i + 1);
      setShowHint(false);
      setAnswerSubmitError("");
    } else if (allAnswered) {
      // All questions done → leaderboard
      setPhase("leaderboard");
    }
  }, [localQuestionIndex, questions.length, allAnswered]);

  // --- Navigate to previous question ---
  const goPrev = useCallback(() => {
    if (localQuestionIndex > 0) {
      setLocalQuestionIndex((i) => i - 1);
      setShowHint(false);
      setAnswerSubmitError("");
    }
  }, [localQuestionIndex]);

  // --- Review navigation ---
  const goReviewNext = useCallback(() => {
    if (reviewIndex < questions.length - 1) {
      setReviewIndex((i) => i + 1);
    }
  }, [reviewIndex, questions.length]);

  const goReviewPrev = useCallback(() => {
    if (reviewIndex > 0) {
      setReviewIndex((i) => i - 1);
    }
  }, [reviewIndex]);

  // =================== RENDERS ===================

  // --- RECOVERY loading screen ---
  if (recovering) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5">
        <div className="w-5 h-5 bg-primary rounded-sm animate-pulse" />
        <p className="text-foreground text-lg font-bold">Oturum kurtarılıyor...</p>
        <p className="text-muted-foreground text-sm font-mono">Lütfen bekleyin</p>
      </div>
    );
  }

  // --- WAITING for teacher ---
  if (quizStatus === "idle" || phase === "waiting") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-5 h-5 bg-primary rounded-sm"
        />
        <p className="text-muted-foreground font-mono text-lg uppercase tracking-[0.3em]">
          Quiz Başlıyor...
        </p>
      </div>
    );
  }

  // --- LEADERBOARD (final ranking) ---
  // Note: When quiz is finished we still allow switching to "review" mode.
  if (phase === "leaderboard" || (quizStatus === "finished" && phase !== "review")) {
    const resultsLocked = roomSettings.resultsPublishMode === "manual" && !roomSettings.resultsPublished;
    if (resultsLocked) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
          <p className="text-foreground text-xl font-bold mb-2">Sonuçlar beklemede</p>
          <p className="text-muted-foreground font-medium max-w-md">
            Öğretmen sonuçları yayınladığında sıralama ekranı açılacak. Bu sırada kendi cevaplarını soru soru
            inceleyebilirsin.
          </p>

          <div className="mt-8 flex flex-col gap-3 w-full max-w-md">
            <button
              onClick={() => {
                setReviewIndex(0);
                setPhase("review");
              }}
              className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all duration-100"
            >
              <Eye size={18} />
              Cevaplarını İncele
            </button>
            <a
              href="/"
              className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl border border-border text-muted-foreground font-bold text-sm uppercase tracking-wider hover:border-primary hover:text-primary transition-all duration-100"
            >
              ← Ana Sayfa
            </a>
          </div>
        </div>
      );
    }

    const localCorrectCount = Object.entries(answeredQuestions).filter(([idx]) => {
      const q = questions[Number(idx)];
      const a = answeredQuestions[Number(idx)];
      return q && a && a.selected === q.correctIndex;
    }).length;

    const answerStats = new Map<string, { correct: number; answeredQuestionIds: Set<number> }>();
    Object.entries(studentAnswers).forEach(([questionIdStr, answers]) => {
      const questionId = Number(questionIdStr);
      answers.forEach((answer) => {
        if (!answerStats.has(answer.studentId)) {
          answerStats.set(answer.studentId, { correct: 0, answeredQuestionIds: new Set<number>() });
        }
        const stat = answerStats.get(answer.studentId);
        if (!stat) return;
        stat.answeredQuestionIds.add(questionId);
        if (answer.isCorrect) stat.correct += 1;
      });
    });

    const allSorted: RankedStudent[] = [...students]
      .map((s) => {
        const stat = answerStats.get(s.id);
        const isCurrentPlayer = s.id === playerId;
        const correctCount = stat?.correct ?? (isCurrentPlayer ? localCorrectCount : 0);
        const answeredCount = stat?.answeredQuestionIds.size ?? (isCurrentPlayer ? localAnsweredCount : 0);
        return {
          id: s.id,
          name: s.name,
          score: s.score,
          correctCount,
          answeredCount,
          rank: 0,
        };
      })
      .filter((s) => questions.length > 0 && s.answeredCount >= questions.length)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
        return a.name.localeCompare(b.name);
      })
      .map((s, i) => ({ ...s, rank: i + 1 }));

    if (allSorted.length === 0) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
          <p className="text-foreground text-xl font-bold mb-2">Sonuclar hazirlaniyor</p>
          <p className="text-muted-foreground font-medium">
            Siralamaya sadece tum sorulari tamamlayan ogrenciler eklenir.
          </p>
        </div>
      );
    }

    const topFive = allSorted.slice(0, 5);
    const myStudent = allSorted.find((student) => student.id === playerId) ?? null;
    const getLeaderboardName = (studentId: string, rawName: string) => {
      const mask = nameMasks[studentId];
      if (mask?.enabled && studentId !== playerId) {
        return mask.maskedName || rawName;
      }
      return rawName;
    };

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3 mb-10"
        >
          <Trophy size={36} className="text-primary" />
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground uppercase tracking-wider">
            Sonuçlar
          </h1>
        </motion.div>

        <div className="w-full max-w-md mb-8">
          <p className="text-center text-muted-foreground/70 font-mono text-xs uppercase tracking-[0.2em] mb-4">
            Ilk 5 siralama
          </p>
          <AnimatePresence initial={false}>
            {topFive.map((student, i) => (
              <motion.div
                key={student.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: i * 0.03 }}
                className={`flex items-center gap-3 mb-2 px-4 py-3 rounded-lg border bg-card ${
                  student.rank === 1 ? "border-primary/60" : "border-border"
                }`}
              >
                <span className="font-extrabold font-mono text-lg min-w-[2rem] text-center text-primary">
                  {String(student.rank).padStart(2, "0")}
                </span>
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-secondary text-foreground">
                  {getLeaderboardName(student.id, student.name).charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-bold text-sm truncate">
                    {getLeaderboardName(student.id, student.name)}
                  </p>
                  <p className="font-mono text-xs">
                    <span className="text-success font-bold">{student.correctCount}</span>
                    <span className="text-muted-foreground">/{questions.length}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-primary font-extrabold font-mono text-lg">{student.score}</p>
                  <p className="text-muted-foreground font-mono text-[10px] uppercase">puan</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="w-full max-w-md mb-8">
          <p className="text-center text-muted-foreground/70 font-mono text-xs uppercase tracking-[0.2em] mb-4">
            Senin siralaman
          </p>
          {myStudent ? (
            <motion.div
              key={myStudent.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/70 bg-primary/15"
            >
              <span className="font-extrabold font-mono text-lg min-w-[2rem] text-center text-primary">
                {String(myStudent.rank).padStart(2, "0")}
              </span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-primary/25 text-foreground">
                {myStudent.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-bold text-sm truncate">{myStudent.name}</p>
                <p className="font-mono text-xs">
                  <span className="text-success font-bold">{myStudent.correctCount}</span>
                  <span className="text-muted-foreground">/{questions.length}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-primary font-extrabold font-mono text-lg">{myStudent.score}</p>
                <p className="text-muted-foreground font-mono text-[10px] uppercase">puan</p>
              </div>
            </motion.div>
          ) : (
            <div className="px-4 py-3 rounded-lg border border-border bg-card text-center">
              <p className="text-muted-foreground font-mono text-xs">Siralaman hesaplaniyor...</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="flex flex-col gap-3 w-full max-w-md"
        >
          <button
            onClick={() => {
              setReviewIndex(0);
              setPhase("review");
            }}
            className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all duration-100"
          >
            <Eye size={18} />
            Cevaplarını İncele
          </button>
          <a
            href="/"
            className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl border border-border text-muted-foreground font-bold text-sm uppercase tracking-wider hover:border-primary hover:text-primary transition-all duration-100"
          >
            ← Ana Sayfa
          </a>
        </motion.div>
      </div>
    );
  }

  // --- REVIEW MODE ---
  if (phase === "review") {
    const reviewQuestion = questions[reviewIndex];
    const reviewAnswer = answeredQuestions[reviewIndex];

    if (!reviewQuestion) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
          <p className="text-foreground text-xl font-bold mb-2">İnceleme için soru bulunamadı</p>
          <p className="text-muted-foreground font-medium mb-6">
            Sıralamaya dönerek tekrar deneyin.
          </p>
          <button
            onClick={() => setPhase("leaderboard")}
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:brightness-110 transition-all duration-100"
          >
            Sıralamaya Dön
          </button>
        </div>
      );
    }

    const isCorrectAnswer = reviewAnswer?.selected === reviewQuestion.correctIndex;

    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Top bar */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setPhase("leaderboard")}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-wider"
          >
            <RotateCcw size={16} />
            Sıralamaya Dön
          </button>
          <span className="text-muted-foreground font-mono text-sm font-bold uppercase tracking-wider">
            İnceleme {reviewIndex + 1} / {questions.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-secondary">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${((reviewIndex + 1) / questions.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Review result badge */}
        <div className="flex justify-center pt-6">
          <motion.div
            key={reviewIndex}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
              isCorrectAnswer
                ? "bg-success/10 text-success border border-success/30"
                : "bg-destructive/10 text-destructive border border-destructive/30"
            }`}
          >
            {isCorrectAnswer ? <Check size={16} /> : <X size={16} />}
            {isCorrectAnswer ? "Doğru cevapladın" : "Yanlış cevapladın"}
          </motion.div>
        </div>

        {/* Question */}
        <div className="flex-1 flex flex-col items-center px-6 py-6 max-w-3xl mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={reviewIndex}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <div className="flex items-start gap-4 mb-8">
                <span className="text-muted-foreground font-mono text-lg font-bold mt-1">{reviewIndex + 1}.</span>
                <h2 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight">
                  {reviewQuestion.text}
                </h2>
              </div>

              {/* Options - vertical layout like the reference image */}
              <div className="flex flex-col gap-3">
                {reviewQuestion.options.map((opt, i) => {
                  const isCorrect = i === reviewQuestion.correctIndex;
                  const isSelected = reviewAnswer?.selected === i;
                  const explanation = reviewQuestion.explanations?.[i];
                  const showExplanation = isSelected || isCorrect;

                  let borderStyle = "border-border";
                  let bgStyle = "bg-card";
                  if (isCorrect) {
                    borderStyle = "border-success";
                    bgStyle = "bg-success/5";
                  } else if (isSelected && !isCorrect) {
                    borderStyle = "border-destructive";
                    bgStyle = "bg-destructive/5";
                  }

                  return (
                    <div
                      key={i}
                      className={`border-2 rounded-xl px-5 py-4 transition-all duration-200 ${borderStyle} ${bgStyle}`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-base opacity-50 min-w-[1.5rem]">
                          {String.fromCharCode(65 + i)}.
                        </span>
                        <span className="flex-1 text-foreground font-semibold text-lg">{opt}</span>
                        {isCorrect && <Check size={20} className="text-success flex-shrink-0" />}
                        {isSelected && !isCorrect && <X size={20} className="text-destructive flex-shrink-0" />}
                      </div>

                      {/* Explanation text */}
                      {showExplanation && explanation && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: 0.2 }}
                          className="mt-3 ml-10"
                        >
                          <div className={`flex items-start gap-2 ${isCorrect ? "text-success" : "text-destructive"}`}>
                            {isCorrect ? (
                              <>
                                <Check size={14} className="mt-0.5 flex-shrink-0" />
                                <p className="text-sm font-bold">Doğru cevap</p>
                              </>
                            ) : (
                              <>
                                <X size={14} className="mt-0.5 flex-shrink-0" />
                                <p className="text-sm font-bold">Pek doğru değil</p>
                              </>
                            )}
                          </div>
                          <p className={`text-sm mt-1 ml-5 leading-relaxed ${isCorrect ? "text-success/80" : "text-destructive/80"}`}>
                            {explanation}
                          </p>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom navigation */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between">
          <button
            onClick={goReviewPrev}
            disabled={reviewIndex === 0}
            className="flex items-center gap-2 px-5 py-3 rounded-lg border border-border text-muted-foreground font-bold text-sm uppercase tracking-wider hover:border-primary hover:text-primary transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
            Önceki
          </button>

          {/* Dot indicators */}
          <div className="flex gap-2 flex-wrap justify-center max-w-[200px]">
            {questions.map((_, i) => {
              const ans = answeredQuestions[i];
              const correct = ans?.selected === questions[i].correctIndex;
              return (
                <button
                  key={i}
                  onClick={() => setReviewIndex(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                    i === reviewIndex
                      ? "bg-primary scale-125"
                      : correct
                      ? "bg-success/60"
                      : "bg-destructive/60"
                  }`}
                />
              );
            })}
          </div>

          <button
            onClick={goReviewNext}
            disabled={reviewIndex === questions.length - 1}
            className="flex items-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Sonraki
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // --- ANSWERING PHASE ---
  if (!question) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <p className="text-foreground text-xl font-bold mb-2">
          {questionLoadState === "loading" ? "Sorular yükleniyor..." : "Soru verisi bulunamadı"}
        </p>
        <p className="text-muted-foreground font-medium mb-6">
          {questionLoadError || "Sorular otomatik olarak senkronize ediliyor, lütfen birkaç saniye bekleyin."}
        </p>
        {questionLoadState !== "loading" && (
          <button
            onClick={retryQuestionLoad}
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:brightness-110 transition-all duration-100"
          >
            Tekrar Dene
          </button>
        )}
      </div>
    );
  }

  const getOptionStyle = (i: number) => {
    if (!isRevealed) {
      return "border-border hover:border-primary hover:bg-primary/5 text-foreground";
    }
    const isCorrect = i === question.correctIndex;
    const isSelected = currentAnswer?.selected === i;

    if (isCorrect) return "border-success bg-success/5 text-foreground";
    if (isSelected && !isCorrect) return "border-destructive bg-destructive/5 text-foreground";
    return "border-border text-muted-foreground opacity-40";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-sm font-bold uppercase tracking-wider">
          Soru {localQuestionIndex + 1} / {questions.length}
        </span>
        <div className="flex items-center gap-3">
          {/* Answered count */}
          <div className="flex items-center gap-1.5">
            <X size={14} className="text-destructive" />
            <span className="text-destructive font-mono text-sm font-bold">
              {Object.entries(answeredQuestions).filter(([idx]) => {
                const q = questions[Number(idx)];
                const a = answeredQuestions[Number(idx)];
                return q && a && a.selected !== q.correctIndex;
              }).length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check size={14} className="text-success" />
            <span className="text-success font-mono text-sm font-bold">
              {Object.entries(answeredQuestions).filter(([idx]) => {
                const q = questions[Number(idx)];
                const a = answeredQuestions[Number(idx)];
                return q && a && a.selected === q.correctIndex;
              }).length}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-secondary">
        <motion.div
          className="h-full bg-primary"
          initial={false}
          animate={{ width: `${((localQuestionIndex + (isRevealed ? 1 : 0)) / questions.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center px-6 py-8 max-w-3xl mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={localQuestionIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {/* Question number + text */}
            <div className="flex items-start gap-4 mb-8">
              <span className="text-muted-foreground font-mono text-lg font-bold mt-1">{localQuestionIndex + 1}.</span>
              <h2 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight">
                {question.text}
              </h2>
            </div>

            {/* Options - vertical layout */}
            <div className="flex flex-col gap-3">
              {answerSubmitError && (
                <p className="text-destructive text-sm font-semibold">{answerSubmitError}</p>
              )}
              {answerSubmitting && (
                <p className="text-primary text-sm font-semibold">Cevap kaydediliyor...</p>
              )}
              {question.options.map((opt, i) => {
                const isCorrect = i === question.correctIndex;
                const isSelected = currentAnswer?.selected === i;
                const explanation = question.explanations?.[i];
                const showExplanation = isRevealed && (isSelected || isCorrect) && explanation;

                return (
                  <motion.button
                    key={i}
                    onClick={() => handleSelect(i)}
                    disabled={isAnswered || answerSubmitting}
                    className={`relative text-left border-2 rounded-xl px-5 py-4 transition-all duration-200 disabled:cursor-default ${getOptionStyle(i)}`}
                    whileHover={!isAnswered && !answerSubmitting ? { scale: 1.01 } : {}}
                    whileTap={!isAnswered && !answerSubmitting ? { scale: 0.99 } : {}}
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-base opacity-50 min-w-[1.5rem]">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <span className="flex-1 font-semibold text-lg">{opt}</span>

                      {/* Icons on reveal */}
                      {isRevealed && isCorrect && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <Check size={20} className="text-success flex-shrink-0" />
                        </motion.div>
                      )}
                      {isRevealed && isSelected && !isCorrect && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <X size={20} className="text-destructive flex-shrink-0" />
                        </motion.div>
                      )}
                    </div>

                    {/* Inline explanation */}
                    <AnimatePresence>
                      {showExplanation && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="mt-3 ml-10"
                        >
                          <div className={`flex items-start gap-2 ${isCorrect ? "text-success" : "text-destructive"}`}>
                            {isCorrect ? (
                              <>
                                <Check size={14} className="mt-0.5 flex-shrink-0" />
                                <p className="text-sm font-bold">Doğru!</p>
                              </>
                            ) : (
                              <>
                                <X size={14} className="mt-0.5 flex-shrink-0" />
                                <p className="text-sm font-bold">Pek doğru değil</p>
                              </>
                            )}
                          </div>
                          <p className={`text-sm mt-1 ml-5 leading-relaxed ${isCorrect ? "text-success/80" : "text-destructive/80"}`}>
                            {explanation}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>

            {/* Hint section */}
            {roomSettings.hintModeEnabled && question.hint && !isRevealed && (
              <div className="mt-6">
                <button
                  onClick={() => setShowHint(!showHint)}
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-medium"
                >
                  <Lightbulb size={16} />
                  İpucu göster
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showHint ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {showHint && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20"
                    >
                      <p className="text-sm text-primary/80 leading-relaxed">{question.hint}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <div className="border-t border-border px-6 py-4 flex items-center justify-between">
        <button
          onClick={goPrev}
          disabled={localQuestionIndex === 0}
          className="flex items-center gap-2 px-5 py-3 rounded-lg border border-border text-muted-foreground font-bold text-sm uppercase tracking-wider hover:border-primary hover:text-primary transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={18} />
          Önceki
        </button>

        {/* Dot indicators */}
        <div className="flex gap-2 flex-wrap justify-center max-w-[200px]">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => { setLocalQuestionIndex(i); setShowHint(false); setAnswerSubmitError(""); }}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                i === localQuestionIndex
                  ? "bg-primary scale-125"
                  : answeredQuestions[i]
                  ? "bg-primary/40"
                  : "bg-border"
              }`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={!isRevealed}
          className="flex items-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          {localQuestionIndex === questions.length - 1 && allAnswered ? "Bitir" : "Sonraki"}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default StudentArena;
