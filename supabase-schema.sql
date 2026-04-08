-- =============================================
-- Gemini Quiz Arena - Supabase SQL Schema
-- =============================================

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  status text DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'finished')),
  hint_mode_enabled boolean NOT NULL DEFAULT true,
  results_publish_mode text NOT NULL DEFAULT 'auto' CHECK (results_publish_mode IN ('auto', 'manual')),
  results_published boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
  id serial PRIMARY KEY,
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  "index" int NOT NULL,
  text text NOT NULL,
  options jsonb NOT NULL,
  correct_index int NOT NULL,
  difficulty text DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  points int DEFAULT 200,
  explanations jsonb,
  hint text
);

-- Players
CREATE TABLE IF NOT EXISTS players (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  score int DEFAULT 0,
  mask_enabled boolean NOT NULL DEFAULT false,
  masked_name text,
  joined_at timestamptz DEFAULT now()
);

-- Answers
CREATE TABLE IF NOT EXISTS answers (
  id serial PRIMARY KEY,
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  question_id int REFERENCES questions(id) ON DELETE CASCADE,
  selected_index int NOT NULL,
  is_correct boolean NOT NULL,
  answered_at timestamptz DEFAULT now(),
  UNIQUE(player_id, question_id)
);

-- Secret tokens (not exposed to clients)
CREATE TABLE IF NOT EXISTS room_secrets (
  room_id uuid PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  host_token text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_secrets (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_token text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_secrets_room_id ON player_secrets(room_id);

-- RLS (deny by default for writes; public read only)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access" ON rooms;
DROP POLICY IF EXISTS "Public access" ON questions;
DROP POLICY IF EXISTS "Public access" ON players;
DROP POLICY IF EXISTS "Public access" ON answers;

DROP POLICY IF EXISTS "Public read rooms" ON rooms;
DROP POLICY IF EXISTS "Public read questions" ON questions;
DROP POLICY IF EXISTS "Public read players" ON players;
DROP POLICY IF EXISTS "Public read answers" ON answers;

CREATE POLICY "Public read rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Public read questions" ON questions FOR SELECT USING (true);
CREATE POLICY "Public read players" ON players FOR SELECT USING (true);
CREATE POLICY "Public read answers" ON answers FOR SELECT USING (true);

-- Legacy RPC (kept for backward compatibility, access revoked below)
CREATE OR REPLACE FUNCTION increment_score(p_player_id uuid, points int)
RETURNS void AS $$
BEGIN
  UPDATE players SET score = score + points WHERE id = p_player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Secure RPC helpers
CREATE OR REPLACE FUNCTION public.create_room_secure(
  p_code text,
  p_hint_mode_enabled boolean DEFAULT true,
  p_results_publish_mode text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room public.rooms;
  v_host_token text;
  v_mode text;
BEGIN
  v_mode := lower(coalesce(p_results_publish_mode, 'auto'));
  IF v_mode NOT IN ('auto', 'manual') THEN
    RAISE EXCEPTION 'invalid_results_publish_mode';
  END IF;

  INSERT INTO public.rooms (code, status, hint_mode_enabled, results_publish_mode, results_published)
  VALUES (p_code, 'idle', coalesce(p_hint_mode_enabled, true), v_mode, false)
  RETURNING * INTO v_room;

  v_host_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.room_secrets(room_id, host_token) VALUES (v_room.id, v_host_token);

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'room_code', v_room.code,
    'status', v_room.status,
    'hint_mode_enabled', v_room.hint_mode_enabled,
    'results_publish_mode', v_room.results_publish_mode,
    'results_published', v_room.results_published,
    'host_token', v_host_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_questions_secure(
  p_room_id uuid,
  p_host_token text,
  p_questions jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_index int := 0;
  v_text text;
  v_options jsonb;
  v_correct_index int;
  v_difficulty text;
  v_points int;
  v_explanations jsonb;
  v_hint text;
  v_options_count int;
BEGIN
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_questions_payload';
  END IF;

  PERFORM 1
  FROM public.room_secrets rs
  WHERE rs.room_id = p_room_id
    AND rs.host_token = p_host_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized_host';
  END IF;

  DELETE FROM public.questions WHERE room_id = p_room_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_questions)
  LOOP
    v_text := coalesce(v_item->>'text', '');
    v_options := v_item->'options';
    v_correct_index := coalesce((v_item->>'correct_index')::int, 0);
    v_difficulty := lower(coalesce(v_item->>'difficulty', 'medium'));
    v_points := coalesce((v_item->>'points')::int, 0);
    v_explanations := v_item->'explanations';
    v_hint := nullif(v_item->>'hint', '');

    IF v_text = '' THEN
      RAISE EXCEPTION 'invalid_question_text';
    END IF;

    IF v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
      RAISE EXCEPTION 'invalid_question_options';
    END IF;

    v_options_count := jsonb_array_length(v_options);
    IF v_options_count < 2 THEN
      RAISE EXCEPTION 'question_options_too_few';
    END IF;

    IF v_correct_index < 0 OR v_correct_index >= v_options_count THEN
      RAISE EXCEPTION 'invalid_correct_index';
    END IF;

    IF v_difficulty NOT IN ('easy', 'medium', 'hard') THEN
      v_difficulty := 'medium';
    END IF;

    IF v_points <= 0 THEN
      v_points := CASE v_difficulty
        WHEN 'easy' THEN 100
        WHEN 'hard' THEN 300
        ELSE 200
      END;
    END IF;

    INSERT INTO public.questions(
      room_id, "index", text, options, correct_index, difficulty, points, explanations, hint
    )
    VALUES (
      p_room_id, v_index, v_text, v_options, v_correct_index, v_difficulty, v_points, v_explanations, v_hint
    );

    v_index := v_index + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_room_secure(
  p_code text,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room public.rooms;
  v_player public.players;
  v_player_token text;
  v_name text;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE code = p_code
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;

  -- Do not allow new joins after the session is finished.
  -- Existing participants can still read results via SELECT policies.
  IF v_room.status = 'finished' THEN
    RAISE EXCEPTION 'room_closed';
  END IF;

  v_name := btrim(coalesce(p_name, ''));
  IF char_length(v_name) < 1 OR char_length(v_name) > 40 THEN
    RAISE EXCEPTION 'invalid_player_name';
  END IF;

  INSERT INTO public.players(room_id, name, score, mask_enabled, masked_name)
  VALUES (v_room.id, v_name, 0, false, null)
  RETURNING * INTO v_player;

  v_player_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.player_secrets(player_id, room_id, player_token)
  VALUES (v_player.id, v_room.id, v_player_token);

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'room_code', v_room.code,
    'room_status', v_room.status,
    'hint_mode_enabled', v_room.hint_mode_enabled,
    'results_publish_mode', v_room.results_publish_mode,
    'results_published', v_room.results_published,
    'player_id', v_player.id,
    'player_name', v_player.name,
    'player_token', v_player_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_answer_secure(
  p_room_id uuid,
  p_player_id uuid,
  p_player_token text,
  p_question_id int,
  p_selected_index int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_correct_index int;
  v_points int;
  v_is_correct boolean;
  v_answer_id int;
  v_score int;
  v_options_count int;
BEGIN
  PERFORM 1
  FROM public.player_secrets ps
  WHERE ps.player_id = p_player_id
    AND ps.room_id = p_room_id
    AND ps.player_token = p_player_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized_player';
  END IF;

  SELECT q.correct_index, q.points, jsonb_array_length(q.options)
  INTO v_correct_index, v_points, v_options_count
  FROM public.questions q
  WHERE q.id = p_question_id
    AND q.room_id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found';
  END IF;

  IF p_selected_index < 0 OR p_selected_index >= v_options_count THEN
    RAISE EXCEPTION 'invalid_selected_index';
  END IF;

  v_is_correct := p_selected_index = v_correct_index;

  INSERT INTO public.answers(room_id, player_id, question_id, selected_index, is_correct)
  VALUES (p_room_id, p_player_id, p_question_id, p_selected_index, v_is_correct)
  ON CONFLICT (player_id, question_id) DO NOTHING
  RETURNING id INTO v_answer_id;

  IF v_answer_id IS NULL THEN
    SELECT a.is_correct INTO v_is_correct
    FROM public.answers a
    WHERE a.player_id = p_player_id
      AND a.question_id = p_question_id;

    SELECT p.score INTO v_score
    FROM public.players p
    WHERE p.id = p_player_id;

    RETURN jsonb_build_object('success', true, 'is_correct', v_is_correct, 'score', coalesce(v_score, 0));
  END IF;

  IF v_is_correct THEN
    UPDATE public.players
    SET score = score + greatest(0, coalesce(v_points, 0))
    WHERE id = p_player_id
    RETURNING score INTO v_score;
  ELSE
    SELECT p.score INTO v_score
    FROM public.players p
    WHERE p.id = p_player_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'is_correct', v_is_correct, 'score', coalesce(v_score, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_room_state_secure(
  p_room_id uuid,
  p_host_token text,
  p_status text,
  p_results_published boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room public.rooms;
  v_status text;
BEGIN
  v_status := lower(coalesce(p_status, 'idle'));
  IF v_status NOT IN ('idle', 'active', 'finished') THEN
    RAISE EXCEPTION 'invalid_room_status';
  END IF;

  PERFORM 1
  FROM public.room_secrets rs
  WHERE rs.room_id = p_room_id
    AND rs.host_token = p_host_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized_host';
  END IF;

  UPDATE public.rooms
  SET status = v_status,
      results_published = coalesce(p_results_published, results_published)
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'status', v_room.status,
    'results_published', v_room.results_published
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_results_publish_mode_secure(
  p_room_id uuid,
  p_host_token text,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room public.rooms;
  v_mode text;
BEGIN
  v_mode := lower(coalesce(p_mode, 'auto'));
  IF v_mode NOT IN ('auto', 'manual') THEN
    RAISE EXCEPTION 'invalid_publish_mode';
  END IF;

  PERFORM 1
  FROM public.room_secrets rs
  WHERE rs.room_id = p_room_id
    AND rs.host_token = p_host_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized_host';
  END IF;

  UPDATE public.rooms
  SET results_publish_mode = v_mode,
      results_published = CASE
        WHEN v_mode = 'auto' AND status = 'finished' THEN true
        ELSE results_published
      END
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'results_publish_mode', v_room.results_publish_mode,
    'results_published', v_room.results_published
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_results_secure(
  p_room_id uuid,
  p_host_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room public.rooms;
BEGIN
  PERFORM 1
  FROM public.room_secrets rs
  WHERE rs.room_id = p_room_id
    AND rs.host_token = p_host_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized_host';
  END IF;

  UPDATE public.rooms
  SET results_published = true
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'results_published', v_room.results_published
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_player_name_mask_secure(
  p_room_id uuid,
  p_host_token text,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player public.players;
  v_masked_name text;
  v_next_enabled boolean;
BEGIN
  PERFORM 1
  FROM public.room_secrets rs
  WHERE rs.room_id = p_room_id
    AND rs.host_token = p_host_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized_host';
  END IF;

  SELECT * INTO v_player
  FROM public.players p
  WHERE p.id = p_player_id
    AND p.room_id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  v_next_enabled := NOT coalesce(v_player.mask_enabled, false);

  IF v_next_enabled THEN
    IF char_length(v_player.name) <= 1 THEN
      v_masked_name := '*';
    ELSIF char_length(v_player.name) = 2 THEN
      v_masked_name := left(v_player.name, 1) || '*';
    ELSE
      v_masked_name := left(v_player.name, 1)
        || repeat('*', greatest(1, char_length(v_player.name) - 2))
        || right(v_player.name, 1);
    END IF;
  ELSE
    v_masked_name := null;
  END IF;

  UPDATE public.players
  SET mask_enabled = v_next_enabled,
      masked_name = v_masked_name
  WHERE id = p_player_id
  RETURNING * INTO v_player;

  RETURN jsonb_build_object(
    'player_id', v_player.id,
    'mask_enabled', v_player.mask_enabled,
    'masked_name', v_player.masked_name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_score(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_secure(text, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_questions_secure(uuid, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_secure(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_answer_secure(uuid, uuid, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_room_state_secure(uuid, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_results_publish_mode_secure(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_results_secure(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_player_name_mask_secure(uuid, text, uuid) TO anon, authenticated;

-- Realtime publication (idempotent)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE rooms; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE players; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE answers; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE questions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- =============================================
-- Existing DB compatibility migration
-- =============================================
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hint_mode_enabled boolean;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS results_publish_mode text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS results_published boolean;
ALTER TABLE players ADD COLUMN IF NOT EXISTS mask_enabled boolean;
ALTER TABLE players ADD COLUMN IF NOT EXISTS masked_name text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanations jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS hint text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS "index" int;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS points int;

CREATE TABLE IF NOT EXISTS room_secrets (
  room_id uuid PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  host_token text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_secrets (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_token text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_secrets_room_id ON player_secrets(room_id);

ALTER TABLE room_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO room_secrets(room_id, host_token)
SELECT r.id, encode(gen_random_bytes(24), 'hex')
FROM rooms r
LEFT JOIN room_secrets rs ON rs.room_id = r.id
WHERE rs.room_id IS NULL;

INSERT INTO player_secrets(player_id, room_id, player_token)
SELECT p.id, p.room_id, encode(gen_random_bytes(24), 'hex')
FROM players p
LEFT JOIN player_secrets ps ON ps.player_id = p.id
WHERE ps.player_id IS NULL;

UPDATE rooms
SET hint_mode_enabled = true
WHERE hint_mode_enabled IS NULL;

UPDATE rooms
SET results_publish_mode = 'auto'
WHERE results_publish_mode IS NULL OR results_publish_mode NOT IN ('auto', 'manual');

UPDATE rooms
SET results_published = false
WHERE results_published IS NULL;

ALTER TABLE rooms
  ALTER COLUMN hint_mode_enabled SET DEFAULT true,
  ALTER COLUMN hint_mode_enabled SET NOT NULL,
  ALTER COLUMN results_publish_mode SET DEFAULT 'auto',
  ALTER COLUMN results_publish_mode SET NOT NULL,
  ALTER COLUMN results_published SET DEFAULT false,
  ALTER COLUMN results_published SET NOT NULL;

DO $$
BEGIN
  BEGIN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_results_publish_mode_check
      CHECK (results_publish_mode IN ('auto', 'manual'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

UPDATE players
SET mask_enabled = false
WHERE mask_enabled IS NULL;

ALTER TABLE players
  ALTER COLUMN mask_enabled SET DEFAULT false,
  ALTER COLUMN mask_enabled SET NOT NULL;

UPDATE questions
SET difficulty = 'medium'
WHERE difficulty IS NULL OR difficulty NOT IN ('easy', 'medium', 'hard');

UPDATE questions
SET points = CASE difficulty
  WHEN 'easy' THEN 100
  WHEN 'hard' THEN 300
  ELSE 200
END
WHERE points IS NULL OR points <= 0;

ALTER TABLE questions
  ALTER COLUMN difficulty SET DEFAULT 'medium',
  ALTER COLUMN points SET DEFAULT 200;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY room_id ORDER BY id) - 1 AS idx
  FROM questions
)
UPDATE questions q
SET "index" = ranked.idx
FROM ranked
WHERE q.id = ranked.id
  AND q."index" IS NULL;

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
