import type { RealtimeChannel } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "./supabase";
import type { Question, QuestionDifficulty, Student } from "./quiz-data";

interface StudentAnswer {
  studentId: string;
  studentName: string;
  selectedIndex: number;
  isCorrect: boolean;
}

type RealtimeConnectionStatus = "idle" | "connecting" | "subscribed" | "error" | "timed_out" | "closed";

interface RealtimeHealth {
  status: RealtimeConnectionStatus;
  connected: boolean;
  lastStatusAt: number | null;
  lastAnswerEventAt: number | null;
  lastSnapshotSyncAt: number | null;
  answerEventCount: number;
  snapshotSyncCount: number;
  reconnectCount: number;
  avgAnswerLagMs: number | null;
  answerLagSampleCount: number;
  lastError: string | null;
}

type ResultsPublishMode = "auto" | "manual";

interface RoomSettings {
  hintModeEnabled: boolean;
  resultsPublishMode: ResultsPublishMode;
  resultsPublished: boolean;
}

interface PlayerNameMask {
  enabled: boolean;
  maskedName: string | null;
}

interface QuizState {
  // Room
  roomId: string | null;
  roomCode: string;
  players: { id: string; name: string }[];
  roomSettings: RoomSettings;
  nameMasks: Record<string, PlayerNameMask>;

  // Quiz state
  questions: Question[];
  currentQuestionIndex: number;
  quizStatus: "idle" | "active" | "reviewing" | "finished";

  // Students
  students: Student[];

  // Student answer tracking (per question id)
  studentAnswers: Record<number, StudentAnswer[]>;

  // Timer (kept for backward compat but not used in student arena)
  timeRemaining: number;
  timerActive: boolean;

  // Student answer state (local)
  selectedAnswer: number | null;
  answerSubmitted: boolean;
  showFeedback: boolean;

  // Current player (student mode)
  playerId: string | null;
  playerName: string;
  hostToken: string | null;
  playerToken: string | null;

  // Loading
  loading: boolean;
  realtimeHealth: RealtimeHealth;

  // Actions
  generateRoom: (settings?: {
    hintModeEnabled?: boolean;
    resultsPublishMode?: ResultsPublishMode;
  }) => Promise<{ success: boolean; error?: string }>;
  addPlayer: (name: string) => Promise<boolean>;
  setQuestions: (questions: Question[]) => Promise<{ success: boolean; error?: string }>;
  startQuiz: () => Promise<void>;
  nextQuestion: () => void;
  endQuiz: () => Promise<void>;
  tickTimer: () => void;
  selectAnswer: (index: number) => void;
  submitAnswer: () => Promise<void>;
  submitAnswerForQuestion: (
    questionId: number,
    selectedIndex: number,
    correctIndex: number,
    questionPoints: number,
  ) => Promise<{ success: boolean; error?: string }>;
  resetStudentAnswer: () => void;
  shuffleLeaderboard: () => void;
  simulateStudentAnswers: () => void;
  joinRoom: (code: string, name: string) => Promise<{ success: boolean; error?: string }>;
  loadRoom: (code: string) => Promise<boolean>;
  reloadQuestions: () => Promise<boolean>;
  subscribeToRoom: () => void;
  unsubscribeFromRoom: () => void;
  setResultsPublishMode: (mode: ResultsPublishMode) => Promise<{ success: boolean; error?: string }>;
  publishResults: () => Promise<{ success: boolean; error?: string }>;
  togglePlayerNameMask: (playerId: string) => Promise<{ success: boolean; error?: string }>;
  fetchPlayers: () => Promise<void>;
  fetchAnswers: () => Promise<void>;
}

type DbQuestionRow = {
  id?: number;
  text?: string;
  options?: unknown;
  correct_index?: number;
  difficulty?: string;
  points?: number;
  explanations?: unknown;
  hint?: string | null;
};

type DbPlayerRow = {
  id: string;
  name: string;
  score?: number | null;
  mask_enabled?: boolean | null;
  masked_name?: string | null;
};

type DbAnswerRow = {
  player_id?: string;
  question_id?: number;
  selected_index?: number;
  is_correct?: boolean;
  answered_at?: string;
};

type DbRoomRow = {
  id: string;
  code?: string;
  status?: string;
  hint_mode_enabled?: boolean | null;
  results_publish_mode?: string | null;
  results_published?: boolean | null;
};

type SecureCreateRoomResponse = {
  room_id: string;
  room_code: string;
  status: string;
  hint_mode_enabled: boolean;
  results_publish_mode: string;
  results_published: boolean;
  host_token: string;
};

type SecureJoinRoomResponse = {
  room_id: string;
  room_code: string;
  room_status: string;
  hint_mode_enabled: boolean;
  results_publish_mode: string;
  results_published: boolean;
  player_id: string;
  player_name: string;
  player_token: string;
};

type SecureSubmitAnswerResponse = {
  success: boolean;
  is_correct: boolean;
  score: number;
};

const generateCode = () => String(Math.floor(100000 + Math.random() * 900000));
let activeRoomChannel: RealtimeChannel | null = null;
let activeRoomId: string | null = null;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;
const SNAPSHOT_SYNC_INTERVAL_MS = 15000;

const hostTokenStorageKey = (roomCode: string) => `quiz_host_token:${roomCode}`;

const readHostTokenFromStorage = (roomCode: string) => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(hostTokenStorageKey(roomCode));
  } catch {
    return null;
  }
};

const saveHostTokenToStorage = (roomCode: string, token: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(hostTokenStorageKey(roomCode), token);
  } catch {
    // noop
  }
};

const initialRealtimeHealth: RealtimeHealth = {
  status: "idle",
  connected: false,
  lastStatusAt: null,
  lastAnswerEventAt: null,
  lastSnapshotSyncAt: null,
  answerEventCount: 0,
  snapshotSyncCount: 0,
  reconnectCount: 0,
  avgAnswerLagMs: null,
  answerLagSampleCount: 0,
  lastError: null,
};

const defaultRoomSettings: RoomSettings = {
  hintModeEnabled: true,
  resultsPublishMode: "auto",
  resultsPublished: false,
};

const formatSupabaseError = (error: unknown): string => {
  if (!error || typeof error !== "object") return "Unknown error";
  const e = error as {
    message?: string;
    details?: string | null;
    hint?: string | null;
    code?: string;
  };
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(" | ") || "Unknown error";
};

const isRpcNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: string;
    message?: string | null;
    details?: string | null;
  };
  const text = `${e.message || ""} ${e.details || ""}`.toLowerCase();
  return (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    text.includes("schema cache") ||
    text.includes("could not find the function") ||
    text.includes("function") && text.includes("not found")
  );
};

