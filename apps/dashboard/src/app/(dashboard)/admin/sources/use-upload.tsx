"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Adding files by hand: the hidden input, the button's busy state, and the
 * request. Shared by Documents, where uploads live, and by Sources, whose
 * "Add source" dialog offers a file as one kind of source.
 */
export function useUpload() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const file of files) formData.append("files", file);

    setUploading(true);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "Upload failed.");
        return;
      }
      if (result.accepted.length > 0) {
        toast.success(`Uploaded ${result.accepted.length} file(s). Onirix is indexing them now.`);
      }
      // Surface per-file rejections; a silent drop looks like data loss.
      for (const rejected of result.rejected ?? []) {
        toast.error(`${rejected.name}: ${rejected.reason}`);
      }
      void queryClient.invalidateQueries();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return {
    uploading,
    /** Opens the file picker. */
    pick: () => fileInput.current?.click(),
    /** Render once, anywhere on the page. */
    input: (
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => void upload(event.target.files)}
      />
    ),
  };
}
