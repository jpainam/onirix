"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon } from "@onirix/ui/lib/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { browseOpenModels } from "@onirix/llm/open-models";
import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { type BrowserModel, ModelBrowser } from "@onirix/ui/components/model-browser";
import { Spinner } from "@onirix/ui/components/spinner";

import { PageHeader } from "@/components/page";
import { cancelDownload, download, useModelDownloads } from "@/hooks/use-model-downloads";
import { trpc } from "@/utils/trpc";

const CATALOG: BrowserModel[] = browseOpenModels();

/**
 * Open models, browsed on the left and downloaded from the right.
 *
 * A download does not land on the admin's computer. It lands on the machine
 * that runs the workspace's Ollama, and it is the server that asks for it, so
 * this works from any browser. What it does need is a self-hosted Ollama to
 * download into: without one the page still browses, a notice across the top
 * says what is missing, and the Download buttons wait disabled.
 */
export function OpenModelsView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const library = useQuery(trpc.models.library.queryOptions());
  const downloads = useModelDownloads();

  const setEnabled = useMutation(
    trpc.models.setEnabled.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries(),
      onError: (error) => toast.error(error.message),
    }),
  );
  const remove = useMutation(
    trpc.models.removeDownloaded.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries(),
      onError: (error) => toast.error(error.message),
    }),
  );

  const data = library.data;
  const installed = new Map((data?.installed ?? []).map((model) => [model.name, model.sizeBytes]));
  const enabled = new Set(data?.enabled ?? []);

  async function start(model: BrowserModel) {
    if (!(await download(model.id))) return;
    await queryClient.invalidateQueries();
    // Downloading a model is asking for it; enable it rather than ask twice.
    setEnabled.mutate(
      { model: model.id, enabled: true },
      { onSuccess: () => toast.success(`${model.label} is ready to use.`) },
    );
  }

  let blocked: { message: ReactNode; action?: ReactNode } | null = null;
  if (data?.state === "none") {
    blocked = {
      message:
        "Models download onto the machine that runs Ollama for this workspace. Connect a self-hosted Ollama first.",
      action: canManage ? (
        <Button nativeButton={false} render={<Link href="/admin/language-models" />}>
          Connect Ollama
        </Button>
      ) : null,
    };
  } else if (data?.state === "cloud") {
    blocked = {
      message:
        "This workspace uses Ollama Cloud, which serves these models without a download. To run them on your own hardware, point Ollama at a self-hosted address.",
    };
  } else if (data?.state === "unreachable") {
    blocked = {
      message: `Onirix could not reach Ollama at ${data.baseUrl}. Check that it is running.`,
      action: (
        <Button
          variant="outline"
          disabled={library.isFetching}
          onClick={() => void library.refetch()}
        >
          {library.isFetching ? <Spinner /> : null}
          Try again
        </Button>
      ),
    };
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-8 pt-10">
        <PageHeader
          icon={DownloadIcon}
          title="Open Models"
          description="Open source models, downloaded to your own Ollama and run there."
          divider={false}
        />
      </div>

      {library.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="min-h-0 flex-1 border-t">
          <ModelBrowser
            models={CATALOG}
            destination="Downloads to your Ollama server"
            blocked={blocked}
            readOnly={!canManage}
            error={downloads.error}
            stateOf={(id) => ({
              installedBytes: installed.get(id) ?? null,
              progress: downloads.progress[id] ?? null,
            })}
            onDownload={(id) => {
              const model = CATALOG.find((entry) => entry.id === id);
              if (model) void start(model);
            }}
            onCancel={cancelDownload}
            onRemove={(id) => remove.mutate({ model: id })}
            removeBlocked={(id) =>
              enabled.has(id) ? "Disable this model before removing it." : null
            }
            rowBadge={(id) =>
              data?.defaultModel === id ? (
                <Badge variant="muted">Default</Badge>
              ) : enabled.has(id) && installed.has(id) ? (
                <Badge variant="success">Enabled</Badge>
              ) : null
            }
            installedActions={(model) =>
              canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={setEnabled.isPending}
                  onClick={() =>
                    setEnabled.mutate({ model: model.id, enabled: !enabled.has(model.id) })
                  }
                >
                  {enabled.has(model.id) ? "Disable" : "Enable for workspace"}
                </Button>
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
}
