export type QuestionDifficulty = "easy" | "medium" | "hard";

export interface Question {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number; // seconds
  difficulty: QuestionDifficulty;
  points: number;
  explanations?: string[]; // Explanation per option
  hint?: string;
}

export interface Student {
  id: string;
  name: string;
  score: number;
  streak: number;
}

export const MOCK_QUESTIONS: Question[] = [
  {
    id: 1,
    text: "Gunes sistemindeki en buyuk gezegen hangisidir?",
    options: ["Dunya", "Jupiter", "Neptun", "Saturn"],
    correctIndex: 1,
    timeLimit: 20,
    difficulty: "easy",
    points: 100,
    explanations: [
      "Dunya en buyuk gezegen degildir.",
      "Jupiter, gunes sistemindeki en buyuk gezegendir.",
      "Neptun buyuk olsa da Jupiter'den kucuktur.",
      "Saturn ikinci buyuk gezegendir.",
    ],
    hint: "Gaz devlerinin en buyugu.",
  },
  {
    id: 2,
    text: "Bir ucgenin ic acilarinin toplami kac derecedir?",
    options: ["180", "270", "90", "360"],
    correctIndex: 0,
    timeLimit: 15,
    difficulty: "easy",
    points: 100,
    explanations: [
      "Euklidyende ucgen ic acilari toplami 180 derecedir.",
      "270 derece yanlistir.",
      "90 derece tek bir aciyi ifade eder.",
      "360 derece tam donustur.",
    ],
    hint: "Duz cizginin acisi ile iliskili.",
  },
  {
    id: 3,
    text: "Altinin kimyasal sembolu nedir?",
    options: ["Go", "Gd", "Au", "Ag"],
    correctIndex: 2,
    timeLimit: 10,
    difficulty: "medium",
    points: 200,
    explanations: [
      "Go gecerli bir sembol degildir.",
      "Gd gadolinyumdur.",
      "Au altinin semboludur.",
      "Ag gumusun semboludur.",
    ],
    hint: "Latince Aurum.",
  },
  {
    id: 4,
    text: "Berlin Duvari hangi yilda yikildi?",
    options: ["1987", "1989", "1991", "1990"],
    correctIndex: 1,
    timeLimit: 15,
    difficulty: "medium",
    points: 200,
    explanations: [
      "1987 erken.",
      "Dogru cevap 1989.",
      "1991 gec.",
      "1990 Almanya birlesmesi yili.",
    ],
    hint: "Soguk savasin bitisine yakin.",
  },
  {
    id: 5,
    text: "x^2 ifadesinin turevi nedir?",
    options: ["x", "2x", "x^2", "2x^2"],
    correctIndex: 1,
    timeLimit: 10,
    difficulty: "hard",
    points: 300,
    explanations: [
      "x yanlistir.",
      "Dogru cevap 2x.",
      "x^2 turev degildir.",
      "2x^2 da yanlistir.",
    ],
    hint: "Us kuralini kullan.",
  },
];

export const MOCK_STUDENTS: Student[] = [
  { id: "s1", name: "Alex Chen", score: 2400, streak: 3 },
  { id: "s2", name: "Maria Lopez", score: 2250, streak: 2 },
  { id: "s3", name: "James Wright", score: 2100, streak: 4 },
  { id: "s4", name: "Yuki Tanaka", score: 1950, streak: 1 },
  { id: "s5", name: "Sarah Miller", score: 1800, streak: 0 },
  { id: "s6", name: "David Kim", score: 1650, streak: 2 },
  { id: "s7", name: "Emma Davis", score: 1500, streak: 1 },
  { id: "s8", name: "Omar Hassan", score: 1350, streak: 0 },
];

