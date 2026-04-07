import { useNavigate } from "react-router-dom";
import { useQuizStore } from "@/lib/quiz-store";
import { ArrowLeft, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const Lobby = () => {
  const navigate = useNavigate();
  const { roomCode, players, startQuiz } = useQuizStore();

  const handleStart = async () => {
    await startQuiz();
    navigate("/teacher/dashboard");
  };

  const digits = roomCode.split("");
  const hasPlayers = players.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border px-8 py-5 flex items-center gap-4">
        <button onClick={() => navigate("/teacher/create")} className="text-muted-foreground hover:text-primary transition-colors duration-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold uppercase tracking-[0.2em] text-foreground">
          Game Lobby
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center px-8 py-16">
        {/* Room code label */}
        <p className="text-sm font-mono text-muted-foreground uppercase tracking-[0.3em] mb-8">
          Share this code with your students
        </p>

        {/* Glowing digit boxes */}
        <div className="flex gap-4 mb-20">
          {digits.map((d, i) => (
            <div
              key={i}
              className="w-20 h-24 md:w-24 md:h-28 border-2 border-primary rounded bg-card flex items-center justify-center"
              style={{
                boxShadow: "0 0 20px hsl(30 100% 63% / 0.25), 0 0 40px hsl(30 100% 63% / 0.1)",
              }}
            >
              <span className="text-5xl md:text-6xl font-extrabold font-mono text-primary">
                {d}
              </span>
            </div>
          ))}
        </div>

        {/* Players section */}
        <div className="w-full max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <Users size={20} className="text-muted-foreground" />
            <h2 className="text-lg font-bold text-muted-foreground uppercase tracking-wider">
              {hasPlayers ? `Players Joined (${players.length})` : "Waiting for Players..."}
            </h2>
          </div>

          {!hasPlayers ? (
            <div className="border border-border rounded p-12 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse [animation-delay:0.4s]" />
                </div>
                <p className="text-muted-foreground font-mono text-sm">
                  No players yet — share the room code above
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <AnimatePresence>
                {players.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.15 }}
                    className="border border-border rounded bg-card px-4 py-3 flex items-center gap-3"
                  >
                    <span className="w-2 h-2 bg-success rounded-full flex-shrink-0" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {p.name}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Footer with start button */}
      <div className="border-t border-border px-8 py-6 flex justify-center">
        <button
          onClick={handleStart}
          disabled={!hasPlayers}
          className="w-full max-w-lg bg-primary text-primary-foreground px-10 py-6 text-xl font-extrabold uppercase tracking-wider rounded hover:brightness-110 transition-all duration-100 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          Start Quiz
        </button>
      </div>
    </div>
  );
};

export default Lobby;
