import { Play, SkipForward, Square, RotateCcw } from "lucide-react";
import { useQuizStore } from "@/lib/quiz-store";

const QuizControls = () => {
  const { quizStatus, startQuiz, nextQuestion, endQuiz, currentQuestionIndex, questions } = useQuizStore();

  return (
    <div className="p-6 border-b border-border">
      <h2 className="text-lg font-bold tracking-widest uppercase text-muted-foreground mb-5">
        Controls
      </h2>
      <div className="flex flex-wrap gap-4">
        {quizStatus === "idle" && (
          <button
            onClick={startQuiz}
            className="flex items-center gap-3 bg-primary text-primary-foreground px-8 py-4 text-base font-bold uppercase tracking-wider rounded hover:brightness-110 transition-all duration-100"
          >
            <Play size={20} strokeWidth={2.5} />
            Start Quiz
          </button>
        )}

        {(quizStatus === "active" || quizStatus === "reviewing") && (
          <>
            <button
              onClick={nextQuestion}
              disabled={quizStatus === "active"}
              className="flex items-center gap-3 bg-foreground text-background px-8 py-4 text-base font-bold uppercase tracking-wider rounded hover:bg-primary hover:text-primary-foreground transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <SkipForward size={20} strokeWidth={2.5} />
              Next ({currentQuestionIndex + 1}/{questions.length})
            </button>
            <button
              onClick={endQuiz}
              className="flex items-center gap-3 bg-destructive text-destructive-foreground px-8 py-4 text-base font-bold uppercase tracking-wider rounded hover:opacity-80 transition-all duration-100"
            >
              <Square size={20} strokeWidth={2.5} />
              End
            </button>
          </>
        )}

        {quizStatus === "finished" && (
          <button
            onClick={startQuiz}
            className="flex items-center gap-3 bg-primary text-primary-foreground px-8 py-4 text-base font-bold uppercase tracking-wider rounded hover:brightness-110 transition-all duration-100"
          >
            <RotateCcw size={20} strokeWidth={2.5} />
            Restart
          </button>
        )}
      </div>
    </div>
  );
};

export default QuizControls;
