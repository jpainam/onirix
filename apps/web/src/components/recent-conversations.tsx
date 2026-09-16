"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@onirix/ui/components/alert-dialog";
import { Button } from "@onirix/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@onirix/ui/components/dropdown-menu";
import { Input } from "@onirix/ui/components/input";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@onirix/ui/components/sidebar";
import { Spinner } from "@onirix/ui/components/spinner";

import { trpc } from "@/utils/trpc";

type Conversation = { id: string; title: string };

const SKELETON_WIDTHS = ["84%", "62%", "73%"];

/**
 * Past conversations, newest first.
 *
 * Lives apart from the sidebar shell because each row carries its own menu and
 * two dialogs' worth of state, none of which the rest of the navigation needs.
 */
export function RecentConversations({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isMobile } = useSidebar();

  // One dialog serves the whole list: only one row can be acted on at a time,
  // and mounting a pair per conversation would scale with history.
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const recents = useQuery({
    ...trpc.chat.list.queryOptions({ limit: 30 }),
    enabled,
  });
  const conversations = recents.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.chat.list.queryFilter());

  const rename = useMutation(
    trpc.chat.rename.mutationOptions({
      onSuccess: () => {
        setRenaming(null);
        void invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const remove = useMutation(
    trpc.chat.delete.mutationOptions({
      onSuccess: (_result, variables) => {
        // Deleting the conversation on screen would otherwise leave the reader
        // looking at something that no longer exists.
        if (pathname === `/chat/${variables.chatId}`) router.push("/chat");
        setDeleting(null);
        void invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function openRename(conversation: Conversation) {
    setDraftTitle(conversation.title);
    setRenaming(conversation);
  }

  function submitRename() {
    const title = draftTitle.trim();
    if (!renaming || !title || title === renaming.title) {
      setRenaming(null);
      return;
    }
    rename.mutate({ chatId: renaming.id, title });
  }

  if (enabled && recents.isPending) {
    return (
      <SidebarMenu>
        {/* Fixed widths, not random ones: this list is server-rendered before
            the query has run, and a width drawn per render would not survive
            hydration. Uneven values stand in for titles of differing length. */}
        {SKELETON_WIDTHS.map((width) => (
          <SidebarMenuItem key={width}>
            <SidebarMenuSkeleton width={width} />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="text-ink-02 px-2 py-1.5 text-sm leading-snug">
        Try sending a message! Your chat history will appear here.
      </p>
    );
  }

  return (
    <>
      <SidebarMenu>
        {conversations.map((conversation) => (
          <SidebarMenuItem key={conversation.id}>
            <SidebarMenuButton
              isActive={pathname === `/chat/${conversation.id}`}
              tooltip={conversation.title}
              render={
                <Link href={`/chat/${conversation.id}`}>
                  {/* Titles are whole first questions, so they are clipped
                      rather than allowed to wrap the rail. */}
                  <span className="truncate">{conversation.title}</span>
                </Link>
              }
            />

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuAction
                    showOnHover
                    aria-label={`Actions for ${conversation.title}`}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>

              <DropdownMenuContent
                className="w-44"
                side={isMobile ? "bottom" : "right"}
                align="start"
              >
                <DropdownMenuItem onClick={() => openRename(conversation)}>
                  <PencilIcon />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleting(conversation)}
                >
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
          </DialogHeader>

          <Input
            value={draftTitle}
            autoFocus
            maxLength={200}
            aria-label="Conversation title"
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitRename();
              }
            }}
          />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={rename.isPending || draftTitle.trim().length === 0}
              onClick={submitRename}
            >
              {rename.isPending ? <Spinner /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* Documents are the expensive thing in the workspace, so the
                  dialog says plainly that they are not what is going away. */}
              “{deleting?.title}” and its answers will be removed. The documents
              they cited are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate({ chatId: deleting.id })}
            >
              {remove.isPending ? <Spinner /> : null}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