const isDuplicateAnswerError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string | null };
  const message = (e.message || "").toLowerCase();
  return e.code === "23505" || message.includes("duplicate key");
};

const isUnauthorizedOrRlsError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: string;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  };
  const text = `${e.message || ""} ${e.details || ""} ${e.hint || ""}`.toLowerCase();
  return (
    e.code === "42501" ||
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("unauthorized") ||
    text.includes("jwt")
  );
};

const migrationRequiredMessage =
  "Supabase guvenlik migration'i eksik. SQL Editor'da guncel supabase-schema.sql dosyasini tamamen calistirin ve tekrar deneyin.";

const toQuizStatus = (status: unknown): QuizState["quizStatus"] => {
  if (status === "idle" || status === "active" || status === "reviewing" || status === "finished") {
    return status;
  }
  return "idle";
};

const toResultsPublishMode = (mode: unknown): ResultsPublishMode => {
  return mode === "manual" ? "manual" : "auto";
};

const mapRoomSettingsFromRow = (row?: Partial<DbRoomRow> | null): RoomSettings => ({
  hintModeEnabled:
    typeof row?.hint_mode_enabled === "boolean"
      ? row.hint_mode_enabled
      : defaultRoomSettings.hintModeEnabled,
  resultsPublishMode:
    typeof row?.results_publish_mode === "string"
      ? toResultsPublishMode(row.results_publish_mode)
      : defaultRoomSettings.resultsPublishMode,
  resultsPublished:
    typeof row?.results_published === "boolean"
      ? row.results_published
      : defaultRoomSettings.resultsPublished,
});

const mergeRoomSettingsFromRow = (
  current: RoomSettings,
  row?: Partial<DbRoomRow> | null,
): RoomSettings => ({
  hintModeEnabled:
    typeof row?.hint_mode_enabled === "boolean"
      ? row.hint_mode_enabled
      : current.hintModeEnabled,
  resultsPublishMode:
    typeof row?.results_publish_mode === "string"
      ? toResultsPublishMode(row.results_publish_mode)
      : current.resultsPublishMode,
  resultsPublished:
    typeof row?.results_published === "boolean"
      ? row.results_published
      : current.resultsPublished,
});

const toPlayerNameMask = (row: Partial<DbPlayerRow>): PlayerNameMask => {
  const enabled = Boolean(row.mask_enabled);
  const maskedName = typeof row.masked_name === "string" && row.masked_name.trim().length > 0
    ? row.masked_name
    : null;

  return {
    enabled,
    maskedName: enabled ? maskedName : null,
  };
};

const toDifficulty = (difficulty: unknown): QuestionDifficulty => {
  if (typeof difficulty !== "string") return "medium";
  const value = difficulty.toLowerCase().trim();
  if (value === "easy") return "easy";
  if (value === "hard") return "hard";
  return "medium";
};

const defaultPointsByDifficulty = (difficulty: QuestionDifficulty) => {
  if (difficulty === "easy") return 100;
  if (difficulty === "hard") return 300;
  return 200;
};

const mapDbQuestion = (row: DbQuestionRow, fallbackIndex: number): Question => {
  const options = Array.isArray(row.options) ? row.options.map((opt) => String(opt)) : [];
  const correctIndexRaw = typeof row.correct_index === "number" ? row.correct_index : 0;
  const clampedCorrectIndex =
    options.length > 0 ? Math.max(0, Math.min(options.length - 1, correctIndexRaw)) : 0;
  const explanations = Array.isArray(row.explanations)
    ? row.explanations.map((item) => String(item))
    : undefined;
  const difficulty = toDifficulty(row.difficulty);
  const points = typeof row.points === "number" && Number.isFinite(row.points)
    ? row.points
    : defaultPointsByDifficulty(difficulty);

  return {
    id: typeof row.id === "number" ? row.id : fallbackIndex + 1,
    text: typeof row.text === "string" ? row.text : "",
    options,
    correctIndex: clampedCorrectIndex,
    timeLimit: 20,
    difficulty,
    points,
    explanations,
    hint: row.hint || undefined,
  };
};

const upsertPlayerList = (players: { id: string; name: string }[], next: { id: string; name: string }) => {
  const index = players.findIndex((p) => p.id === next.id);
  if (index === -1) return [...players, next];

  const current = players[index];
  if (current.name === next.name) return players;

  const copy = [...players];
  copy[index] = next;
  return copy;
};

const removePlayerFromList = (players: { id: string; name: string }[], id: string) =>
  players.filter((p) => p.id !== id);

const upsertStudentList = (students: Student[], next: { id: string; name: string; score?: number | null }) => {
  const index = students.findIndex((s) => s.id === next.id);
  if (index === -1) {
    const appended: Student[] = [
      ...students,
      { id: next.id, name: next.name, score: next.score || 0, streak: 0 },
    ];
    return appended.sort((a, b) => b.score - a.score);
  }

  const current = students[index];
  const updated: Student = {
    ...current,
    name: next.name,
    score: typeof next.score === "number" ? next.score : current.score,
  };
  const copy = [...students];
  copy[index] = updated;
  return copy.sort((a, b) => b.score - a.score);
};

const removeStudentFromList = (students: Student[], id: string) => students.filter((s) => s.id !== id);

const upsertNameMaskMap = (
  nameMasks: Record<string, PlayerNameMask>,
  row: Partial<DbPlayerRow> & { id: string },
) => ({
  ...nameMasks,
  [row.id]: toPlayerNameMask(row),
});

const removeNameMaskMap = (
  nameMasks: Record<string, PlayerNameMask>,
  id: string,
) => {
  if (!nameMasks[id]) return nameMasks;
  const next = { ...nameMasks };
  delete next[id];
  return next;
};

const upsertStudentAnswerMap = (
  answers: Record<number, StudentAnswer[]>,
  questionId: number,
  next: StudentAnswer,
) => {
  const current = answers[questionId] || [];
  const index = current.findIndex((a) => a.studentId === next.studentId);
  const updated = index === -1
    ? [...current, next]
    : current.map((a, i) => (i === index ? next : a));

  return {
    ...answers,
    [questionId]: updated,
  };
};

const removeStudentAnswerMap = (
  answers: Record<number, StudentAnswer[]>,
  questionId: number,
  studentId: string,
) => {
  const current = answers[questionId] || [];
  const filtered = current.filter((a) => a.studentId !== studentId);

  if (filtered.length === current.length) return answers;
  if (filtered.length === 0) {
    const next = { ...answers };
    delete next[questionId];
    return next;
  }

  return {
    ...answers,
    [questionId]: filtered,
  };
};

