import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, Film, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UploadZoneProps {
  roomId: string;
  onUploaded: (url: string, name: string) => void;
}

export default function UploadZone({ roomId, onUploaded }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError('Bitte nur Videodateien hochladen.');
      return;
    }
    setError(null);
    setProgress(0);

    const path = `${roomId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const xhr = new XMLHttpRequest();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data } = supabase.storage.from('videos').getPublicUrl(path);
        await supabase
          .from('rooms')
          .update({ video_url: data.publicUrl, video_name: file.name })
          .eq('id', roomId);
        onUploaded(data.publicUrl, file.name);
        setProgress(null);
      } else {
        setError('Upload fehlgeschlagen. Bitte erneut versuchen.');
        setProgress(null);
      }
    });

    xhr.addEventListener('error', () => {
      setError('Upload fehlgeschlagen. Bitte erneut versuchen.');
      setProgress(null);
    });

    xhr.open('POST', `${supabaseUrl}/storage/v1/object/videos/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseKey}`);
    xhr.setRequestHeader('x-upsert', 'true');

    const formData = new FormData();
    formData.append('', file);
    xhr.send(formData);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xl mx-auto">
      <div
        onClick={() => progress === null && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`
          relative w-full border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer
          transition-all duration-200
          ${dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'}
          ${progress !== null ? 'pointer-events-none' : ''}
        `}
      >
        {progress !== null ? (
          <Loader2 className="w-12 h-12 text-sky-500 animate-spin" />
        ) : (
          <div className="p-4 bg-sky-100 rounded-full">
            <Upload className="w-8 h-8 text-sky-600" />
          </div>
        )}

        <div className="text-center">
          {progress !== null ? (
            <p className="text-slate-700 font-medium">Video wird hochgeladen...</p>
          ) : (
            <>
              <p className="font-semibold text-slate-700">Video hier ablegen</p>
              <p className="text-sm text-slate-500 mt-1">oder klicken zum Auswählen</p>
              <p className="text-xs text-slate-400 mt-2">MP4, WebM, OGG — bis zu 2 GB</p>
            </>
          )}
        </div>

        {progress !== null && (
          <div className="w-full max-w-xs">
            <div className="flex justify-between text-sm text-slate-600 mb-1.5">
              <span>Hochladen...</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Film className="w-4 h-4" />
        <span>Das Video wird mit allen Teilnehmern geteilt</span>
      </div>
    </div>
  );
}
