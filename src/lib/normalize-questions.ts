import type { Question, QuestionDifficulty } from "./quiz-data";

const TEXT_KEYS = ["text", "q", "question", "soru", "question_text", "questionText", "soruMetni", "soru_metni"];
const OPTIONS_KEYS = ["options", "opt", "choices", "secenekler", "answers", "cevaplar", "siklar", "secenekler"];
const CORRECT_KEYS = [
  "correctIndex",
  "a",
  "answer",
  "correct",
  "correct_answer",
  "correctAnswer",
  "dogru",
  "dogruCevap",
  "dogru_cevap",
  "dogruIndex",
  "cevap",
];
const TIME_KEYS = ["timeLimit", "time", "sure", "time_limit", "duration", "zaman"];
const EXPLANATIONS_KEYS = ["explanations", "aciklamalar", "reasons", "nedenler", "explanation", "aciklama"];
const HINT_KEYS = ["hint", "ipucu", "clue", "yardim"];
const DIFFICULTY_KEYS = ["difficulty", "zorluk", "level", "seviye", "hardness"];
const POINTS_KEYS = ["points", "puan", "score", "point"];

const DIFFICULTY_POINTS: Record<QuestionDifficulty, number> = {
  easy: 100,
  medium: 200,
  hard: 300,
};

function findKey(obj: Record<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    if (key in obj) return key;
  }

  const objKeysLower = Object.keys(obj).map((k) => ({ original: k, lower: k.toLowerCase().replace(/[_\- ]/g, "") }));
  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase().replace(/[_\- ]/g, "");
    const match = objKeysLower.find((k) => k.lower === candidateLower);
    if (match) return match.original;
  }
  return null;
}

function resolveCorrectIndex(value: unknown, options: string[]): number {
  if (typeof value === "number") {
    if (value >= options.length) return value - 1;
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^[a-dA-D]$/.test(trimmed)) {
      return trimmed.toUpperCase().charCodeAt(0) - 65;
    }

    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (num >= options.length) return num - 1;
      return num;
    }

    const lowerValue = trimmed.toLowerCase();
    const exactMatch = options.findIndex((opt) => opt.toLowerCase() === lowerValue);
    if (exactMatch !== -1) return exactMatch;

    const partialMatch = options.findIndex(
      (opt) => opt.toLowerCase().includes(lowerValue) || lowerValue.includes(opt.toLowerCase()),
    );
    if (partialMatch !== -1) return partialMatch;
  }

  return 0;
}

function normalizeDifficulty(value: unknown): QuestionDifficulty {
  if (typeof value !== "string") return "medium";
  const v = value.trim().toLowerCase();

  if (["easy", "kolay", "basic", "beginner", "low"].includes(v)) return "easy";
  if (["hard", "zor", "advanced", "expert", "high"].includes(v)) return "hard";
  return "medium";
}

function resolvePoints(value: unknown, difficulty: QuestionDifficulty): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(50, Math.min(2000, Math.round(value)));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = parseInt(value.trim(), 10);
    return Math.max(50, Math.min(2000, parsed));
  }
  return DIFFICULTY_POINTS[difficulty];
}

export type NormalizeResult =
  | { success: true; questions: Question[] }
  | { success: false; error: string };

export function normalizeQuestions(input: unknown): NormalizeResult {
  let items: unknown[];
  if (Array.isArray(input)) {
    items = input;
  } else if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    const questionsKey = findKey(obj, ["questions", "sorular", "data", "quiz", "items"]);
    if (questionsKey && Array.isArray(obj[questionsKey])) {
      items = obj[questionsKey] as unknown[];
    } else {
      items = [input];
    }
  } else {
    return { success: false, error: "JSON bir dizi veya obje olmali." };
  }

  if (items.length === 0) {
    return { success: false, error: "En az 1 soru icermelidir." };
  }

  const questions: Question[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== "object" || item === null) {
      return { success: false, error: `Soru ${i + 1}: Gecerli bir obje degil.` };
    }

    const obj = item as Record<string, unknown>;

    const textKey = findKey(obj, TEXT_KEYS);
    if (!textKey || typeof obj[textKey] !== "string" || !(obj[textKey] as string).trim()) {
      return {
        success: false,
        error: `Soru ${i + 1}: Soru metni bulunamadi.`,
      };
    }

    const optionsKey = findKey(obj, OPTIONS_KEYS);
    if (!optionsKey || !Array.isArray(obj[optionsKey]) || (obj[optionsKey] as unknown[]).length < 2) {
      return {
        success: false,
        error: `Soru ${i + 1}: Secenekler bulunamadi veya en az 2 secenek olmali.`,
      };
    }

    const options = (obj[optionsKey] as unknown[]).map(String);
    const text = (obj[textKey] as string).trim();

    const correctKey = findKey(obj, CORRECT_KEYS);
    let correctIndex = 0;
    if (correctKey && obj[correctKey] !== undefined) {
      correctIndex = resolveCorrectIndex(obj[correctKey], options);
    }

    const timeKey = findKey(obj, TIME_KEYS);
    let timeLimit = 20;
    if (timeKey && typeof obj[timeKey] === "number") {
      timeLimit = obj[timeKey] as number;
    } else if (timeKey && typeof obj[timeKey] === "string") {
      const parsed = parseInt(obj[timeKey] as string, 10);
      if (!Number.isNaN(parsed)) timeLimit = parsed;
    }

    if (correctIndex < 0 || correctIndex >= options.length) {
      correctIndex = 0;
    }

    const explanationsKey = findKey(obj, EXPLANATIONS_KEYS);
    let explanations: string[] | undefined;
    if (explanationsKey && Array.isArray(obj[explanationsKey])) {
      explanations = (obj[explanationsKey] as unknown[]).map(String);
    }

    const hintKey = findKey(obj, HINT_KEYS);
    let hint: string | undefined;
    if (hintKey && typeof obj[hintKey] === "string" && (obj[hintKey] as string).trim()) {
      hint = obj[hintKey] as string;
    }

    const difficultyKey = findKey(obj, DIFFICULTY_KEYS);
    const difficulty = normalizeDifficulty(difficultyKey ? obj[difficultyKey] : undefined);

    const pointsKey = findKey(obj, POINTS_KEYS);
    const points = resolvePoints(pointsKey ? obj[pointsKey] : undefined, difficulty);

    questions.push({
      id: i + 1,
      text,
      options,
      correctIndex,
      timeLimit: Math.max(5, Math.min(120, timeLimit)),
      difficulty,
      points,
      ...(explanations && { explanations }),
      ...(hint && { hint }),
    });
  }

  return { success: true, questions };
}