const buildAnswerMap = (rows: Array<Record<string, unknown>>) => {
  const questionMap = new Map<number, Map<string, StudentAnswer>>();

  rows.forEach((row) => {
    const questionId = Number(row.question_id);
    const studentId = String(row.player_id || "");
    if (!questionId || !studentId) return;

    const playerObj = (row.players || {}) as { name?: string };
    const answer: StudentAnswer = {
      studentId,
      studentName: playerObj.name || "Unknown",
      selectedIndex: Number(row.selected_index || 0),
      isCorrect: Boolean(row.is_correct),
    };

    if (!questionMap.has(questionId)) {
      questionMap.set(questionId, new Map<string, StudentAnswer>());
    }
    questionMap.get(questionId)?.set(studentId, answer);
  });

  const result: Record<number, StudentAnswer[]> = {};
  questionMap.forEach((byStudent, questionId) => {
    result[questionId] = Array.from(byStudent.values());
  });
  return result;
};

const loadQuestionsForRoom = async (roomId: string) => {
  const primary = await supabase
    .from("questions")
    .select("*")
    .eq("room_id", roomId)
    .order("index");

  let rows = primary.data as DbQuestionRow[] | null;
  let error = primary.error;

  if (error) {
    // Backward compatibility: some DBs may not have an "index" column yet.
    const fallback = await supabase
      .from("questions")
      .select("*")
      .eq("room_id", roomId)
      .order("id");
    rows = fallback.data as DbQuestionRow[] | null;
    error = fallback.error;
  }

  if (error) {
    return {
      success: false as const,
      error: formatSupabaseError(error),
      questions: [] as Question[],
    };
  }

  const questions = (rows || [])
    .map((row, i) => mapDbQuestion(row, i))
    .filter((q) => q.text.trim().length > 0 && q.options.length > 0);

  return { success: true as const, questions };
};

const loadRoomByCode = async (code: string) => {
  const extendedSelect = "id, code, status, hint_mode_enabled, results_publish_mode, results_published";
  const minimalSelect = "id, code, status";

  const primary = await supabase
    .from("rooms")
    .select(extendedSelect)
    .eq("code", code)
    .single();

  if (!primary.error && primary.data) {
    return {
      success: true as const,
      room: primary.data as DbRoomRow,
    };
  }

  const fallback = await supabase
    .from("rooms")
    .select(minimalSelect)
    .eq("code", code)
    .single();

  if (fallback.error || !fallback.data) {
    return {
      success: false as const,
      error: formatSupabaseError(primary.error || fallback.error),
      room: null,
    };
  }

  return {
    success: true as const,
    room: fallback.data as DbRoomRow,
  };
};

const mapPlayersForState = (rows: DbPlayerRow[]) => ({
  players: rows.map((p) => ({ id: p.id, name: p.name })),
  students: rows.map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score || 0,
    streak: 0,
  })),
  nameMasks: rows.reduce<Record<string, PlayerNameMask>>((acc, row) => {
    acc[row.id] = toPlayerNameMask(row);
    return acc;
  }, {}),
});

const loadPlayersForRoom = async (roomId: string) => {
  const { data, error } = await supabase
    .from("players")
    .select("id, name, score, mask_enabled, masked_name")
    .eq("room_id", roomId)
    .order("score", { ascending: false });

  if (error) {
    return {
      success: false as const,
      error: formatSupabaseError(error),
      players: [] as { id: string; name: string }[],
      students: [] as Student[],
      nameMasks: {} as Record<string, PlayerNameMask>,
    };
  }

  const rows = (data || []) as DbPlayerRow[];
  const mapped = mapPlayersForState(rows);
  return {
    success: true as const,
    ...mapped,
  };
};

