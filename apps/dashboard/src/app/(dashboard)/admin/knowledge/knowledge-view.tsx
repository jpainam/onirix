"use client";

import {
  BookOpenIcon,
  FolderPlusIcon,
  LayersIcon,
  PencilIcon,
  Trash2Icon,
} from "@onirix/ui/lib/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { Spinner } from "@onirix/ui/components/spinner";
import { Textarea } from "@onirix/ui/components/textarea";

import { MembershipPicker } from "@/components/membership-picker";
import { Notice, Page, PageHeader, Section } from "@/components/page";
import { trpc } from "@/utils/trpc";

type Collection = {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
};

type Document = {
  id: string;
  title: string;
  status: string;
  collectionId: string | null;
};

/**
 * Knowledge: the logical layer over what Onirix has indexed.
 *
 * Sources answer "where did this come from?"; this page answers "what is it
 * about?". The same Notion export can arrive through one connector and belong
 * to Engineering, so the grouping is deliberately independent of the source
 * tree and of the teams that gate access — a collection labels knowledge, it
 * never grants or withholds it.
 *
 * Each collection carries its own document list rather than linking away to
 * one: a collection nobody ever filed anything into looks identical to a full
 * one in a list of names, and that is the mistake this page exists to make
 * visible.
 */
export function KnowledgeView({
  canCreate,
  canUpdate,
  canDelete,
}: {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);

  const collections = useQuery(trpc.knowledge.listCollections.queryOptions());
  // Every document the caller may see, so a collection can show its own members
  // and offer the rest as candidates without a request per collection.
  const documents = useQuery({
    ...trpc.knowledge.listDocuments.queryOptions({ limit: 100 }),
    enabled: canUpdate || (collections.data?.length ?? 0) > 0,
  });

  const assign = useMutation(
    trpc.knowledge.setDocumentCollection.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries(),
      onError: (error) => toast.error(error.message),
    }),
  );

  const remove = useMutation(
    trpc.knowledge.deleteCollection.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.released > 0
            ? `Collection deleted. ${result.released} document(s) are now unfiled.`
            : "Collection deleted.",
        );
        setDeleting(null);
        void queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const rows = (documents.data ?? []) as Document[];
  const unfiled = rows.filter((row) => row.collectionId === null);

  return (
    <Page wide>
      <PageHeader
        title="Knowledge"
        description="Collections are how indexed documents are grouped by subject, such as Engineering or HR, whatever source they arrived from."
        action={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <FolderPlusIcon />
              New collection
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        <Notice
          icon={LayersIcon}
          title="A collection groups knowledge, it does not restrict it"
          description="Who can read a document is decided by its visibility on the Sources page. Filing it here changes what it is about, never who can reach it."
        />

        <Section
          title="Collections"
          description="A document belongs to one collection at a time, so filing it in a second moves it out of the first."
        >
          {collections.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : collections.data?.length === 0 ? (
            <Empty variant="outline">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookOpenIcon />
                </EmptyMedia>
                <EmptyTitle>No collections yet</EmptyTitle>
                <EmptyDescription>
                  {canCreate
                    ? "Create one for a subject your workspace asks about, then file documents into it."
                    : "An administrator has not grouped this workspace's knowledge yet."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {collections.data?.map((row) => (
                <CollectionCard
                  key={row.id}
                  collection={row}
                  members={rows.filter((doc) => doc.collectionId === row.id)}
                  candidates={unfiled}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                  onEdit={() => setEditing(row)}
                  onDelete={() => setDeleting(row)}
                  onAdd={(documentId) =>
                    assign.mutate({ documentId, collectionId: row.id })
                  }
                  onRemove={(documentId) =>
                    assign.mutate({ documentId, collectionId: null })
                  }
                />
              ))}
            </div>
          )}
        </Section>

        {(collections.data?.length ?? 0) > 0 && unfiled.length > 0 ? (
          <Section
            title="Not in a collection"
            description="These documents are still searchable. They are just not grouped under a subject yet."
          >
            <div className="bg-card flex flex-wrap gap-1.5 rounded-xl border px-4 py-3.5">
              {unfiled.slice(0, 40).map((doc) => (
                <Badge key={doc.id} variant="outline">
                  {doc.title}
                </Badge>
              ))}
              {unfiled.length > 40 ? (
                <span className="text-ink-03 px-2 py-0.5 text-xs">
                  and {unfiled.length - 40} more
                </span>
              ) : null}
            </div>
          </Section>
        ) : null}
      </div>

      {creating ? (
        <CollectionDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void queryClient.invalidateQueries();
          }}
        />
      ) : null}

      {editing ? (
        <CollectionDialog
          mode="edit"
          collection={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries();
          }}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The documents in it are kept and stay searchable. They simply stop
              being grouped under this subject.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                deleting && remove.mutate({ collectionId: deleting.id })
              }
            >
              {remove.isPending ? <Spinner /> : null}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

/**
 * One collection: what it is for, what is in it, and the picker that files a
 * document into it.
 *
 * The picker only offers documents that are in no collection yet. Moving a
 * document between two collections from inside one of them would silently empty
 * the other, and the person clicking cannot see that other collection from
 * here — so a move is two deliberate steps, out and then in.
 */
function CollectionCard({
  collection,
  members,
  candidates,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
  onAdd,
  onRemove,
}: {
  collection: Collection;
  members: Document[];
  candidates: Document[];
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAdd: (documentId: string) => void;
  onRemove: (documentId: string) => void;
}) {
  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="text-ink-04 flex size-5 shrink-0 items-center justify-center">
          <BookOpenIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">
            {collection.name}
          </span>
          <span className="text-ink-03 truncate text-xs leading-4">
            {collection.documentCount}{" "}
            {collection.documentCount === 1 ? "document" : "documents"}
            {collection.description ? ` · ${collection.description}` : ""}
          </span>
        </div>
        {canUpdate ? (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <PencilIcon />
            Edit
          </Button>
        ) : null}
        {canDelete ? (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2Icon className="text-destructive" />
            Delete
          </Button>
        ) : null}
      </div>

      <div className="pl-8">
        <MembershipPicker
          selected={members.map((doc) => ({ id: doc.id, label: doc.title }))}
          options={[...members, ...candidates].map((doc) => ({
            id: doc.id,
            label: doc.title,
          }))}
          editable={canUpdate}
          addLabel="Add document"
          emptyLabel="No documents yet"
          searchPlaceholder="Search documents"
          notFoundLabel="Nothing unfiled by that name."
          removeLabel={(option) =>
            `Remove ${option.label} from ${collection.name}`
          }
          onAdd={(option) => onAdd(option.id)}
          onRemove={(option) => onRemove(option.id)}
        />
        {collection.documentCount > members.length ? (
          // The page fetches one bounded list of documents for every card, so a
          // large collection can hold more than it can show. Say so rather than
          // letting the chips silently contradict the count above them.
          <p className="text-ink-03 mt-1.5 text-xs">
            Showing {members.length} of {collection.documentCount}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Create and rename share a dialog: the fields and the rules are the same. */
function CollectionDialog({
  mode,
  collection,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  collection?: Collection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");

  const create = useMutation(
    trpc.knowledge.createCollection.mutationOptions({
      onSuccess: () => {
        toast.success(`Created ${name.trim()}.`);
        onSaved();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const update = useMutation(
    trpc.knowledge.updateCollection.mutationOptions({
      onSuccess: () => {
        toast.success("Collection updated.");
        onSaved();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const saving = create.isPending || update.isPending;

  function submit() {
    if (mode === "edit" && collection) {
      update.mutate({ collectionId: collection.id, name, description });
      return;
    }
    create.mutate({ name, description });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New collection" : `Edit ${collection?.name}`}
          </DialogTitle>
          <DialogDescription>
            Name it after a subject people ask about, not after the system the
            documents came from.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              value={name}
              placeholder="Engineering"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="collection-description">Description</Label>
            <Textarea
              id="collection-description"
              value={description}
              placeholder="Architecture documents, technical specifications, and engineering decisions."
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || saving}>
            {saving ? <Spinner /> : null}
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
