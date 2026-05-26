
/*
  # Watch Together Schema

  1. New Tables
    - `rooms`
      - `id` (uuid, primary key)
      - `name` (text) - display name for the room
      - `video_url` (text, nullable) - public URL of uploaded video
      - `video_name` (text, nullable) - original filename
      - `created_at` (timestamptz)
    - `playback_state`
      - `id` (uuid, primary key)
      - `room_id` (uuid, FK -> rooms) - one-to-one with room
      - `is_playing` (boolean)
      - `position` (float8) - current playback position in seconds
      - `updated_at` (timestamptz) - used to detect stale updates

  2. Security
    - RLS enabled on both tables
    - Public read/write (no auth required) so anyone with the link can join
    - Note: Since this is a shared-viewing app without user accounts, policies allow all operations for anon/authenticated
*/

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  video_url text,
  video_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms"
  ON rooms FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert rooms"
  ON rooms FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update rooms"
  ON rooms FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS playback_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  is_playing boolean NOT NULL DEFAULT false,
  position float8 NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (room_id)
);

ALTER TABLE playback_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view playback state"
  ON playback_state FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert playback state"
  ON playback_state FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update playback state"
  ON playback_state FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Enable realtime on playback_state for live sync
ALTER PUBLICATION supabase_realtime ADD TABLE playback_state;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