export const useQuizStore = create<QuizState>((set, get) => ({
  roomId: null,
  roomCode: "",
  players: [],
  roomSettings: { ...defaultRoomSettings },
  nameMasks: {},

  questions: [],
  currentQuestionIndex: 0,
  quizStatus: "idle",
  students: [],
  studentAnswers: {},
  timeRemaining: 20,
  timerActive: false,
  selectedAnswer: null,
  answerSubmitted: false,
  showFeedback: false,
  playerId: null,
  playerName: "",
  hostToken: null,
  playerToken: null,
  loading: false,
  realtimeHealth: { ...initialRealtimeHealth },

  // ===== TEACHER: Create Room =====
  generateRoom: async (settings) => {
    const code = generateCode();
    set({ loading: true });
    const nextSettings: RoomSettings = {
      hintModeEnabled: settings?.hintModeEnabled ?? defaultRoomSettings.hintModeEnabled,
      resultsPublishMode: settings?.resultsPublishMode ?? defaultRoomSettings.resultsPublishMode,
      resultsPublished: false,
    };

    const { data, error } = await supabase.rpc("create_room_secure", {
      p_code: code,
      p_hint_mode_enabled: nextSettings.hintModeEnabled,
      p_results_publish_mode: nextSettings.resultsPublishMode,
    });

    const payload = data as SecureCreateRoomResponse | null;
    let resolvedRoomId: string | null = null;
    let resolvedRoomCode = code;
    let resolvedSettings = nextSettings;
    let resolvedHostToken: string | null = null;

    if (!error && payload?.room_id && payload?.host_token) {
      resolvedRoomId = payload.room_id;
      resolvedRoomCode = payload.room_code || code;
      resolvedSettings = {
        hintModeEnabled: payload.hint_mode_enabled,
        resultsPublishMode: toResultsPublishMode(payload.results_publish_mode),
        resultsPublished: Boolean(payload.results_published),
      };
      resolvedHostToken = payload.host_token;
      saveHostTokenToStorage(resolvedRoomCode, resolvedHostToken);
    } else {
      if (!isRpcNotFoundError(error)) {
        console.error("Room create secure RPC error:", error);
        set({ loading: false });
        return {
          success: false,
          error: isUnauthorizedOrRlsError(error)
            ? migrationRequiredMessage
            : `Oda olusturulamadi: ${formatSupabaseError(error)}`,
        };
      }

      console.warn("create_room_secure RPC not found. Falling back to legacy room creation flow.");

      const legacyInsert = await supabase
        .from("rooms")
        .insert({
          code,
          status: "idle",
          hint_mode_enabled: nextSettings.hintModeEnabled,
          results_publish_mode: nextSettings.resultsPublishMode,
          results_published: false,
        })
        .select("id, code, status, hint_mode_enabled, results_publish_mode, results_published")
        .single();

      let legacyRoom = legacyInsert.data as DbRoomRow | null;
      let legacyError = legacyInsert.error;

      if (legacyError || !legacyRoom?.id) {
        const minimalInsert = await supabase
          .from("rooms")
          .insert({
            code,
            status: "idle",
          })
          .select("id, code, status")
          .single();
        legacyRoom = minimalInsert.data as DbRoomRow | null;
        legacyError = minimalInsert.error;
      }

      if (legacyError || !legacyRoom?.id) {
        console.error("Legacy room create error:", legacyError);
        set({ loading: false });
        return {
          success: false,
          error: isUnauthorizedOrRlsError(legacyError)
            ? "create_room_secure RPC bulunamadi ve legacy yazma RLS tarafindan engellendi. SQL Editor'da guncel supabase-schema.sql dosyasini calistirin."
            : `Oda olusturulamadi: ${formatSupabaseError(legacyError)}`,
        };
      }

      resolvedRoomId = legacyRoom.id;
      resolvedRoomCode = legacyRoom.code || code;
      resolvedSettings = mapRoomSettingsFromRow(legacyRoom);
    }

    if (!resolvedRoomId) {
      set({ loading: false });
      return { success: false, error: "Oda olusturulamadi." };
    }

    get().unsubscribeFromRoom();
    set({
      roomId: resolvedRoomId,
      roomCode: resolvedRoomCode,
      players: [],
      students: [],
      studentAnswers: {},
      nameMasks: {},
      quizStatus: "idle",
      roomSettings: resolvedSettings,
      hostToken: resolvedHostToken,
      playerId: null,
      playerName: "",
      playerToken: null,
      loading: false,
      realtimeHealth: { ...initialRealtimeHealth },
    });

    get().subscribeToRoom();
    return { success: true };
  },

  // ===== TEACHER: Save Questions =====
  setQuestions: async (questions) => {
    const { roomId, hostToken } = get();
    if (!roomId) {
      return { success: false, error: "Oda bulunamadi. Once oda olusturun." };
    }

    const payload = questions.map((q, i) => ({
      index: i,
      text: q.text,
      options: q.options,
      correct_index: q.correctIndex,
      difficulty: q.difficulty,
      points: q.points,
      explanations: q.explanations || null,
      hint: q.hint || null,
    }));

    if (hostToken) {
      const { error } = await supabase.rpc("upsert_questions_secure", {
        p_room_id: roomId,
        p_host_token: hostToken,
        p_questions: payload,
      });

      if (!error) {
        set({ questions });
        return { success: true };
      }

      if (!isRpcNotFoundError(error)) {
        console.error("Questions upsert secure RPC error:", error);
        return {
          success: false,
          error: `Sorular kaydedilemedi: ${formatSupabaseError(error)}`,
        };
      }

      console.warn("upsert_questions_secure RPC not found. Falling back to legacy questions flow.");
    }

    const { error: deleteError } = await supabase.from("questions").delete().eq("room_id", roomId);
    if (deleteError) {
      return { success: false, error: `Eski sorular silinemedi: ${formatSupabaseError(deleteError)}` };
    }

    if (payload.length === 0) {
      set({ questions });
      return { success: true };
    }

    const richInsert = await supabase.from("questions").insert(
      payload.map((item) => ({
        room_id: roomId,
        index: item.index,
        text: item.text,
        options: item.options,
        correct_index: item.correct_index,
        difficulty: item.difficulty,
        points: item.points,
        explanations: item.explanations,
        hint: item.hint,
      })),
    );

    if (!richInsert.error) {
      set({ questions });
      return { success: true };
    }

    const minimalInsert = await supabase.from("questions").insert(
      payload.map((item) => ({
        room_id: roomId,
        text: item.text,
        options: item.options,
        correct_index: item.correct_index,
      })),
    );

    if (minimalInsert.error) {
      return {
        success: false,
        error: `Sorular kaydedilemedi: ${formatSupabaseError(minimalInsert.error)}`,
      };
    }

    set({ questions });
    return { success: true };
  },

  // ===== TEACHER: Start Quiz =====
  startQuiz: async () => {
    const { roomId, hostToken } = get();

    if (roomId) {
      const hasQuestions = await get().reloadQuestions();
      if (!hasQuestions) {
        console.warn("Quiz start blocked: no questions found in database.");
        return;
      }
    } else if (get().questions.length === 0) {
      console.warn("Quiz start blocked: no questions found in store.");
      return;
    }

    if (roomId) {
      if (hostToken) {
        const { error } = await supabase.rpc("set_room_state_secure", {
          p_room_id: roomId,
          p_host_token: hostToken,
          p_status: "active",
          p_results_published: false,
        });
        if (!error) {
          // handled by secure RPC
        } else if (!isRpcNotFoundError(error)) {
          console.error("set_room_state_secure(active) error:", error);
          return;
        } else {
          const legacyUpdate = await supabase
            .from("rooms")
            .update({ status: "active", results_published: false })
            .eq("id", roomId);
          if (legacyUpdate.error) {
            const minimalUpdate = await supabase
              .from("rooms")
              .update({ status: "active" })
              .eq("id", roomId);
            if (minimalUpdate.error) {
              console.error("Legacy room update(active) error:", minimalUpdate.error);
              return;
            }
          }
        }
      } else {
        const legacyUpdate = await supabase
          .from("rooms")
          .update({ status: "active", results_published: false })
          .eq("id", roomId);
        if (legacyUpdate.error) {
          const minimalUpdate = await supabase
            .from("rooms")
            .update({ status: "active" })
            .eq("id", roomId);
          if (minimalUpdate.error) {
            console.error("Legacy room update(active) error:", minimalUpdate.error);
            return;
          }
        }
      }
    }

    set({
      quizStatus: "active",
      currentQuestionIndex: 0,
      timeRemaining: 20,
      timerActive: false,
      selectedAnswer: null,
      answerSubmitted: false,
      showFeedback: false,
      roomSettings: {
        ...get().roomSettings,
        resultsPublished: false,
      },
    });
  },

  // ===== TEACHER: End Quiz =====
  endQuiz: async () => {
    const { roomId, roomSettings, hostToken } = get();
    const shouldPublishImmediately = roomSettings.resultsPublishMode === "auto";

    if (roomId) {
      if (hostToken) {
        const { error } = await supabase.rpc("set_room_state_secure", {
          p_room_id: roomId,
          p_host_token: hostToken,
          p_status: "finished",
          p_results_published: shouldPublishImmediately,
        });
        if (!error) {
          // handled by secure RPC
        } else if (!isRpcNotFoundError(error)) {
          console.error("set_room_state_secure(finished) error:", error);
          return;
        } else {
          const legacyUpdate = await supabase
            .from("rooms")
            .update({ status: "finished", results_published: shouldPublishImmediately })
            .eq("id", roomId);
          if (legacyUpdate.error) {
            const minimalUpdate = await supabase
              .from("rooms")
              .update({ status: "finished" })
              .eq("id", roomId);
            if (minimalUpdate.error) {
              console.error("Legacy room update(finished) error:", minimalUpdate.error);
              return;
            }
          }
        }
      } else {
        const legacyUpdate = await supabase
          .from("rooms")
          .update({ status: "finished", results_published: shouldPublishImmediately })
          .eq("id", roomId);
        if (legacyUpdate.error) {
          const minimalUpdate = await supabase
            .from("rooms")
            .update({ status: "finished" })
            .eq("id", roomId);
          if (minimalUpdate.error) {
            console.error("Legacy room update(finished) error:", minimalUpdate.error);
            return;
          }
        }
      }
    }

    set({
      quizStatus: "finished",
      timerActive: false,
      roomSettings: {
        ...roomSettings,
        resultsPublished: shouldPublishImmediately,
      },
    });
  },

  // ===== STUDENT: Join Room =====
  joinRoom: async (code, name) => {
    const joinRes = await supabase.rpc("join_room_secure", {
      p_code: code,
      p_name: name,
    });
    const payload = joinRes.data as SecureJoinRoomResponse | null;
    if (!joinRes.error && payload?.room_id && payload?.player_id && payload?.player_token) {
      const questionLoad = await loadQuestionsForRoom(payload.room_id);
      if (!questionLoad.success) {
        console.error("Questions load error (joinRoom):", questionLoad.error);
      }
      const playerLoad = await loadPlayersForRoom(payload.room_id);
      if (!playerLoad.success) {
        console.error("Players load error (joinRoom):", playerLoad.error);
      }

      get().unsubscribeFromRoom();
      set({
        roomId: payload.room_id,
        roomCode: payload.room_code || code,
        playerId: payload.player_id,
        playerName: payload.player_name || name,
        playerToken: payload.player_token,
        hostToken: null,
        questions: questionLoad.questions,
        quizStatus: toQuizStatus(payload.room_status),
        players: playerLoad.players,
        students: playerLoad.students,
        nameMasks: playerLoad.nameMasks,
        roomSettings: {
          hintModeEnabled: payload.hint_mode_enabled,
          resultsPublishMode: toResultsPublishMode(payload.results_publish_mode),
          resultsPublished: Boolean(payload.results_published),
        },
        realtimeHealth: { ...initialRealtimeHealth },
      });

      get().subscribeToRoom();
      return { success: true };
    }

    if (!isRpcNotFoundError(joinRes.error)) {
      return { success: false, error: "Katilim hatasi: " + formatSupabaseError(joinRes.error) };
    }

    console.warn("join_room_secure RPC not found. Falling back to legacy join flow.");

    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 40) {
      return { success: false, error: "Isim 1-40 karakter olmali." };
    }

    const roomLoad = await loadRoomByCode(code);
    if (!roomLoad.success || !roomLoad.room) {
      return { success: false, error: "Oda bulunamadi." };
    }

    const room = roomLoad.room;
    const insertPlayer = await supabase
      .from("players")
      .insert({
        room_id: room.id,
        name: trimmedName,
        score: 0,
        mask_enabled: false,
        masked_name: null,
      })
      .select("id, name")
      .single();

    let playerRow = insertPlayer.data as { id?: string; name?: string } | null;
    let playerError = insertPlayer.error;

    if (playerError || !playerRow?.id) {
      const fallbackPlayerInsert = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          name: trimmedName,
          score: 0,
        })
        .select("id, name")
        .single();
      playerRow = fallbackPlayerInsert.data as { id?: string; name?: string } | null;
      playerError = fallbackPlayerInsert.error;
    }

    if (playerError || !playerRow?.id) {
      return { success: false, error: "Katilim hatasi: " + formatSupabaseError(playerError) };
    }

    const questionLoad = await loadQuestionsForRoom(room.id);
    if (!questionLoad.success) {
      console.error("Questions load error (legacy joinRoom):", questionLoad.error);
    }
    const playerLoad = await loadPlayersForRoom(room.id);
    if (!playerLoad.success) {
      console.error("Players load error (legacy joinRoom):", playerLoad.error);
    }

    get().unsubscribeFromRoom();
    set({
      roomId: room.id,
      roomCode: room.code || code,
      playerId: playerRow.id,
      playerName: playerRow.name || trimmedName,
      playerToken: null,
      hostToken: null,
      questions: questionLoad.questions,
      quizStatus: toQuizStatus(room.status),
      players: playerLoad.players,
      students: playerLoad.students,
      nameMasks: playerLoad.nameMasks,
      roomSettings: mapRoomSettingsFromRow(room),
      realtimeHealth: { ...initialRealtimeHealth },
    });

    get().subscribeToRoom();
    return { success: true };
  },

  // ===== LOAD ROOM (teacher dashboard reload) =====
  loadRoom: async (code) => {
    const roomLoad = await loadRoomByCode(code);
    const room = roomLoad.room;
    if (!roomLoad.success || !room) return false;

    const questionLoad = await loadQuestionsForRoom(room.id);
    if (!questionLoad.success) {
      console.error("Questions load error (loadRoom):", questionLoad.error);
    }
    const playerLoad = await loadPlayersForRoom(room.id);
    if (!playerLoad.success) {
      console.error("Players load error (loadRoom):", playerLoad.error);
    }

    get().unsubscribeFromRoom();
    const resolvedRoomCode = room.code || code;
    const storedHostToken = readHostTokenFromStorage(resolvedRoomCode);
    set({
      roomId: room.id,
      roomCode: resolvedRoomCode,
      questions: questionLoad.questions,
      quizStatus: toQuizStatus(room.status),
      players: playerLoad.players,
      students: playerLoad.students,
      nameMasks: playerLoad.nameMasks,
      roomSettings: mapRoomSettingsFromRow(room),
      hostToken: storedHostToken,
      playerId: null,
      playerName: "",
      playerToken: null,
      realtimeHealth: { ...initialRealtimeHealth },
    });

    get().subscribeToRoom();
    await get().fetchAnswers();
    return true;
  },

  // ===== STUDENT/TEACHER: Reload Questions For Current Room =====
  reloadQuestions: async () => {
    const { roomId } = get();
    if (!roomId) return false;

    const questionLoad = await loadQuestionsForRoom(roomId);
    if (!questionLoad.success) {
      console.error("Questions reload error:", questionLoad.error);
      return false;
    }

    set({ questions: questionLoad.questions });
    return questionLoad.questions.length > 0;
  },

  // ===== Fetch all players (snapshot / resync) =====
  fetchPlayers: async () => {
    const { roomId } = get();
    if (!roomId) return;

    const playerLoad = await loadPlayersForRoom(roomId);
    if (!playerLoad.success) {
      console.error("Players fetch error:", playerLoad.error);
      return;
    }

    set({
      players: playerLoad.players,
      students: playerLoad.students,
      nameMasks: playerLoad.nameMasks,
    });
  },

  setResultsPublishMode: async (mode) => {
    const { roomId, quizStatus, roomSettings, hostToken } = get();
    if (!roomId) return { success: false, error: "Oda bulunamadi." };

    const shouldPublishNow = mode === "auto" && quizStatus === "finished";
    if (hostToken) {
      const { error } = await supabase.rpc("set_results_publish_mode_secure", {
        p_room_id: roomId,
        p_host_token: hostToken,
        p_mode: mode,
      });

      if (!error) {
        set({
          roomSettings: {
            ...roomSettings,
            resultsPublishMode: mode,
            resultsPublished: shouldPublishNow ? true : roomSettings.resultsPublished,
          },
        });
        return { success: true };
      }

      if (!isRpcNotFoundError(error)) {
        return { success: false, error: formatSupabaseError(error) };
      }
    }

    const legacyUpdate = await supabase
      .from("rooms")
      .update({
        results_publish_mode: mode,
        ...(shouldPublishNow ? { results_published: true } : {}),
      })
      .eq("id", roomId);

    if (legacyUpdate.error) {
      return { success: false, error: formatSupabaseError(legacyUpdate.error) };
    }

    set({
      roomSettings: {
        ...roomSettings,
        resultsPublishMode: mode,
        resultsPublished: shouldPublishNow ? true : roomSettings.resultsPublished,
      },
    });
    return { success: true };
  },

  publishResults: async () => {
    const { roomId, roomSettings, hostToken } = get();
    if (!roomId) return { success: false, error: "Oda bulunamadi." };
    if (hostToken) {
      const { error } = await supabase.rpc("publish_results_secure", {
        p_room_id: roomId,
        p_host_token: hostToken,
      });

      if (!error) {
        set({
          roomSettings: {
            ...roomSettings,
            resultsPublished: true,
          },
        });
        return { success: true };
      }

      if (!isRpcNotFoundError(error)) {
        return { success: false, error: formatSupabaseError(error) };
      }
    }

    const legacyUpdate = await supabase
      .from("rooms")
      .update({ results_published: true })
      .eq("id", roomId);

    if (legacyUpdate.error) {
      return { success: false, error: formatSupabaseError(legacyUpdate.error) };
    }

    set({
      roomSettings: {
        ...roomSettings,
        resultsPublished: true,
      },
    });
    return { success: true };
  },

  togglePlayerNameMask: async (targetPlayerId) => {
    const { roomId, hostToken } = get();
    if (!roomId) return { success: false, error: "Oda bulunamadi." };

    let nextEnabled = false;
    let nextMaskedName: string | null = null;
    let handledBySecureRpc = false;

    if (hostToken) {
      const { data, error } = await supabase.rpc("toggle_player_name_mask_secure", {
        p_room_id: roomId,
        p_host_token: hostToken,
        p_player_id: targetPlayerId,
      });

      if (!error) {
        const payload = data as { mask_enabled?: boolean; masked_name?: string | null } | null;
        nextEnabled = Boolean(payload?.mask_enabled);
        nextMaskedName = typeof payload?.masked_name === "string" ? payload.masked_name : null;
        handledBySecureRpc = true;
      } else if (!isRpcNotFoundError(error)) {
        return { success: false, error: formatSupabaseError(error) };
      }
    }

    if (!handledBySecureRpc) {
      const playerRes = await supabase
        .from("players")
        .select("id, name, mask_enabled, masked_name")
        .eq("id", targetPlayerId)
        .eq("room_id", roomId)
        .single();

      if (playerRes.error || !playerRes.data) {
        return { success: false, error: formatSupabaseError(playerRes.error) };
      }

      const row = playerRes.data as DbPlayerRow;
      nextEnabled = !Boolean(row.mask_enabled);

      if (nextEnabled) {
        const rawName = (row.name || "").trim();
        if (rawName.length <= 1) {
          nextMaskedName = "*";
        } else if (rawName.length === 2) {
          nextMaskedName = `${rawName[0]}*`;
        } else {
          nextMaskedName = `${rawName[0]}${"*".repeat(Math.max(1, rawName.length - 2))}${rawName[rawName.length - 1]}`;
        }
      } else {
        nextMaskedName = null;
      }

      const updateRes = await supabase
        .from("players")
        .update({
          mask_enabled: nextEnabled,
          masked_name: nextMaskedName,
        })
        .eq("id", targetPlayerId)
        .eq("room_id", roomId);

      if (updateRes.error) {
        return { success: false, error: formatSupabaseError(updateRes.error) };
      }
    }

    set((current) => ({
      nameMasks: {
        ...current.nameMasks,
        [targetPlayerId]: {
          enabled: nextEnabled,
          maskedName: nextMaskedName,
        },
      },
    }));

    return { success: true };
  },

  // ===== STUDENT: Submit Answer =====
  submitAnswerForQuestion: async (questionId, selectedIndex, correctIndex, questionPoints) => {
    const { playerId, roomId, playerToken } = get();
    if (!playerId || !roomId) {
      return { success: false, error: "Ogrenci oturumu bulunamadi. Odaya yeniden katilin." };
    }

    if (playerToken) {
      const { data, error } = await supabase.rpc("submit_answer_secure", {
        p_room_id: roomId,
        p_player_id: playerId,
        p_player_token: playerToken,
        p_question_id: questionId,
        p_selected_index: selectedIndex,
      });

      if (!error) {
        const payload = data as SecureSubmitAnswerResponse | null;
        if (!payload?.success) {
          return {
            success: false,
            error: "Cevap islenemedi.",
          };
        }
        return { success: true };
      }

      if (!isRpcNotFoundError(error)) {
        console.error("submit_answer_secure error:", error);
        return {
          success: false,
          error: `Cevap kaydedilemedi: ${formatSupabaseError(error)}`,
        };
      }

      console.warn("submit_answer_secure RPC not found. Falling back to legacy answer flow.");
    }

    const isCorrect = selectedIndex === correctIndex;
    const insertRes = await supabase
      .from("answers")
      .insert({
        room_id: roomId,
        player_id: playerId,
        question_id: questionId,
        selected_index: selectedIndex,
        is_correct: isCorrect,
      })
      .select("id")
      .single();

    if (insertRes.error) {
      if (isDuplicateAnswerError(insertRes.error)) {
        return { success: true };
      }
      return {
        success: false,
        error: `Cevap kaydedilemedi: ${formatSupabaseError(insertRes.error)}`,
      };
    }

    if (isCorrect) {
      const safePoints = Number.isFinite(questionPoints) ? Math.max(0, questionPoints) : 0;
      if (safePoints > 0) {
        const incrementRes = await supabase.rpc("increment_score", {
          p_player_id: playerId,
          points: safePoints,
        });

        if (incrementRes.error && !isRpcNotFoundError(incrementRes.error)) {
          console.warn("increment_score error:", incrementRes.error);
        } else if (incrementRes.error) {
          const playerRes = await supabase
            .from("players")
            .select("score")
            .eq("id", playerId)
            .single();
          if (!playerRes.error && playerRes.data) {
            const currentScore = typeof playerRes.data.score === "number" ? playerRes.data.score : 0;
            const updateRes = await supabase
              .from("players")
              .update({ score: currentScore + safePoints })
              .eq("id", playerId);
            if (updateRes.error) {
              console.warn("Legacy score update error:", updateRes.error);
            }
          }
        }
      }
    }

    return { success: true };
  },

  // ===== STUDENT: Submit Answer (legacy local flow) =====
  submitAnswer: async () => {
    const { selectedAnswer, answerSubmitted, playerId, roomId, questions, currentQuestionIndex } = get();
    if (answerSubmitted || selectedAnswer === null) return;

    const question = questions[currentQuestionIndex];
    if (!question) return;

    if (!playerId || !roomId) return;

    const result = await get().submitAnswerForQuestion(
      question.id,
      selectedAnswer,
      question.correctIndex,
      question.points,
    );

    if (result.success) {
      set({ answerSubmitted: true, showFeedback: true, timerActive: false, quizStatus: "reviewing" });
    }
  },

  // ===== Fetch all answers (teacher snapshot / resync) =====
  fetchAnswers: async () => {
    const { roomId } = get();
    if (!roomId) return;

    const { data, error } = await supabase
      .from("answers")
      .select("question_id, player_id, selected_index, is_correct, players(name)")
      .eq("room_id", roomId);

    if (error || !data) {
      console.error("Answers fetch error:", error);
      set((current) => ({
        realtimeHealth: {
          ...current.realtimeHealth,
          status: "error",
          connected: false,
          lastStatusAt: Date.now(),
          lastError: formatSupabaseError(error),
        },
      }));
      return;
    }

    const answers = buildAnswerMap(data as Array<Record<string, unknown>>);
    set((current) => ({
      studentAnswers: answers,
      realtimeHealth: {
        ...current.realtimeHealth,
        lastSnapshotSyncAt: Date.now(),
        snapshotSyncCount: current.realtimeHealth.snapshotSyncCount + 1,
      },
    }));
  },

  // ===== Realtime Subscriptions =====
  subscribeToRoom: () => {
    const { roomId } = get();
    if (!roomId) return;

    if (activeRoomChannel) {
      supabase.removeChannel(activeRoomChannel);
      activeRoomChannel = null;
      activeRoomId = null;
    }
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }

    set((current) => ({
      realtimeHealth: {
        ...current.realtimeHealth,
        status: "connecting",
        connected: false,
        lastStatusAt: Date.now(),
        lastError: null,
      },
    }));

    const subscribedRoomId = roomId;
    let subscribedCount = 0;

    const resolvePlayerName = async (playerId: string) => {
      const state = get();
      const fromPlayers = state.players.find((p) => p.id === playerId)?.name;
      if (fromPlayers) return fromPlayers;

      const fromStudents = state.students.find((s) => s.id === playerId)?.name;
      if (fromStudents) return fromStudents;

      const { data, error } = await supabase
        .from("players")
        .select("id, name, score, mask_enabled, masked_name")
        .eq("id", playerId)
        .single();

      if (error || !data) return "Unknown";

      const fetched = data as DbPlayerRow;
      set((current) => ({
        players: upsertPlayerList(current.players, { id: fetched.id, name: fetched.name }),
        students: upsertStudentList(current.students, fetched),
        nameMasks: upsertNameMaskMap(current.nameMasks, fetched),
      }));
      return fetched.name;
    };

    const applyAnswerUpsert = async (row: DbAnswerRow) => {
      if (activeRoomId !== subscribedRoomId) return;

      const questionId = Number(row.question_id);
      const playerId = String(row.player_id || "");
      if (!questionId || !playerId) return;

      const studentName = await resolvePlayerName(playerId);
      if (activeRoomId !== subscribedRoomId) return;

      const now = Date.now();
      const parsedAnsweredAt = row.answered_at ? Date.parse(row.answered_at) : NaN;
      const hasLagSample = Number.isFinite(parsedAnsweredAt);
      const lagMs = hasLagSample ? Math.max(0, now - parsedAnsweredAt) : 0;

      const nextAnswer: StudentAnswer = {
        studentId: playerId,
        studentName,
        selectedIndex: Number(row.selected_index || 0),
        isCorrect: Boolean(row.is_correct),
      };

      set((current) => {
        const previousSamples = current.realtimeHealth.answerLagSampleCount;
        const nextSamples = hasLagSample ? previousSamples + 1 : previousSamples;
        const nextAvgLag = hasLagSample
          ? current.realtimeHealth.avgAnswerLagMs === null
            ? lagMs
            : ((current.realtimeHealth.avgAnswerLagMs * previousSamples) + lagMs) / nextSamples
          : current.realtimeHealth.avgAnswerLagMs;

        return {
          studentAnswers: upsertStudentAnswerMap(current.studentAnswers, questionId, nextAnswer),
          realtimeHealth: {
            ...current.realtimeHealth,
            lastAnswerEventAt: now,
            answerEventCount: current.realtimeHealth.answerEventCount + 1,
            avgAnswerLagMs: nextAvgLag,
            answerLagSampleCount: nextSamples,
          },
        };
      });
    };

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (activeRoomId !== subscribedRoomId) return;
          const roomRow = payload.new as DbRoomRow;
          const nextStatus = toQuizStatus(roomRow?.status);
          set((current) => ({
            quizStatus: nextStatus,
            roomSettings: mergeRoomSettingsFromRow(current.roomSettings, roomRow),
          }));
          if (nextStatus === "active") {
            void get().reloadQuestions();
          }
          if (nextStatus !== "idle") {
            void get().fetchPlayers();
            void get().fetchAnswers();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (activeRoomId !== subscribedRoomId) return;
          const eventType = payload.eventType;

          if (eventType === "DELETE") {
            const oldRow = payload.old as { id?: string };
            const id = oldRow.id;
            if (!id) return;

            set((current) => ({
              players: removePlayerFromList(current.players, id),
              students: removeStudentFromList(current.students, id),
              nameMasks: removeNameMaskMap(current.nameMasks, id),
            }));
            return;
          }

          const row = payload.new as DbPlayerRow;
          if (!row?.id || !row?.name) return;

          set((current) => ({
            players: upsertPlayerList(current.players, { id: row.id, name: row.name }),
            students: upsertStudentList(current.students, row),
            nameMasks: upsertNameMaskMap(current.nameMasks, row),
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions", filter: `room_id=eq.${roomId}` },
        async () => {
          if (activeRoomId !== subscribedRoomId) return;
          await get().reloadQuestions();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers", filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (activeRoomId !== subscribedRoomId) return;
          const eventType = payload.eventType;

          if (eventType === "DELETE") {
            const oldRow = payload.old as DbAnswerRow;
            const questionId = Number(oldRow.question_id);
            const playerId = String(oldRow.player_id || "");
            if (!questionId || !playerId) return;

            set((current) => ({
              studentAnswers: removeStudentAnswerMap(current.studentAnswers, questionId, playerId),
            }));
            return;
          }

          const row = payload.new as DbAnswerRow;
          void applyAnswerUpsert(row);
        },
      )
      .subscribe((status) => {
        if (activeRoomId !== subscribedRoomId) return;

        if (status === "SUBSCRIBED") {
          set((current) => ({
            realtimeHealth: {
              ...current.realtimeHealth,
              status: "subscribed",
              connected: true,
              lastStatusAt: Date.now(),
              lastError: null,
              reconnectCount:
                subscribedCount > 0
                  ? current.realtimeHealth.reconnectCount + 1
                  : current.realtimeHealth.reconnectCount,
            },
          }));
          subscribedCount += 1;
          void get().reloadQuestions();
          void get().fetchPlayers();
          void get().fetchAnswers();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          set((current) => ({
            realtimeHealth: {
              ...current.realtimeHealth,
              status: status === "CHANNEL_ERROR" ? "error" : "timed_out",
              connected: false,
              lastStatusAt: Date.now(),
              lastError: "Realtime channel disrupted",
            },
          }));
          // Fallback snapshot to recover drift after transient connection issues.
          void get().fetchPlayers();
          void get().fetchAnswers();
          return;
        }

        if (status === "CLOSED") {
          set((current) => ({
            realtimeHealth: {
              ...current.realtimeHealth,
              status: "closed",
              connected: false,
              lastStatusAt: Date.now(),
            },
          }));
        }
      });

    activeRoomChannel = channel;
    activeRoomId = roomId;

    syncIntervalId = setInterval(() => {
      if (activeRoomId !== subscribedRoomId) return;
      const status = get().quizStatus;
      if (status === "active" || status === "reviewing" || status === "finished") {
        void get().fetchPlayers();
        void get().fetchAnswers();
      }
    }, SNAPSHOT_SYNC_INTERVAL_MS);
  },

  unsubscribeFromRoom: () => {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
    if (activeRoomChannel) {
      supabase.removeChannel(activeRoomChannel);
      activeRoomChannel = null;
      activeRoomId = null;
    }
    set((current) => ({
      realtimeHealth: {
        ...current.realtimeHealth,
        status: "closed",
        connected: false,
        lastStatusAt: Date.now(),
      },
    }));
  },

  // ===== LOCAL-ONLY ACTIONS (kept for backward compat) =====
  addPlayer: async (name) => {
    const { roomId } = get();
    if (!roomId) return false;

    const { data, error } = await supabase
      .from("players")
      .insert({ room_id: roomId, name })
      .select("id")
      .single();

    if (error || !data) return false;

    set((current) => ({
      players: upsertPlayerList(current.players, { id: data.id, name }),
      students: upsertStudentList(current.students, { id: data.id, name, score: 0 }),
      nameMasks: {
        ...current.nameMasks,
        [data.id]: {
          enabled: false,
          maskedName: null,
        },
      },
    }));
    return true;
  },

  nextQuestion: () => {
    const { currentQuestionIndex, questions } = get();
    const next = currentQuestionIndex + 1;
    if (next >= questions.length) {
      set({ quizStatus: "finished", timerActive: false });
      return;
    }

    set({
      currentQuestionIndex: next,
      timeRemaining: 20,
      timerActive: false,
      quizStatus: "active",
      selectedAnswer: null,
      answerSubmitted: false,
      showFeedback: false,
    });
  },

  tickTimer: () => {
    const { timeRemaining, timerActive } = get();
    if (!timerActive) return;

    if (timeRemaining <= 1) {
      set({
        timeRemaining: 0,
        timerActive: false,
        quizStatus: "reviewing",
        showFeedback: true,
        answerSubmitted: true,
      });
      return;
    }

    set({ timeRemaining: timeRemaining - 1 });
  },

  selectAnswer: (index) => {
    if (get().answerSubmitted) return;
    set({ selectedAnswer: index });
  },

  resetStudentAnswer: () => set({ selectedAnswer: null, answerSubmitted: false, showFeedback: false }),

  shuffleLeaderboard: () => {
    const { students } = get();
    const updated = students.map((s) => ({
      ...s,
      score: s.score + Math.floor(Math.random() * 400 - 100),
    }));
    set({ students: updated.sort((a, b) => b.score - a.score) });
  },

  simulateStudentAnswers: () => {
    const { questions, students } = get();
    const answers: Record<number, StudentAnswer[]> = {};

    questions.forEach((question) => {
      answers[question.id] = students.map((student) => {
        const correctChance = 0.4 + (student.score / 5000) * 0.4;
        const isCorrect = Math.random() < correctChance;
        const selectedIndex = isCorrect
          ? question.correctIndex
          : (() => {
              const wrongOptions = question.options
                .map((_, i) => i)
                .filter((i) => i !== question.correctIndex);
              return wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
            })();

        return {
          studentId: student.id,
          studentName: student.name,
          selectedIndex,
          isCorrect,
        };
      });
    });

    set({ studentAnswers: answers });
  },
}));
