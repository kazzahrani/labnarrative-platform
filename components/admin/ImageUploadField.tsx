"use client";

import { createClient } from "@supabase/supabase-js";
import { ChangeEvent, useMemo, useRef, useState } from "react";

const BUCKET = "labnarrative-images";
const MAX_IMAGE_SIZE_MB = 25;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

function safeSegment(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "draft";
}

function fileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[file.type] || "jpg";
}

function objectPathFromPublicUrl(value: string) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = value.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(value.slice(index + marker.length));
}

export default function ImageUploadField({
  label,
  value,
  onChange,
  siteSlug,
  folder,
  alt,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  siteSlug: string;
  folder: string;
  alt: string;
  helper?: string;
}) {
  const supabase = useMemo(
    () => createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    ),
    [],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setNotice("Choose a JPG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setNotice(`The image must be smaller than ${MAX_IMAGE_SIZE_MB} MB.`);
      return;
    }

    setUploading(true);
    setNotice("");
    const path = `${safeSegment(siteSlug)}/${safeSegment(folder)}/${Date.now()}-${crypto.randomUUID()}.${fileExtension(file)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      setNotice(error.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    onChange(data.publicUrl);
    setNotice("Image uploaded. Save the website to keep this change.");
    setUploading(false);
  }

  async function remove() {
    const path = objectPathFromPublicUrl(value);
    setUploading(true);
    setNotice("");
    if (path) {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) {
        setNotice(`The field was cleared, but the stored file could not be deleted: ${error.message}`);
      }
    }
    onChange("");
    setUploading(false);
  }

  return (
    <div className="advanced-image-field">
      <div className="advanced-image-heading">
        <div>
          <strong>{label}</strong>
          {helper && <small>{helper}</small>}
        </div>
        <div className="advanced-image-actions">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Working…" : value ? "Replace" : "Upload"}
          </button>
          {value && <button type="button" className="danger" onClick={() => void remove()} disabled={uploading}>Remove</button>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={upload} />
      <label className="admin-field">
        <span>Image URL</span>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Upload an image up to ${MAX_IMAGE_SIZE_MB} MB or paste an image URL`} />
      </label>
      {value && (
        <div className="advanced-image-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={alt || label} />
        </div>
      )}
      {notice && <p className="advanced-image-notice" role="status">{notice}</p>}
    </div>
  );
}
