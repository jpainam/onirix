"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useFolderPicker } from "@onirix/ui/components/folder-picker";

import { uploadFiles } from "@/lib/upload-files";

/**
 * Adding files by hand: the hidden input, the button's busy state, and the
 * request. Shared by Documents, where uploads live, and by Sources, whose
 * "Add source" dialog offers a file as one kind of source.
 */
export function useUpload() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const result = await uploadFiles([...files]);
      if (result.accepted.length > 0) {
        toast.success(`Uploaded ${result.accepted.length} file(s). Onirix is indexing them now.`);
      }
      // Surface per-file rejections; a silent drop looks like data loss.
      for (const rejected of result.rejected) {
        toast.error(`${rejected.name}: ${rejected.reason}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      // Also after a failure: a folder goes up in batches, and the ones before
      // the failure are in the workspace.
      void queryClient.invalidateQueries();
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  // A folder is reviewed before it goes anywhere; see `useFolderPicker`.
  const folder = useFolderPicker({ onConfirm: (picked) => void upload(picked) });

  return {
    uploading,
    /** Opens the file picker. */
    pick: () => fileInput.current?.click(),
    /** Opens the folder picker, which lists the folder before uploading it. */
    pickFolder: folder.pick,
    /** Render once, anywhere on the page. */
    input: (
      <>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(event) => void upload(event.target.files)}
        />
        {folder.element}
      </>
    ),
  };
}
