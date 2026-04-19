import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuizStore } from "@/lib/quiz-store";
import { normalizeQuestions } from "@/lib/normalize-questions";
import { ArrowLeft, Copy, Check, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const AI_PROMPT = `Yukarida olusturdugumuz tum sorulari sadece JSON olarak ver.
Ek aciklama yazma.

[
  {
    "text": "Soru metni",
    "options": ["A sikki", "B sikki", "C sikki", "D sikki"],
    "correctIndex": 0,
    "difficulty": "easy",
    "points": 100,
    "explanations": [
      "A secenegi aciklamasi",
      "B secenegi aciklamasi",
      "C secenegi aciklamasi",
      "D secenegi aciklamasi"
    ],
    "hint": "Kisa ipucu"
  }
]

Kurallar:
1. difficulty zorunlu: easy | medium | hard
2. Zorluga gore puan:
   easy=100, medium=200, hard=300
3. points alanini eklersen difficulty ile uyumlu olmasi gerekir.
4. Sadece JSON don.
5. CEVAPLARI KARISTIR: Dogru cevap her soruda farkli sikta olsun (0,1,2,3 yani A,B,C,D esit dagilmali). Hep ayni sikka koyma!`;

const PLACEHOLDER = "Yapay zekadan aldiginiz JSON ciktiyi buraya yapistirin...";

const TeacherCreate = () => {
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(true);
  const [hintModeEnabled, setHintModeEnabled] = useState(true);
  const navigate = useNavigate();
  const { setQuestions, generateRoom } = useQuizStore();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = AI_PROMPT;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerate = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("Gecersiz JSON formati. Lutfen JSON soz dizimini kontrol edin.");
      return;
    }

    const result = normalizeQuestions(parsed);
    if (result.success === false) {
      setError(result.error);
      return;
    }

    setError("");
    const roomResult = await generateRoom({
      hintModeEnabled,
      resultsPublishMode: "auto",
    });
    if (!roomResult.success) {
      setError(roomResult.error || "Oda olusturulamadi. Lutfen tekrar deneyin.");
      return;
    }
    const saveResult = await setQuestions(result.questions);
    if (!saveResult.success) {
      setError(saveResult.error || "Sorular kaydedilemedi. Lutfen tekrar deneyin.");
      return;
    }

    navigate("/teacher/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b border-border px-8 py-5 flex items-center gap-4">
        <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-primary transition-colors duration-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold uppercase tracking-[0.2em] text-foreground">
          Quiz Olustur
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center px-8 py-12">
        <div className="w-full max-w-2xl">
          <h2 className="text-3xl font-bold text-foreground mb-3">
            Quiz Olustur
          </h2>
          <p className="text-base text-muted-foreground mb-8">
            Promptu yapay zekaya yapistirin, JSON ciktiyi asagiya girin.
          </p>

          <div className="border-2 border-primary/30 rounded bg-card mb-8 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-primary/10 border-b border-primary/20">
              <button
                onClick={() => setPromptExpanded(!promptExpanded)}
                className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider"
              >
                <Sparkles size={16} />
                AI Prompt
                {promptExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-bold uppercase tracking-wider transition-all duration-200 ${
                  copied
                    ? "bg-success/20 text-success border border-success/30"
                    : "bg-primary text-primary-foreground hover:brightness-110"
                }`}
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    Kopyalandi
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Kopyala
                  </>
                )}
              </button>
            </div>

            {promptExpanded && (
              <div className="p-5">
                <pre className="text-sm font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed select-all">
                  {AI_PROMPT}
                </pre>
              </div>
            )}
          </div>

          <h3 className="text-lg font-bold text-foreground mb-3">
            JSON Ciktisini Yapistirin
          </h3>

          <div className="border-2 border-border rounded bg-card p-5 mb-5">
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Ipucu Modu
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setHintModeEnabled(true)}
                className={`px-4 py-3 rounded border text-sm font-bold uppercase tracking-wider transition-all duration-100 ${
                  hintModeEnabled
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                Acik
              </button>
              <button
                type="button"
                onClick={() => setHintModeEnabled(false)}
                className={`px-4 py-3 rounded border text-sm font-bold uppercase tracking-wider transition-all duration-100 ${
                  !hintModeEnabled
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                Kapali
              </button>
            </div>
            <p className="text-xs font-medium text-muted-foreground mt-3">
              Bu ayar quiz olusturulmadan once belirlenir ve tum ogrenciler icin gecerli olur.
            </p>
          </div>

          <textarea
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              setError("");
            }}
            placeholder={PLACEHOLDER}
            rows={14}
            className="w-full bg-card border-2 border-border rounded text-foreground font-mono text-sm p-6 resize-none focus:border-primary focus:outline-none transition-colors duration-100 placeholder:text-muted-foreground/40"
          />

          {error && (
            <p className="text-destructive text-sm font-medium mt-4">{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={!json.trim()}
            className="mt-6 w-full bg-primary text-primary-foreground px-8 py-5 text-lg font-bold uppercase tracking-wider rounded hover:brightness-110 transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Quiz Olustur
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeacherCreate;
