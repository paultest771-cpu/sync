import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, Film, Loader2, Link, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UploadZoneProps {
  roomId: string;
  onUploaded: (url: string, name: string) => void;
}

export default function UploadZone({ roomId, onUploaded }: UploadZoneProps) {
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlName, setUrlName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError('Bitte nur Videodateien hochladen.');
      setErrorDetails(null);
      return;
    }

    setError(null);
    setErrorDetails(null);
    setUploading(true);
    setProgress(0);

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Datei zu gross');
      setErrorDetails(
        `Deine Datei ist ${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB. ` +
        `Supabase Storage unterstuetzt maximal 500 MB fuer Direkt-Uploads.\n\n` +
        `Loesung: Lade die Datei auf einen Cloud-Speicher (Google Drive, Dropbox, etc.) ` +
        `und nutze den oeffentlichen Link ueber "URL hinzufuegen".`
      );
      setUploading(false);
      return;
    }

    const path = `${roomId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        if (uploadError.message.includes('exceeded the maximum allowed size')) {
          setError('Datei zu gross fuer Supabase Storage');
          setErrorDetails(
            'Supabase Storage hat ein Limit von 500 MB pro Datei.\n\n' +
            'Alternative: Nutze einen externen Datei-Hoster (Google Drive, Dropbox, ' +
            'OneDrive) und fuege die oeffentliche URL ueber "URL hinzufuegen" hinzu.'
          );
        } else {
          setError('Upload fehlgeschlagen');
          setErrorDetails(uploadError.message);
        }
        setUploading(false);
        setProgress(null);
        return;
      }

      const { data } = supabase.storage.from('videos').getPublicUrl(path);

      await supabase
        .from('rooms')
        .update({ video_url: data.publicUrl, video_name: file.name })
        .eq('id', roomId);

      onUploaded(data.publicUrl, file.name);
      setProgress(null);
      setUploading(false);
    } catch (err) {
      setError('Upload fehlgeschlagen');
      setErrorDetails(err instanceof Error ? err.message : 'Unbekannter Fehler');
      setProgress(null);
      setUploading(false);
    }
  };

  const handleUrlSubmit = async () => {
    const url = urlInput.trim();
    if (!url) {
      setError('Bitte eine URL eingeben.');
      setErrorDetails(null);
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setError('Bitte eine gueltige URL eingeben (http:// oder https://).');
      setErrorDetails(null);
      return;
    }

    setError(null);
    setErrorDetails(null);
    setUploading(true);

    const name = urlName.trim() || 'Externes Video';

    const { error: updateError } = await supabase
      .from('rooms')
      .update({ video_url: url, video_name: name })
      .eq('id', roomId);

    if (updateError) {
      setError('Fehler beim Speichern der URL');
      setErrorDetails(updateError.message);
      setUploading(false);
      return;
    }

    onUploaded(url, name);
    setUploading(false);
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
    <div className="w-full max-w-xl">
      <div className="flex border-b border-slate-700 mb-4">
        <button
          onClick={() => { setTab('upload'); setError(null); setErrorDetails(null); }}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === 'upload'
              ? 'text-sky-400 border-b-2 border-sky-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Upload className="w-4 h-4" />
          Datei hochladen
        </button>
        <button
          onClick={() => { setTab('url'); setError(null); setErrorDetails(null); }}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === 'url'
              ? 'text-sky-400 border-b-2 border-sky-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Link className="w-4 h-4" />
          URL hinzufuegen
        </button>
      </div>

      {tab === 'upload' ? (
        <div className="flex flex-col items-center gap-4">
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`
              relative w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer
              transition-all duration-200
              ${dragging ? 'border-sky-400 bg-sky-900/20' : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'}
              ${uploading ? 'pointer-events-none' : ''}
            `}
          >
            {uploading ? (
              <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
            ) : (
              <div className="p-3 bg-sky-900/30 rounded-full">
                <Upload className="w-6 h-6 text-sky-400" />
              </div>
            )}

            <div className="text-center">
              <p className="font-medium text-slate-200">Video hier ablegen</p>
              <p className="text-sm text-slate-400 mt-1">oder klicken zum Auswaehlen</p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onInputChange}
              disabled={uploading}
            />
          </div>

          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Film className="w-4 h-4" />
            <span>MP4, WebM, OGG — max. 500 MB</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 mb-2">
            <p className="text-amber-200 text-sm">
              <strong>Hinweis:</strong> Fuer Videos groesser als 500 MB nutze einen Cloud-Speicher
              (Google Drive, Dropbox, OneDrive) und fuege den oeffentlichen Freigabe-Link hier ein.
            </p>
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1.5 block">Video URL *</label>
            <input
              type="url"
              placeholder="https://drive.google.com/file/d/xxx/view oder https://dropbox.com/..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1.5 block">Anzeigename (optional)</label>
            <input
              type="text"
              placeholder="Mein Video"
              value={urlName}
              onChange={(e) => setUrlName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
          <button
            onClick={handleUrlSubmit}
            disabled={uploading}
            className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
          >
            {uploading ? 'Wird hinzugefuegt...' : 'Video hinzufuegen'}
          </button>
          <p className="text-xs text-slate-500">
            Direkt-Links (.mp4, .webm) oder geteilte Cloud-Storage Links
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 mt-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-medium text-sm">{error}</p>
              {errorDetails && (
                <p className="text-red-400/80 text-xs mt-2 whitespace-pre-wrap">{errorDetails}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
