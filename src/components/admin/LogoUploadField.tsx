import { useRef, useState } from 'react';
import { Upload, Link as LinkIcon, X, Loader2, Sparkles, Check } from 'lucide-react';
import { uploadSiteLogo } from '@/services/admin.ts';
import type { LogoAssets } from '@/lib/logoAssets.ts';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // matches the backend's multer limit

interface LogoUploadFieldProps {
  /** Current logo URL, or '' when unset. */
  value: string;
  /** The derived icon set, when the current logo came from an upload. */
  assets?: LogoAssets | null;
  /** Both move together — a logo without its variants is a stale pairing. */
  onChange: (logo: string, assets: LogoAssets | null) => void;
}

/**
 * The site logo field.
 *
 * Deliberately not `ImageUploadField`. That component stores one URL, which is
 * the right shape for a category photo and the wrong one for a logo: the same
 * file cannot serve as a 16px favicon, a 180px iOS icon and a 1200x630 share
 * card, and whatever background the logo was exported on follows it into the
 * dark navbar.
 *
 * So the upload goes through the logo pipeline instead, and this field shows
 * the admin what came back — the cutout on a checkerboard, so a failed key is
 * obvious at a glance, and the actual generated favicon and header marks rather
 * than a claim that they exist.
 */
export function LogoUploadField({ value, assets, onChange }: LogoUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  /** Remembered so "keep the original background" survives a re-upload. */
  const [removeBackground, setRemoveBackground] = useState(true);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const upload = async (file: File, keyOut = removeBackground) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Logo must be under 5MB');
      return;
    }
    setError('');
    setIsUploading(true);
    try {
      const next = await uploadSiteLogo(file, keyOut);
      setLastFile(file);
      // The master is the canonical logo URL — everything downstream checks
      // that the two still match before trusting the variant set.
      onChange(next.master, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed, please try again');
    } finally {
      setIsUploading(false);
    }
  };

  /** Re-run the same file with keying flipped, without asking for it again. */
  const reprocess = (keyOut: boolean) => {
    setRemoveBackground(keyOut);
    if (lastFile) upload(lastFile, keyOut);
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) upload(file);
  };

  const handleAddUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    // A pasted URL has no variants. Clearing them is the point: keeping the
    // previous logo's favicon alongside a new logo is worse than having none.
    onChange(url, null);
    setLastFile(null);
    setUrlInput('');
    setShowUrl(false);
    setError('');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // A checkerboard behind the preview, so a background that did not come off
  // reads as a solid tile instead of blending into the panel.
  const checkerboard = {
    backgroundImage:
      'linear-gradient(45deg, rgba(128,128,128,.22) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.22) 75%),' +
      'linear-gradient(45deg, rgba(128,128,128,.22) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.22) 75%)',
    backgroundSize: '12px 12px',
    backgroundPosition: '0 0, 6px 6px',
  };

  const preview = assets?.master || value;

  return (
    <div>
      <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
        Logo
      </label>

      {preview ? (
        <div className="flex items-start gap-4">
          <div
            className="relative group w-24 h-24 shrink-0 overflow-hidden rounded-xl border-2 border-surface-200 dark:border-surface-700"
            style={checkerboard}
          >
            <img
              src={preview}
              alt=""
              className="w-full h-full object-contain p-1"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 size={20} className="text-white animate-spin" />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-surface-900/90 text-surface-700 dark:text-surface-200 text-caption font-medium hover:bg-white dark:hover:bg-surface-900 transition-colors"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => { onChange('', null); setLastFile(null); }}
                disabled={isUploading}
                className="p-1.5 rounded-lg bg-white/90 dark:bg-surface-900/90 text-surface-700 dark:text-surface-200 hover:bg-red-500 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {assets && (
            <div className="min-w-0 flex-1 space-y-2">
              <p className="flex items-center gap-1.5 text-caption text-surface-600 dark:text-surface-400">
                {assets.transparent ? (
                  <>
                    <Sparkles size={12} className="text-brand-500 shrink-0" />
                    <span>
                      Background removed
                      {assets.removedColor && (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-sm border border-surface-300 dark:border-surface-600 align-middle ml-1.5"
                          style={{ backgroundColor: assets.removedColor }}
                        />
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <Check size={12} className="text-surface-400 shrink-0" />
                    <span>Kept as uploaded — no flat background found</span>
                  </>
                )}
              </p>

              {/* The generated files themselves, at the size they will be used. */}
              <div className="flex items-end gap-3">
                {[
                  { src: assets.favicon32, size: 16, label: 'Tab' },
                  { src: assets.header, size: 32, label: 'Header' },
                  { src: assets.loader, size: 48, label: 'Loader' },
                  { src: assets.appleTouch, size: 48, label: 'iOS' },
                ].map((v) => (
                  <div key={v.label} className="flex flex-col items-center gap-1">
                    <div
                      className="flex items-center justify-center rounded-md border border-surface-200 dark:border-surface-700"
                      style={{ ...checkerboard, width: v.size + 8, height: v.size + 8 }}
                    >
                      <img src={v.src} alt="" width={v.size} height={v.size} className="object-contain" />
                    </div>
                    <span className="text-[10px] text-surface-400">{v.label}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => reprocess(!removeBackground)}
                disabled={isUploading || !lastFile}
                className="text-caption text-surface-500 hover:text-brand-500 disabled:opacity-40 disabled:hover:text-surface-500 transition-colors underline underline-offset-2"
              >
                {removeBackground ? 'Keep the original background instead' : 'Remove the background instead'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center gap-1.5 w-full h-24 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${isDragging ? 'border-brand-500 bg-brand-500/5' : 'border-surface-300 dark:border-surface-600 hover:border-brand-400'}`}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {isUploading ? (
            <>
              <Loader2 size={18} className="text-brand-500 animate-spin" />
              <p className="text-caption text-surface-500">Generating icons…</p>
            </>
          ) : (
            <>
              <Upload size={18} className="text-surface-400" />
              <p className="text-caption text-surface-500 text-center px-2">
                Drop your logo or <span className="text-brand-500 font-medium">browse</span>
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={() => setShowUrl(!showUrl)}
          className="flex items-center gap-1 text-caption text-surface-500 hover:text-brand-500 transition-colors"
        >
          <LinkIcon size={11} /> Paste URL instead
        </button>
      </div>

      {showUrl && (
        <div className="flex gap-2 mt-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }}
            placeholder="https://..."
            className="flex-1 px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAddUrl}
            disabled={!urlInput.trim()}
            className="px-3 py-2 rounded-lg bg-brand-500 text-white text-caption font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {showUrl && (
        <p className="text-caption text-surface-400 mt-1.5">
          A pasted URL is used as-is — no favicon or app icons are generated from it.
        </p>
      )}

      {error && <p className="text-caption text-red-500 mt-1">{error}</p>}
    </div>
  );
}
