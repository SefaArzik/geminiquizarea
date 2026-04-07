import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Radio,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(var(--primary)/0.18),transparent_55%)]"
        aria-hidden
      />
      <div className="relative flex-1 flex flex-col items-center px-4 sm:px-6 py-12 sm:py-16 md:py-20 max-w-3xl mx-auto w-full">
        <header className="text-center mb-10 sm:mb-12">
          <div
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 border border-primary/25 mb-6"
            aria-hidden
          >
            <Sparkles className="h-5 w-5 text-primary" strokeWidth={2} />
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-[3.25rem] font-extrabold text-foreground tracking-tight leading-[1.1] mb-4">
            Gemini Quiz Arena
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Yapay zeka ile üretilen soru setlerini, tek bir oda kodu üzerinden paylaşılan canlı bir
            oturuma bağlar. Öğretmen oturumu yönetir; katılımcılar tarayıcıdan katılır, cevaplar ve
            sıralama gerçek zamanlı güncellenir.
          </p>
        </header>

        <section
          className="w-full rounded-lg border border-border bg-card/80 backdrop-blur-sm p-5 sm:p-6 mb-8"
          aria-labelledby="landing-features"
        >
          <h2 id="landing-features" className="sr-only">
            Öne çıkan özellikler
          </h2>
          <ul className="space-y-3.5 text-sm sm:text-[0.9375rem] text-foreground/90 leading-relaxed">
            <li className="flex gap-3">
              <Radio className="h-5 w-5 shrink-0 text-primary mt-0.5" strokeWidth={2} />
              <span>
                <strong className="text-foreground font-semibold">Oda tabanlı erişim.</strong>{" "}
                Katılım için yalnızca oda kodu ve görünen ad yeterlidir; kurulum veya ek hesap
                zorunluluğu yoktur.
              </span>
            </li>
            <li className="flex gap-3">
              <Layers className="h-5 w-5 shrink-0 text-primary mt-0.5" strokeWidth={2} />
              <span>
                <strong className="text-foreground font-semibold">Öğretmen akışı.</strong> Soru
                setini yapılandırma, oturumu başlatma / bitirme ve sonuçları yönetme aynı arayüz
                üzerinden yapılır.
              </span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary mt-0.5" strokeWidth={2} />
              <span>
                <strong className="text-foreground font-semibold">Ücretsiz kullanım.</strong> Bu
                uygulama ticari bir abonelik katmanı içermez; kullanım, kendi Supabase projeniz ve
                barındırma tercihinizle sınırlıdır.
              </span>
            </li>
          </ul>
        </section>

        <section className="w-full mb-10" aria-labelledby="landing-steps">
          <h2
            id="landing-steps"
            className="text-center text-sm font-semibold text-foreground mb-5"
          >
            Akış
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center sm:text-left">
            <li className="rounded-md border border-border bg-card/50 px-4 py-4">
              <span className="text-primary font-mono text-xs font-bold block mb-2">01</span>
              <span className="text-sm text-muted-foreground leading-snug">
                Öğretmen oda oluşturur ve soru setini hazırlar veya yapıştırır.
              </span>
            </li>
            <li className="rounded-md border border-border bg-card/50 px-4 py-4">
              <span className="text-primary font-mono text-xs font-bold block mb-2">02</span>
              <span className="text-sm text-muted-foreground leading-snug">
                Oda kodu katılımcılarla paylaşılır; katılım tarayıcı üzerinden yapılır.
              </span>
            </li>
            <li className="rounded-md border border-border bg-card/50 px-4 py-4">
              <span className="text-primary font-mono text-xs font-bold block mb-2">03</span>
              <span className="text-sm text-muted-foreground leading-snug">
                Oturum sırasında cevaplar işlenir; sıralama ve sonuçlar güncellenir.
              </span>
            </li>
          </ol>
        </section>

        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <button
            type="button"
            onClick={() => navigate("/teacher/create")}
            className="group text-left rounded-lg border-2 border-border bg-card hover:border-primary hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors duration-150 p-6 sm:p-8"
          >
            <Zap className="h-8 w-8 text-primary mb-4" strokeWidth={2} aria-hidden />
            <h3 className="text-xl font-bold text-foreground mb-2">Öğretmen</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              Oda oluşturun, soru setini yükleyin veya düzenleyin, canlı oturumu ve sonuçları
              yönetin.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
              Oturuma başla
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/join")}
            className="group text-left rounded-lg border-2 border-border bg-card hover:border-primary hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors duration-150 p-6 sm:p-8"
          >
            <Users className="h-8 w-8 text-primary mb-4" strokeWidth={2} aria-hidden />
            <h3 className="text-xl font-bold text-foreground mb-2">Öğrenci / Katılımcı</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              Paylaşılan oda kodunu girin ve görünen adınızla oturuma katılın.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
              Katıl
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Landing;
