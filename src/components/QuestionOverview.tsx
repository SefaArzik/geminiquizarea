import { useEffect, useMemo, useState } from "react";
import { useQuizStore } from "@/lib/quiz-store";
import { CheckCircle, Hash, Eye, EyeOff, Users, UserCheck, UserX, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const QuestionOverview = () => {
  const roomId = useQuizStore((s) => s.roomId);
  const questions = useQuizStore((s) => s.questions);
  const players = useQuizStore((s) => s.players);
  const students = useQuizStore((s) => s.students);
  const studentAnswers = useQuizStore((s) => s.studentAnswers);
  const fetchAnswers = useQuizStore((s) => s.fetchAnswers);
  const totalUsers = students.length > 0 ? students.length : players.length;

  // Per-question answer visibility toggle
  const [revealedQuestions, setRevealedQuestions] = useState<Set<number>>(new Set());

  // Initial snapshot load; live updates come via realtime events in store.
  useEffect(() => {
    if (roomId) {
      void fetchAnswers();
    }
  }, [roomId, fetchAnswers]);

  const toggleReveal = (questionId: number) => {
    setRevealedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const summary = useMemo(() => {
    const groups = Object.values(studentAnswers);
    let totalCorrect = 0;
    let totalWrong = 0;
    let answeredCount = 0;

    groups.forEach((answers) => {
      answers.forEach((a) => {
        if (a.isCorrect) totalCorrect += 1;
        else totalWrong += 1;
        answeredCount += 1;
      });
    });

    return {
      avgCorrect:
        questions.length > 0 && groups.length > 0
          ? (totalCorrect / groups.length).toFixed(1)
          : "0",
      avgWrong:
        questions.length > 0 && groups.length > 0
          ? (totalWrong / groups.length).toFixed(1)
          : "0",
      correctPercent: answeredCount > 0 ? Math.round((totalCorrect / answeredCount) * 100) : 0,
      wrongPercent: answeredCount > 0 ? Math.round((totalWrong / answeredCount) * 100) : 0,
    };
  }, [studentAnswers, questions.length]);

  return (
    <div className="p-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="border border-border rounded bg-card p-5 flex flex-col items-center gap-2">
          <Users size={20} className="text-primary" />
          <span className="text-3xl font-extrabold font-mono text-primary">{totalUsers}</span>
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Toplam Kullanici</span>
        </div>
        <div className="border border-border rounded bg-card p-5 flex flex-col items-center gap-2">
          <Hash size={20} className="text-primary" />
          <span className="text-3xl font-extrabold font-mono text-primary">{questions.length}</span>
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Toplam Soru</span>
        </div>
        <div className="border border-success/30 rounded bg-success/5 p-5 flex flex-col items-center gap-2">
          <CheckCircle size={20} className="text-success" />
          <span className="text-3xl font-extrabold font-mono text-success">{summary.avgCorrect}</span>
          <span className="text-xs font-mono text-success/70 uppercase tracking-wider">Ort. Doğru</span>
          <span className="text-xs font-mono text-success/50">%{summary.correctPercent}</span>
        </div>
        <div className="border border-destructive/30 rounded bg-destructive/5 p-5 flex flex-col items-center gap-2">
          <X size={20} className="text-destructive" />
          <span className="text-3xl font-extrabold font-mono text-destructive">{summary.avgWrong}</span>
          <span className="text-xs font-mono text-destructive/70 uppercase tracking-wider">Ort. Yanlış</span>
          <span className="text-xs font-mono text-destructive/50">%{summary.wrongPercent}</span>
        </div>
      </div>

      {/* Section Title */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold tracking-widest uppercase text-muted-foreground">
          Tüm Sorular
        </h2>
        <span className="font-mono text-sm text-muted-foreground">
          {questions.length} soru
        </span>
      </div>

      {/* Question Cards */}
      <div className="flex flex-col gap-5">
        {questions.map((question, qIndex) => {
          const isRevealed = revealedQuestions.has(question.id);
          const answers = studentAnswers[question.id] || [];
          const correctAnswers = answers.filter((a) => a.isCorrect);
          const wrongAnswers = answers.filter((a) => !a.isCorrect);
          const correctPercent = answers.length > 0 ? Math.round((correctAnswers.length / answers.length) * 100) : 0;

          return (
            <motion.div
              key={question.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: qIndex * 0.05 }}
              className="border border-border rounded bg-card overflow-hidden"
            >
              {/* Question Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xl font-bold text-primary">
                    {String(qIndex + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => toggleReveal(question.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-mono font-bold uppercase tracking-wider transition-all duration-150 ${
                      isRevealed
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"
                    }`}
                  >
                    {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                    {isRevealed ? "Gizle" : "Cevabı Göster"}
                  </button>
                </div>
              </div>

              {/* Question Content: two panels */}
              <div className="flex flex-col lg:flex-row">
                {/* Left: Question + Options */}
                <div className="flex-1 px-6 py-5 border-b lg:border-b-0 lg:border-r border-border">
                  <p className="text-lg font-semibold text-foreground mb-5">{question.text}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {question.options.map((opt, i) => {
                      const isCorrect = i === question.correctIndex;
                      const optionPickCount = answers.filter((a) => a.selectedIndex === i).length;
                      const optionPickPercent = answers.length > 0 ? Math.round((optionPickCount / answers.length) * 100) : 0;
                      const hasStats = answers.length > 0;

                      return (
                        <div
                          key={i}
                          className={`relative flex items-center gap-3 px-4 py-3 rounded border transition-all duration-200 overflow-hidden ${
                            isRevealed && isCorrect
                              ? "border-success/50 bg-success/5"
                              : isRevealed && !isCorrect && optionPickCount > 0
                              ? "border-destructive/30 bg-destructive/5"
                              : "border-border bg-background"
                          }`}
                        >
                          {/* Background fill bar showing pick rate */}
                          {hasStats && (
                            <motion.div
                              className={`absolute inset-y-0 left-0 ${
                                isRevealed && isCorrect
                                  ? "bg-success/10"
                                  : isRevealed && !isCorrect && optionPickCount > 0
                                  ? "bg-destructive/8"
                                  : "bg-primary/5"
                              }`}
                              initial={{ width: 0 }}
                              animate={{ width: `${optionPickPercent}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                          )}

                          <span
                            className={`relative font-mono text-sm font-bold min-w-[1.5rem] ${
                              isRevealed && isCorrect ? "text-success" : "text-muted-foreground"
                            }`}
                          >
                            {String.fromCharCode(65 + i)}.
                          </span>
                          <span
                            className={`relative text-sm font-medium flex-1 ${
                              isRevealed && isCorrect ? "text-success" : "text-foreground"
                            }`}
                          >
                            {opt}
                          </span>

                          {/* Pick percentage badge */}
                          {hasStats && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`relative flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded ${
                                isRevealed && isCorrect
                                  ? "text-success bg-success/15"
                                  : isRevealed && !isCorrect && optionPickCount > 0
                                  ? "text-destructive bg-destructive/15"
                                  : "text-muted-foreground bg-secondary"
                              }`}
                            >
                              {optionPickPercent}%
                            </motion.span>
                          )}

                          <AnimatePresence>
                            {isRevealed && isCorrect && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ duration: 0.15 }}
                                className="relative"
                              >
                                <CheckCircle size={16} className="text-success flex-shrink-0" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Statistics Panel */}
                {answers.length > 0 && (
                  <div className="w-full lg:w-72 px-5 py-5 flex flex-col gap-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Users size={14} className="text-muted-foreground" />
                      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider font-bold">
                        İstatistikler
                      </span>
                    </div>

                    <div className="w-full">
                      <div className="flex justify-between text-xs font-mono mb-2">
                        <span className="text-success font-bold">%{correctPercent} Doğru</span>
                        <span className="text-destructive font-bold">%{100 - correctPercent} Yanlış</span>
                      </div>
                      <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden flex">
                        <div className="h-full bg-success transition-all duration-300" style={{ width: `${correctPercent}%` }} />
                        <div className="h-full bg-destructive transition-all duration-300" style={{ width: `${100 - correctPercent}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <UserCheck size={12} className="text-success" />
                        <span className="text-xs font-mono text-success font-bold uppercase tracking-wider">
                          Doğru ({correctAnswers.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {correctAnswers.map((a) => (
                          <span
                            key={a.studentId}
                            className="text-xs font-medium px-2 py-1 rounded bg-success/10 text-success border border-success/20"
                          >
                            {a.studentName.split(" ")[0]}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <UserX size={12} className="text-destructive" />
                        <span className="text-xs font-mono text-destructive font-bold uppercase tracking-wider">
                          Yanlış ({wrongAnswers.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {wrongAnswers.map((a) => (
                          <span
                            key={a.studentId}
                            className="text-xs font-medium px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/20"
                          >
                            {a.studentName.split(" ")[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default QuestionOverview;
