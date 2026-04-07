import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Leaderboard from "@/components/Leaderboard";
import QuestionOverview from "@/components/QuestionOverview";
import FullscreenRoomCode from "@/components/FullscreenRoomCode";
import { useQuizStore } from "@/lib/quiz-store";
import { ArrowLeft, Maximize, Play, RefreshCw, Pencil } from "lucide-react";

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const {
    quizStatus,
    roomCode,
    questions,
    startQuiz,
    fetchAnswers,
    reloadQuestions,
    realtimeHealth,
    roomSettings,
    setResultsPublishMode,
    publishResults,
  } = useQuizStore();
  const [showFullscreenCode, setShowFullscreenCode] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [publishModeSaving, setPublishModeSaving] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);
  const [publishError, setPublishError] = useState("");

  const confirmLeaveDashboard = useCallback(() => {
    return window.confirm("Ogretmen panelinden cikmak istediginize emin misiniz?");
  }, []);

  const healthUi = useMemo(() => {
    if (realtimeHealth.status === "subscribed" && realtimeHealth.connected) {
      return {
        label: "Realtime Bagli",
        dotClass: "bg-success",
        textClass: "text-success",
      };
    }
    if (realtimeHealth.status === "connecting") {
      return {
        label: "Baglaniliyor",
        dotClass: "bg-primary animate-pulse",
        textClass: "text-primary",
      };
    }
    if (realtimeHealth.status === "timed_out" || realtimeHealth.status === "error") {
      return {
        label: "Baglanti Sorunu",
        dotClass: "bg-destructive",
        textClass: "text-destructive",
      };
    }
    return {
      label: "Kapali",
      dotClass: "bg-muted-foreground/60",
      textClass: "text-muted-foreground",
    };
  }, [realtimeHealth.connected, realtimeHealth.status]);

  const avgLagLabel = realtimeHealth.avgAnswerLagMs === null
    ? "--"
    : `${Math.round(realtimeHealth.avgAnswerLagMs)}ms`;

  const handleManualResync = async () => {
    if (resyncing) return;
    setResyncing(true);
    await Promise.all([reloadQuestions(), fetchAnswers()]);
    setResyncing(false);
  };

  const handleChangePublishMode = async (mode: "auto" | "manual") => {
    if (publishModeSaving || roomSettings.resultsPublishMode === mode) return;
    setPublishError("");
    setPublishModeSaving(true);
    const result = await setResultsPublishMode(mode);
    if (!result.success) {
      setPublishError(result.error || "Yayin modu guncellenemedi.");
    }
    setPublishModeSaving(false);
  };

  const handlePublishResults = async () => {
    if (publishingResults || roomSettings.resultsPublished) return;
    setPublishError("");
    setPublishingResults(true);
    const result = await publishResults();
    if (!result.success) {
      setPublishError(result.error || "Sonuclar yayinlanamadi.");
    }
    setPublishingResults(false);
  };

  const handleBackNavigation = () => {
    if (!confirmLeaveDashboard()) return;
    navigate("/teacher/create");
  };

  useEffect(() => {
    const handlePopState = () => {
      if (!confirmLeaveDashboard()) {
        window.history.pushState({ teacherDashboardGuard: true }, "", window.location.href);
        return;
      }
      navigate("/teacher/create");
    };

    window.history.pushState({ teacherDashboardGuard: true }, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [navigate, confirmLeaveDashboard]);

  return (
    <div className="min-h-screen bg-background">
      {/* Fullscreen Room Code Overlay */}
      <FullscreenRoomCode
        roomCode={roomCode}
        isOpen={showFullscreenCode}
        onClose={() => setShowFullscreenCode(false)}
      />

      {/* Top bar */}
      <div className="border-b border-border px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={handleBackNavigation} className="text-muted-foreground hover:text-primary transition-colors duration-100">
            <ArrowLeft size={20} />
          </button>
          <div className="w-3 h-3 bg-primary rounded-sm" />
          <h1 className="text-base font-bold uppercase tracking-[0.2em] text-foreground">
            Öğretmen Paneli
          </h1>
          {roomCode && (
            <button
              onClick={() => setShowFullscreenCode(true)}
              className="ml-4 font-mono text-sm text-muted-foreground border border-border rounded px-3 py-1 hover:border-primary hover:text-primary transition-all duration-100 flex items-center gap-2"
            >
              Room: <span className="text-primary font-bold">{roomCode}</span>
              <Maximize size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {roomCode && questions.length > 0 && (quizStatus === "active" || quizStatus === "reviewing" || quizStatus === "finished") && (
            <button
              onClick={() => navigate("/teacher/solve")}
              className="flex items-center gap-2 px-4 py-2 text-sm font-mono font-bold uppercase tracking-wider border border-border rounded text-muted-foreground hover:border-primary hover:text-primary transition-all duration-100"
            >
              <Pencil size={14} />
              Testi Coz
            </button>
          )}
          {roomCode && (
            <div className="hidden xl:flex items-center gap-3 border border-border rounded px-3 py-2 bg-card">
              <span className={`w-2 h-2 rounded-full ${healthUi.dotClass}`} />
              <span className={`text-xs font-mono font-bold uppercase tracking-wider ${healthUi.textClass}`}>
                {healthUi.label}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                Event: {realtimeHealth.answerEventCount}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                Lag: {avgLagLabel}
              </span>
              <button
                onClick={handleManualResync}
                disabled={resyncing}
                className="flex items-center gap-1 px-2 py-1 rounded border border-border text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={resyncing ? "animate-spin" : ""} />
                Sync
              </button>
            </div>
          )}
          {quizStatus === "idle" && (
            <button
              onClick={startQuiz}
              className="flex items-center gap-2 px-4 py-2 text-sm font-mono font-bold uppercase tracking-wider text-primary-foreground bg-primary rounded hover:brightness-110 transition-all duration-100"
            >
              <Play size={14} />
              Testi Başlat
            </button>
          )}
          {quizStatus === "active" && (
            <span className="flex items-center gap-2 text-sm font-mono font-bold uppercase tracking-wider text-success">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Canlı
            </span>
          )}
          {quizStatus === "finished" && (
            <span className="text-sm font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Tamamlandı
            </span>
          )}
        </div>
      </div>

      {/* Content — always the same layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
        {/* Left: All Questions Overview with live stats */}
        <div className="border-r border-border min-h-[calc(100vh-4.5rem)] overflow-y-auto">
          <QuestionOverview />
        </div>

        {/* Right: Room Code + Leaderboard */}
        <div className="flex flex-col">
          {/* Room Code Display */}
          {roomCode && (
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold tracking-widest uppercase text-muted-foreground">
                  Oda Kodu
                </h2>
                <button
                  onClick={() => setShowFullscreenCode(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider border border-border rounded text-muted-foreground hover:border-primary hover:text-primary transition-all duration-100"
                >
                  <Maximize size={12} />
                  Tam Ekran
                </button>
              </div>
              <div className="flex gap-3 justify-center">
                {roomCode.split("").map((d, i) => (
                  <div
                    key={i}
                    className="w-14 h-18 border-2 border-primary rounded bg-card flex items-center justify-center"
                    style={{
                      boxShadow:
                        "0 0 15px hsl(var(--primary) / 0.18), 0 0 30px hsl(var(--primary) / 0.06)",
                    }}
                  >
                    <span className="text-3xl font-extrabold font-mono text-primary">
                      {d}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-sm font-mono text-muted-foreground text-center mt-4">
                Bu kodu öğrencilerinizle paylaşın
              </p>
            </div>
          )}

          {/* Leaderboard */}
          {roomCode && (
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold tracking-widest uppercase text-muted-foreground">
                  Sonuc Yayin Kontrolu
                </h2>
                <div className="text-right">
                  <span className="block text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    {roomSettings.resultsPublishMode === "manual" ? "Kapali" : "Acik"}
                  </span>
                  <span className="block text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wider mt-1">
                    Ogrenci ekrani: Sadece ilk 5
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => handleChangePublishMode("auto")}
                  disabled={publishModeSaving}
                  className={`px-3 py-2 rounded border text-xs font-mono font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed ${
                    roomSettings.resultsPublishMode === "auto"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  Acik
                </button>
                <button
                  onClick={() => handleChangePublishMode("manual")}
                  disabled={publishModeSaving}
                  className={`px-3 py-2 rounded border text-xs font-mono font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed ${
                    roomSettings.resultsPublishMode === "manual"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  Kapali
                </button>
              </div>

              <p className="text-xs font-mono text-muted-foreground mb-3">
                {roomSettings.resultsPublishMode === "auto"
                  ? "Acik: Test biter bitmez sonuclar ogrencilere gosterilir."
                  : "Kapali: Sonuclar gizli kalir, ogretmen isterse sonradan yayinlar."}
              </p>

              {roomSettings.resultsPublishMode === "manual" && quizStatus === "finished" && !roomSettings.resultsPublished && (
                <button
                  onClick={handlePublishResults}
                  disabled={publishingResults}
                  className="w-full px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-mono font-bold uppercase tracking-wider hover:brightness-110 transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {publishingResults ? "Yayinlaniyor..." : "Sonuclari Yayinla"}
                </button>
              )}

              {roomSettings.resultsPublished && (
                <p className="text-success text-xs font-mono font-bold uppercase tracking-wider">
                  Sonuclar yayinda
                </p>
              )}

              {publishError && (
                <p className="text-destructive text-xs font-mono mt-2">{publishError}</p>
              )}
            </div>
          )}

          <Leaderboard />
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
