import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuizStore } from "@/lib/quiz-store";
import { ArrowLeft } from "lucide-react";

const StudentJoin = () => {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { joinRoom } = useQuizStore();

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;

    const next = [...code];
    next[index] = value;
    setCode(next);
    setError("");

    if (value && index < 5) {
      const el = document.getElementById(`digit-${index + 1}`);
      el?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const el = document.getElementById(`digit-${index - 1}`);
      el?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      const el = document.getElementById("name-input");
      el?.focus();
    }
  };

  const handleEnter = async () => {
    const entered = code.join("");
    if (entered.length !== 6) {
      setError("6 haneli kodu eksiksiz girin.");
      return;
    }
    if (!name.trim()) {
      setError("İsminizi girin.");
      return;
    }
    setError("");
    const result = await joinRoom(entered, name.trim());
    if (!result.success) {
      setError(result.error || "Oda bulunamadı.");
      return;
    }
    navigate("/student");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border px-8 py-5 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-primary transition-colors duration-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold uppercase tracking-[0.2em] text-foreground">
          Join Game
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3">
          Enter Room Code
        </h2>
        <p className="text-lg text-muted-foreground mb-12">
          Get the 6-digit code from your teacher
        </p>

        {/* Digit inputs */}
        <div className="flex gap-3 mb-12">
          {code.map((d, i) => (
            <input
              key={i}
              id={`digit-${i}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              className="w-14 h-20 md:w-16 md:h-22 border-2 border-border rounded bg-card text-center text-3xl font-extrabold font-mono text-primary focus:border-primary focus:outline-none transition-colors duration-100"
            />
          ))}
        </div>

        {/* Name input */}
        <input
          id="name-input"
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          className="w-full max-w-md bg-card border-2 border-border rounded text-foreground text-lg font-semibold px-6 py-5 text-center focus:border-primary focus:outline-none transition-colors duration-100 placeholder:text-muted-foreground/40 mb-6"
        />

        {error && (
          <p className="text-destructive text-sm font-semibold mb-4">{error}</p>
        )}

        <button
          onClick={handleEnter}
          className="w-full max-w-md bg-primary text-primary-foreground px-8 py-5 text-lg font-extrabold uppercase tracking-wider rounded hover:brightness-110 transition-all duration-100"
        >
          Enter Arena
        </button>
      </div>
    </div>
  );
};

export default StudentJoin;
