import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Room {
  id: string;
  name: string;
  video_url: string | null;
  video_name: string | null;
  created_at: string;
}

export interface PlaybackState {
  id: string;
  room_id: string;
  is_playing: boolean;
  position: number;
  updated_at: string;
}
