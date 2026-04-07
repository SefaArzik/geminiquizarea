import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuizStore } from "@/lib/quiz-store";
import { Users, Eye, EyeOff } from "lucide-react";

type RankedResult = {
  id: string;
  name: string;
  score: number;
  correctCount: number;
  answeredCount: number;
};

const Leaderboard = () => {
  const students = useQuizStore((s) => s.students);
  const players = useQuizStore((s) => s.players);
  const questions = useQuizStore((s) => s.questions);
  const studentAnswers = useQuizStore((s) => s.studentAnswers);
  const nameMasks = useQuizStore((s) => s.nameMasks);
  const togglePlayerNameMask = useQuizStore((s) => s.togglePlayerNameMask);
  const [maskingId, setMaskingId] = useState<string | null>(null);
  const [maskError, setMaskError] = useState("");

  const totalQuestionCount = questions.length;

  const rankedCompleted = useMemo<RankedResult[]>(() => {
    const statsMap = new Map<string, { correct: number; answeredQuestionIds: Set<number> }>();

    Object.entries(studentAnswers).forEach(([questionIdStr, answers]) => {
      const questionId = Number(questionIdStr);
      answers.forEach((answer) => {
        if (!statsMap.has(answer.studentId)) {
          statsMap.set(answer.studentId, { correct: 0, answeredQuestionIds: new Set<number>() });
        }

        const studentStat = statsMap.get(answer.studentId);
        if (!studentStat) return;

        studentStat.answeredQuestionIds.add(questionId);
        if (answer.isCorrect) studentStat.correct += 1;
      });
    });

    const baseList = students.length > 0
      ? students
      : players.map((p) => ({ id: p.id, name: p.name, score: 0, streak: 0 }));

    return baseList
      .map((student) => {
        const stats = statsMap.get(student.id);
        const answeredCount = stats?.answeredQuestionIds.size || 0;
        const correctCount = stats?.correct || 0;

        return {
          id: student.id,
          name: student.name,
          score: student.score,
          answeredCount,
          correctCount,
        };
      })
      .filter((student) => totalQuestionCount > 0 && student.answeredCount >= totalQuestionCount)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
        return a.name.localeCompare(b.name);
      });
  }, [students, players, studentAnswers, totalQuestionCount]);

  const totalPlayerCount = students.length > 0 ? students.length : players.length;

  const handleToggleMask = async (playerId: string) => {
    if (maskingId) return;
    setMaskError("");
    setMaskingId(playerId);
    const result = await togglePlayerNameMask(playerId);
    if (!result.success) {
      setMaskError(result.error || "Isim gizleme guncellenemedi.");
    }
    setMaskingId(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold tracking-widest uppercase text-muted-foreground">
          Live Leaderboard
        </h2>
        <span className="font-mono text-sm text-muted-foreground flex items-center gap-2">
          <Users size={14} />
          {totalPlayerCount} oyuncu
        </span>
      </div>

      {rankedCompleted.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground font-mono text-sm">
            Henuz tum sorulari bitiren oyuncu yok
          </p>
          <p className="text-muted-foreground/50 font-mono text-xs mt-2">
            Siralamaya sadece testi tamamlayanlar dahil edilir
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {maskError && (
            <p className="text-destructive text-xs font-mono">{maskError}</p>
          )}
          <AnimatePresence>
            {rankedCompleted.map((student, i) => {
              const isFirst = i === 0;
              const currentMask = nameMasks[student.id];
              const isMasked = Boolean(currentMask?.enabled);
              const displayName = isMasked && currentMask?.maskedName
                ? currentMask.maskedName
                : student.name;
              return (
                <motion.div
                  key={student.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.05 }}
                  className={`flex items-center gap-5 px-6 py-5 border rounded ${
                    isFirst
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <span
                    className={`font-mono text-2xl font-bold min-w-[2.5rem] ${
                      isFirst ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className={`text-lg font-semibold truncate ${isFirst ? "text-primary" : "text-foreground"}`}>
                      {displayName}
                    </p>
                    <p className="font-mono text-xs mt-1">
                      <span className="text-success font-bold">{student.correctCount}</span>
                      <span className="text-muted-foreground">/{totalQuestionCount}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleMask(student.id)}
                    disabled={maskingId === student.id}
                    title={isMasked ? "Ismi ac" : "Ismi gizle"}
                    className="w-9 h-9 rounded border border-border bg-background/80 text-muted-foreground hover:border-primary hover:text-primary flex items-center justify-center transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isMasked ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>

                  <span className={`font-mono text-xl font-bold ${isFirst ? "text-primary" : "text-primary/80"}`}>
                    {student.score.toLocaleString()}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
