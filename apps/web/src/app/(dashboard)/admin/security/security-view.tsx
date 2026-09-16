"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LaptopIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@onirix/ui/components/table";

import { Row, Section } from "@/components/page";
import { trpc } from "@/utils/trpc";

/**
 * Live sessions: the caller's own devices, and — for anyone who may administer
 * members — every session held by someone in the workspace.
 *
 * Revoking is immediate and silent for the person on the other end: their next
 * request finds no session and lands on the login page. That is the point, and
 * it is why the workspace list is gated rather than shown to everyone.
 */
export function SessionsView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();

  const mine = useQuery(trpc.security.mySessions.queryOptions());
  const workspace = useQuery({
    ...trpc.security.workspaceSessions.queryOptions(),
    enabled: canManage,
  });

  // Both lists show the same rows from different angles, so a revoke refreshes
  // whichever of them is on screen.
  const invalidate = () => void queryClient.invalidateQueries();

  const revoke = useMutation(
    trpc.security.revoke.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Session signed out.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const revokeOthers = useMutation(
    trpc.security.revokeMyOtherSessions.mutationOptions({
      onSuccess: (result) => {
        invalidate();
        toast.success(
          result.revoked === 1
            ? "Signed out of 1 other device."
            : `Signed out of ${result.revoked} other devices.`,
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const myOthers = (mine.data ?? []).filter((row) => !row.current);

  return (
    <>
      <Section
        title="Your devices"
        description="Everywhere your account is currently signed in."
        action={
          myOthers.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={revokeOthers.isPending}
              onClick={() => revokeOthers.mutate()}
            >
              {revokeOthers.isPending ? <Spinner /> : null}
              Sign out other devices
            </Button>
          ) : null
        }
      >
        {mine.isPending ? (
          <Pending />
        ) : (
          <div className="flex flex-col gap-2">
            {mine.data?.map((row) => {
              const device = describeDevice(row.userAgent);
              return (
                <Row
                  key={row.id}
                  icon={<device.icon />}
                  title={device.label}
                  description={`${formatOrigin(row.ipAddress)} · last used ${formatWhen(row.updatedAt)} · expires ${formatWhen(row.expiresAt)}`}
                  action={
                    row.current ? (
                      <Badge variant="info">This device</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate({ sessionId: row.id })}
                      >
                        Sign out
                      </Button>
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </Section>

      {canManage ? (
        <Section
          title="Workspace sessions"
          description="Every member signed in right now. Signing a session out ends it immediately."
        >
          {workspace.isPending ? (
            <Pending />
          ) : (
            <div className="bg-card overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead className="w-40">Signed in from</TableHead>
                    <TableHead className="w-44">Last used</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.data?.map((row) => {
                    const device = describeDevice(row.userAgent);
                    // The owner's sessions are the server's to refuse, and a
                    // button that always errors is worse than no button.
                    const revocable =
                      !row.current && (row.mine || !holdsRole(row.role, "owner"));
                    return (
                      <TableRow key={row.id}>
                        <TableCell variant="strong">
                          {row.name}
                          <p className="text-ink-03 text-xs font-normal">{row.email}</p>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <device.icon className="text-ink-04 size-4" />
                            {device.label}
                          </span>
                        </TableCell>
                        <TableCell>{formatOrigin(row.ipAddress)}</TableCell>
                        <TableCell>{formatWhen(row.updatedAt)}</TableCell>
                        <TableCell className="text-right">
                          {row.current ? (
                            <Badge variant="info">This device</Badge>
                          ) : revocable ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={revoke.isPending}
                              onClick={() => revoke.mutate({ sessionId: row.id })}
                            >
                              Sign out
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      ) : null}
    </>
  );
}

function Pending() {
  return (
    <div className="flex justify-center py-8">
      <Spinner />
    </div>
  );
}

/** A member may hold several roles in one comma separated column. */
function holdsRole(role: string, name: string): boolean {
  return role.split(",").some((part) => part.trim() === name);
}

/**
 * Turns a user agent into something a person recognizes as their own device.
 *
 * Deliberately shallow: the string is self-reported and only has to be good
 * enough to answer "is that laptop mine?". Anything it cannot place is shown
 * as an unknown device rather than guessed at, since a wrong label here is what
 * makes someone leave a stranger's session running.
 */
function describeDevice(userAgent: string | null): { label: string; icon: LucideIcon } {
  if (!userAgent) return { label: "Unknown device", icon: MonitorIcon };

  const agent = userAgent.toLowerCase();

  // Order matters: Chrome's agent names Safari, Edge's names both, and every
  // mobile browser on iOS names Safari.
  const browser = agent.includes("edg/")
    ? "Edge"
    : agent.includes("opr/") || agent.includes("opera")
      ? "Opera"
      : agent.includes("firefox")
        ? "Firefox"
        : agent.includes("chrome") || agent.includes("crios")
          ? "Chrome"
          : agent.includes("safari")
            ? "Safari"
            : null;

  const platform = agent.includes("iphone")
    ? "iPhone"
    : agent.includes("ipad")
      ? "iPad"
      : agent.includes("android")
        ? "Android"
        : agent.includes("mac os") || agent.includes("macintosh")
          ? "macOS"
          : agent.includes("windows")
            ? "Windows"
            : agent.includes("linux")
              ? "Linux"
              : null;

  const icon =
    platform === "iPhone" || platform === "Android"
      ? SmartphoneIcon
      : platform === "iPad"
        ? TabletIcon
        : platform === "macOS" || platform === "Windows" || platform === "Linux"
          ? LaptopIcon
          : MonitorIcon;

  // The native app reports its own agent rather than a browser's.
  if (agent.includes("onirix") || agent.includes("expo")) {
    return { label: platform ? `Onirix app on ${platform}` : "Onirix app", icon };
  }

  if (browser && platform) return { label: `${browser} on ${platform}`, icon };
  return { label: browser ?? platform ?? "Unknown device", icon };
}

/**
 * Where a session is being used from.
 *
 * The address is shown raw. Resolving it to a city would need a geolocation
 * service this deployment does not have, and a made-up location is worse than
 * an address an admin can look up themselves.
 */
function formatOrigin(ipAddress: string | null): string {
  if (!ipAddress) return "Unknown address";
  // All-zero and loopback addresses are what the app records when it is reached
  // from the same machine, or through a proxy that does not forward the client
  // address. They arrive in several spellings — `::1`, `127.0.0.1`, and the
  // fully expanded `0000:0000:...` — none of which mean anything to a reader.
  if (/^[0:.]+$/.test(ipAddress)) return "Local";
  return ipAddress;
}

function formatWhen(value: Date | string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
