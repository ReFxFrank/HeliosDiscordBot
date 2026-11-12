'use client';

import { useRef, useState } from 'react';
import { ImageUp, Loader2, X } from 'lucide-react';
import { formatBytes, MEDIA_ACCEPT, MEDIA_MAX_BYTES } from '@refx/shared';
import { inputClass } from './form';

/**
 * An image field that takes either a link or an upload. Uploading stores the
 * file on the dashboard and fills in its address, so the rest of the form only
 * ever deals with a URL.
 */
export function ImageUrlField({
  guildId,
  value,
  onChange,
  placeholder = 'Paste an image link, or upload one',
  className = inputClass,
  previewClassName = 'h-14 max-w-48',
}: {
  guildId: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  className?: string;
  previewClassName?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  async function upload(file: File): Promise<void> {
    setError(null);
    if (file.size > MEDIA_MAX_BYTES) {
      setError(
        `That image is ${formatBytes(file.size)}. The limit is ${formatBytes(MEDIA_MAX_BYTES)}.`,
      );
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/servers/${guildId}/media`, { method: 'POST', body });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.ok || !result.url) {
        setError(result?.error ?? `The upload failed (${response.status}). Try again.`);
        return;
      }
      setBroken(false);
      onChange(result.url);
    } catch {
      setError("Couldn't reach the dashboard. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const shown = value.trim();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          className={`${className} min-w-0 flex-1 font-mono`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setBroken(false);
            setError(null);
            onChange(e.target.value);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs font-medium text-white/75 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          title="Upload an image from your device"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageUp className="h-3.5 w-3.5" />
          )}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        {shown && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onChange('');
            }}
            className="grid w-8 shrink-0 place-items-center rounded-md border border-white/10 text-white/50 hover:text-[var(--color-danger)]"
            title="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={MEDIA_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {shown && /^https?:\/\//i.test(shown) && !broken && (
        <img
          src={shown}
          alt=""
          onError={() => setBroken(true)}
          className={`${previewClassName} w-fit rounded-md border border-white/10 object-cover`}
        />
      )}
      {broken && (
        <span className="text-xs text-[var(--color-danger)]">
          That link doesn&apos;t load as an image. Check it, or upload the file instead.
        </span>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
