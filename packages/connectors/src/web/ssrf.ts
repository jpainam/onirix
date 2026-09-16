/**
 * Keeps the crawler on the public internet.
 *
 * A website source is a URL typed by an admin and fetched by a server that sits
 * inside the deployment's network. Without this check, "index our docs" could
 * just as well be "read the metadata service" or "fetch the internal wiki
 * that has no login because it is internal". Every hop is checked, including
 * redirects, because a public host is free to redirect anywhere.
 *
 * DNS is resolved on every call rather than cached: mappings change, and a
 * host that resolved publicly a minute ago may not now.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ConnectorError } from "../types";

export type NetworkPolicy = {
  /**
   * Allow loopback, link-local and private ranges. For deployments whose
   * "website" genuinely is an intranet, and off by default.
   */
  allowPrivateNetworks: boolean;
};

export async function assertAllowedUrl(raw: string, policy: NetworkPolicy): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConnectorError("config", `"${raw}" is not a valid web address.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConnectorError("config", "Only http and https addresses can be read.");
  }
  if (!url.hostname) {
    throw new ConnectorError("config", "The address has no host name.");
  }
  if (policy.allowPrivateNetworks) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new ConnectorError("config", `${url.hostname} is not reachable from a website source.`);
  }

  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true })
        .then((entries) => entries.map((entry) => entry.address))
        .catch(() => {
          throw new ConnectorError("unreachable", `${url.hostname} could not be resolved.`);
        });

  if (addresses.length === 0) {
    throw new ConnectorError("unreachable", `${url.hostname} could not be resolved.`);
  }

  for (const address of addresses) {
    if (!isPublicAddress(address)) {
      throw new ConnectorError(
        "config",
        `${url.hostname} points at a private network address (${address}), which a website source does not read.`,
      );
    }
  }

  return url;
}

/** True for addresses on the public internet; false for anything reserved. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicV4(address);
  if (version === 6) return isPublicV6(address);
  return false;
}

function isPublicV4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a = 0, b = 0] = parts;
  if (a === 0) return false; // this network
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 192 && b === 0 && parts[2] === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast and reserved
  return true;
}

function isPublicV6(address: string): boolean {
  const lower = address.toLowerCase();
  // IPv4 mapped or translated: judge the embedded IPv4.
  const mapped = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPublicV4(mapped[1]);
  if (lower === "::" || lower === "::1") return false;
  const firstGroup = expandFirstGroup(lower);
  if (firstGroup === null) return false;
  if ((firstGroup & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((firstGroup & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((firstGroup & 0xff00) === 0xff00) return false; // multicast
  return true;
}

function expandFirstGroup(address: string): number | null {
  const head = address.split("::")[0] ?? "";
  const group = head.split(":")[0] ?? "";
  if (group === "") return 0;
  const value = Number.parseInt(group, 16);
  return Number.isNaN(value) ? null : value;
}
