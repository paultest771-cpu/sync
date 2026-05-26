
/*
  # Storage RLS Policies for videos bucket

  Allow public upload and download from the videos storage bucket.
*/

CREATE POLICY "Anyone can upload videos"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Anyone can read videos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'videos');
