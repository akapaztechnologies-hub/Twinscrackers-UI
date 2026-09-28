import { useRef, useState } from 'react';
import { Upload, Link as LinkIcon, X, Loader2 } from 'lucide-react';
import { uploadAdminImage, type UploadFolder } from '@/services/admin.ts';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // matches the backend's multer limit

interface ImageUploadFieldProps {
  /** Current image URL, or '' when unset. */
  value: string;
  onChange: (url: string) => void;
  /** R2 key prefix — keeps uploads organized by where they're used. */
  folder?: UploadFolder;
  label?: string;
  /** Helper text shown under the field, e.g. recommended dimensions. */
  hint?: string;
  /** Sizing/shape of the preview box, e.g. "w-20 h-20 rounded-full" for an avatar. */
  previewClassName?: string;
  placeholder?: string;
  /** Drop the descriptive text/labels for small previews (e.g. a ~40-64px avatar) where they wouldn't fit. */
  compact?: boolean;
}

/**
 * Single-image field used across the admin panel wherever a piece of content
 * needs one image — category photo, hero/about/newsletter images, testimonial
 * avatars, site logo. Uploads the file to the backend (which hosts it on R2)
 * and stores the returned URL; pasting an external URL directly still works
 * as a fallback for e.g. temporary stock photos.
 */
export function ImageUploadField({
  value,
  onChange,
  folder = 'general',
  label,
  hint,
  previewClassName = 'w-full aspect-video rounded-xl',
  placeholder = 'https://...',
  compact = false,
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Image must be under 5MB');
      return;
    }
    setError('');
    setIsUploading(true);
    try {
      const url = await uploadAdminImage(file, folder);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed, please try again');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) upload(file);
  };

  const handleAddUrl = () => {
    const url = urlInput.trim();
    if (url) {
      onChange(url);
      setUrlInput('');
      setShowUrl(false);
      setError('');
    }
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div>
      {label && (
        <label className="block text-body-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
          {label}
        </label>
      )}

      {value ? (
        <div className={`relative group overflow-hidden border-2 border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 ${previewClassName}`}>
          <img src={value} alt="" className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 size={20} className="text-white animate-spin" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
          <div className={`absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${compact ? 'gap-1' : 'gap-2'}`}>
            {compact ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-1 rounded-full bg-white/90 dark:bg-surface-900/90 text-surface-700 dark:text-surface-200 hover:bg-white dark:hover:bg-surface-900 transition-colors"
              >
                <Upload size={11} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-surface-900/90 text-surface-700 dark:text-surface-200 text-caption font-medium hover:bg-white dark:hover:bg-surface-900 transition-colors"
              >
                Replace
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={isUploading}
              className={compact ? 'p-1 rounded-full bg-white/90 dark:bg-surface-900/90 text-surface-700 dark:text-surface-200 hover:bg-red-500 hover:text-white transition-colors' : 'p-1.5 rounded-lg bg-white/90 dark:bg-surface-900/90 text-surface-700 dark:text-surface-200 hover:bg-red-500 hover:text-white transition-colors'}
            >
              <X size={compact ? 11 : 14} />
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed transition-colors cursor-pointer ${previewClassName} ${isDragging ? 'border-brand-500 bg-brand-500/5' : 'border-surface-300 dark:border-surface-600 hover:border-brand-400'}`}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isUploading ? (
            <Loader2 size={compact ? 14 : 18} className="text-brand-500 animate-spin" />
          ) : compact ? (
            <Upload size={14} className="text-surface-400" />
          ) : (
            <>
              <Upload size={18} className="text-surface-400" />
              <p className="text-caption text-surface-500 text-center px-2">Drop image or <span className="text-brand-500 font-medium">browse</span></p>
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

      <div className="flex items-center gap-3 mt-1.5">
        <button type="button" onClick={() => setShowUrl(!showUrl)} className="flex items-center gap-1 text-caption text-surface-500 hover:text-brand-500 transition-colors">
          <LinkIcon size={11} /> Paste URL instead
        </button>
        {hint && <span className="text-caption text-surface-400">{hint}</span>}
      </div>

      {showUrl && (
        <div className="flex gap-2 mt-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-body-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            autoFocus
          />
          <button type="button" onClick={handleAddUrl} disabled={!urlInput.trim()} className="px-3 py-2 rounded-lg bg-brand-500 text-white text-caption font-medium disabled:opacity-40">
            Add
          </button>
        </div>
      )}

      {error && <p className="text-caption text-red-500 mt-1">{error}</p>}
    </div>
  );
}
