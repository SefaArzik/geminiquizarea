import { useQuizStore } from "@/lib/quiz-store";

const QuestionMonitor = () => {
  const { questions, currentQuestionIndex, quizStatus, timeRemaining } = useQuizStore();
  const question = questions[currentQuestionIndex];

  if (quizStatus === "idle") {
    return (
      <div className="p-8">
        <h2 className="text-lg font-bold tracking-widest uppercase text-muted-foreground mb-6">
          Question Monitor
        </h2>
        <div className="border border-border rounded p-10 flex items-center justify-center">
          <p className="text-muted-foreground text-lg font-mono">
            Waiting to start...
          </p>
        </div>
      </div>
    );
  }

  if (quizStatus === "finished") {
    return (
      <div className="p-8">
        <h2 className="text-lg font-bold tracking-widest uppercase text-muted-foreground mb-6">
          Question Monitor
        </h2>
        <div className="border border-border rounded p-10 flex items-center justify-center">
          <p className="text-primary text-2xl font-bold font-mono uppercase tracking-wider">
            Quiz Complete
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold tracking-widest uppercase text-muted-foreground">
          Question Monitor
        </h2>
        <div className="flex items-center gap-4">
          <span className="text-sm font-mono text-muted-foreground">
            Q{currentQuestionIndex + 1}/{questions.length}
          </span>
          <span className={`font-mono text-lg font-bold ${timeRemaining <= 5 ? "text-destructive" : "text-primary"}`}>
            {String(timeRemaining).padStart(2, "0")}s
          </span>
        </div>
      </div>

      <div className="border border-border rounded p-8">
        <p className="text-xl font-bold text-foreground mb-8">{question.text}</p>

        <div className="grid grid-cols-2 gap-4">
          {question.options.map((opt, i) => (
            <div
              key={i}
              className={`border rounded px-5 py-4 text-base font-medium ${
                i === question.correctIndex && quizStatus === "reviewing"
                  ? "border-success text-success"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span className="font-mono text-sm text-muted-foreground mr-3">
                {String.fromCharCode(65 + i)}.
              </span>
              {opt}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuestionMonitor;
