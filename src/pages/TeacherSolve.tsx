import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuizStore } from "@/lib/quiz-store";
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Check, X, Lightbulb, RotateCcw } from "lucide-react";

type Phase = "waiting" | "answering" | "review";

const TeacherSolve = () => {
  const navigate = useNavigate();
  const { questions, quizStatus, reloadQuestions } = useQuizStore();

  const [phase, setPhase] = useState<Phase>("waiting");
  const [localQuestionIndex, setLocalQuestionIndex] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<number, { selected: number; revealed: boolean }>>({});
  const [showHint, setShowHint] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [questionLoadState, setQuestionLoadState] = useState<"idle" | "loading" | "failed">("idle");
  const [questionLoadError, setQuestionLoadError] = useState("");

  const question = questions[localQuestionIndex];
  const currentAnswer = answeredQuestions[localQuestionIndex];
  const isAnswered = !!currentAnswer;
  const isRevealed = currentAnswer?.revealed ?? false;

  const localAnsweredCount = Object.keys(answeredQuestions).length;
  const allAnswered = localAnsweredCount === questions.length && questions.length > 0;

  useEffect(() => {
    if (phase === "waiting" && (quizStatus === "active" || quizStatus === "reviewing" || quizStatus === "finished")) {
      setPhase("answering");
    }
  }, [quizStatus, phase]);

  useEffect(() => {
    if (phase !== "answering" || questions.length > 0) return;
    let cancelled = false;

    const loadWithRetry = async () => {
      setQuestionLoadState("loading");
      setQuestionLoadError("");

      for (let attempt = 0; attempt < 8; attempt++) {
        const ok = await reloadQuestions();
        if (cancelled) return;

        if (ok) {
          setQuestionLoadState("idle");
          return;
        }

        if (attempt < 7) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (cancelled) return;
        }
      }

      setQuestionLoadState("failed");
      setQuestionLoadError("Sorular yuklenemedi. Ogretmen paneline donup senkron deneyin.");
    };

    void loadWithRetry();
    return () => {
      cancelled = true;
    };
  }, [phase, questions.length, reloadQuestions]);

  const retryQuestionLoad = useCallback(async () => {
    setQuestionLoadState("loading");
    setQuestionLoadError("");
    for (let attempt = 0; attempt < 4; attempt++) {
      const ok = await reloadQuestions();
      if (ok) {
        setQuestionLoadState("idle");
        return;
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }
    setQuestionLoadState("failed");
    setQuestionLoadError("Sorular halen yuklenemedi.");
  }, [reloadQuestions]);

  const handleSelect = useCallback((optIndex: number) => {
    if (isAnswered || !question) return;
    setAnsweredQuestions((prev) => ({
      ...prev,
      [localQuestionIndex]: { selected: optIndex, revealed: true },
    }));
    setShowHint(false);
  }, [isAnswered, question, localQuestionIndex]);

  const goNext = useCallback(() => {
    if (localQuestionIndex < questions.length - 1) {
      setLocalQuestionIndex((i) => i + 1);
      setShowHint(false);
    } else if (allAnswered) {
      setReviewIndex(0);
      setPhase("review");
    }
  }, [localQuestionIndex, questions.length, allAnswered]);

  const goPrev = useCallback(() => {
    if (localQuestionIndex > 0) {
      setLocalQuestionIndex((i) => i - 1);
      setShowHint(false);
    }
  }, [localQuestionIndex]);

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

  if (phase === "waiting") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b border-border px-8 py-5 flex items-center gap-4">
          <button onClick={() => navigate("/teacher/dashboard")} className="text-muted-foreground hover:text-primary transition-colors duration-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold uppercase tracking-[0.2em] text-foreground">
            Ogretmen Cevap Modu
          </h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            className="w-5 h-5 bg-primary rounded-sm"
          />
          <p className="text-foreground text-xl font-bold">Test henuz baslamadi</p>
          <p className="text-muted-foreground font-medium">
            Test baslayinca bu ekranda ogrencilerle birlikte cozebilirsiniz.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    const reviewQuestion = questions[reviewIndex];
    const reviewAnswer = answeredQuestions[reviewIndex];

    if (!reviewQuestion) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
          <p className="text-foreground text-xl font-bold mb-2">Inceleme icin soru bulunamadi</p>
          <button
            onClick={() => setPhase("answering")}
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:brightness-110 transition-all duration-100"
          >
            Cevap ekranina don
          </button>
        </div>
      );
    }

    const isCorrectAnswer = reviewAnswer?.selected === reviewQuestion.correctIndex;

    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setPhase("answering")}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-bold uppercase tracking-wider"
          >
            <RotateCcw size={16} />
            Cevap ekranina don
          </button>
          <span className="text-muted-foreground font-mono text-sm font-bold uppercase tracking-wider">
            Inceleme {reviewIndex + 1} / {questions.length}
          </span>
        </div>

        <div className="w-full h-1 bg-secondary">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${((reviewIndex + 1) / questions.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="flex justify-center pt-6">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
            isCorrectAnswer
              ? "bg-success/10 text-success border border-success/30"
              : "bg-destructive/10 text-destructive border border-destructive/30"
          }`}>
            {isCorrectAnswer ? <Check size={16} /> : <X size={16} />}
            {isCorrectAnswer ? "Dogru cevapladiniz" : "Yanlis cevapladiniz"}
          </div>
        </div>

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

              <div className="flex flex-col gap-3">
                {reviewQuestion.options.map((opt, i) => {
                  const isCorrect = i === reviewQuestion.correctIndex;
                  const isSelected = reviewAnswer?.selected === i;
                  const explanation = reviewQuestion.explanations?.[i];
                  const showExplanation = isSelected || isCorrect;
                  const borderStyle = isCorrect
                    ? "border-success bg-success/5"
                    : isSelected
                    ? "border-destructive bg-destructive/5"
                    : "border-border bg-card";

                  return (
                    <div key={i} className={`border-2 rounded-xl px-5 py-4 ${borderStyle}`}>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-base opacity-50 min-w-[1.5rem]">{String.fromCharCode(65 + i)}.</span>
                        <span className="flex-1 text-foreground font-semibold text-lg">{opt}</span>
                        {isCorrect && <Check size={20} className="text-success flex-shrink-0" />}
                        {isSelected && !isCorrect && <X size={20} className="text-destructive flex-shrink-0" />}
                      </div>
                      {showExplanation && explanation && (
                        <p className={`text-sm mt-3 ml-10 leading-relaxed ${isCorrect ? "text-success/80" : "text-destructive/80"}`}>
                          {explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="border-t border-border px-6 py-4 flex items-center justify-between">
          <button
            onClick={goReviewPrev}
            disabled={reviewIndex === 0}
            className="flex items-center gap-2 px-5 py-3 rounded-lg border border-border text-muted-foreground font-bold text-sm uppercase tracking-wider hover:border-primary hover:text-primary transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
            Onceki
          </button>

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

  if (!question) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b border-border px-8 py-5 flex items-center gap-4">
          <button onClick={() => navigate("/teacher/dashboard")} className="text-muted-foreground hover:text-primary transition-colors duration-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold uppercase tracking-[0.2em] text-foreground">
            Ogretmen Cevap Modu
          </h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-foreground text-xl font-bold mb-2">
            {questionLoadState === "loading" ? "Sorular yukleniyor..." : "Soru verisi bulunamadi"}
          </p>
          <p className="text-muted-foreground font-medium mb-6">
            {questionLoadError || "Senkron tamamlanana kadar lutfen bekleyin."}
          </p>
          {questionLoadState !== "loading" && (
            <button
              onClick={retryQuestionLoad}
              className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:brightness-110 transition-all duration-100"
            >
              Tekrar dene
            </button>
          )}
        </div>
      </div>
    );
  }

  const getOptionStyle = (i: number) => {
    if (!isRevealed) return "border-border hover:border-primary hover:bg-primary/5 text-foreground";
    const isCorrect = i === question.correctIndex;
    const isSelected = currentAnswer?.selected === i;
    if (isCorrect) return "border-success bg-success/5 text-foreground";
    if (isSelected && !isCorrect) return "border-destructive bg-destructive/5 text-foreground";
    return "border-border text-muted-foreground opacity-40";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/teacher/dashboard")} className="text-muted-foreground hover:text-primary transition-colors duration-100">
            <ArrowLeft size={18} />
          </button>
          <span className="text-muted-foreground font-mono text-sm font-bold uppercase tracking-wider">
            Ogretmen Cevap Modu
          </span>
        </div>
        <span className="text-primary/90 font-mono text-xs font-bold uppercase tracking-wider">
          Siralamaya etki etmez
        </span>
      </div>

      <div className="w-full h-1 bg-secondary">
        <motion.div
          className="h-full bg-primary"
          initial={false}
          animate={{ width: `${((localQuestionIndex + (isRevealed ? 1 : 0)) / questions.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 py-8 max-w-3xl mx-auto w-full">
        <div className="w-full rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-6">
          <p className="text-xs font-mono text-primary font-bold uppercase tracking-wider">
            Bu mod sadece ogretmen icindir. Cevaplar kaydedilmez, puan ve leaderboard degismez.
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={localQuestionIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            <div className="flex items-start gap-4 mb-8">
              <span className="text-muted-foreground font-mono text-lg font-bold mt-1">{localQuestionIndex + 1}.</span>
              <h2 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight">
                {question.text}
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              {question.options.map((opt, i) => {
                const isCorrect = i === question.correctIndex;
                const isSelected = currentAnswer?.selected === i;
                const explanation = question.explanations?.[i];
                const showExplanation = isRevealed && (isSelected || isCorrect) && explanation;

                return (
                  <motion.button
                    key={i}
                    onClick={() => handleSelect(i)}
                    disabled={isAnswered}
                    className={`relative text-left border-2 rounded-xl px-5 py-4 transition-all duration-200 disabled:cursor-default ${getOptionStyle(i)}`}
                    whileHover={!isAnswered ? { scale: 1.01 } : {}}
                    whileTap={!isAnswered ? { scale: 0.99 } : {}}
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-base opacity-50 min-w-[1.5rem]">{String.fromCharCode(65 + i)}.</span>
                      <span className="flex-1 font-semibold text-lg">{opt}</span>
                      {isRevealed && isCorrect && <Check size={20} className="text-success flex-shrink-0" />}
                      {isRevealed && isSelected && !isCorrect && <X size={20} className="text-destructive flex-shrink-0" />}
                    </div>

                    <AnimatePresence>
                      {showExplanation && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="mt-3 ml-10"
                        >
                          <p className={`text-sm leading-relaxed ${isCorrect ? "text-success/80" : "text-destructive/80"}`}>
                            {explanation}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>

            {question.hint && !isRevealed && (
              <div className="mt-6">
                <button
                  onClick={() => setShowHint(!showHint)}
                  className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-medium"
                >
                  <Lightbulb size={16} />
                  Ipucu goster
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

      <div className="border-t border-border px-6 py-4 flex items-center justify-between">
        <button
          onClick={goPrev}
          disabled={localQuestionIndex === 0}
          className="flex items-center gap-2 px-5 py-3 rounded-lg border border-border text-muted-foreground font-bold text-sm uppercase tracking-wider hover:border-primary hover:text-primary transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={18} />
          Onceki
        </button>

        <button
          onClick={goNext}
          disabled={!isRevealed}
          className="flex items-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          {localQuestionIndex === questions.length - 1 && allAnswered ? "Incele" : "Sonraki"}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default TeacherSolve;
