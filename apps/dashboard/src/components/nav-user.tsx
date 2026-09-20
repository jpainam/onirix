"use client";

import {
  BadgeCheckIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "@onirix/ui/lib/icons";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback, AvatarImage } from "@onirix/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@onirix/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@onirix/ui/components/sidebar";

import { authClient } from "@/lib/auth-client";

/** Two letters is all the 24px avatar has room for. */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function NavUser({
  organizationName,
  user,
}: {
  organizationName: string;
  user: { name: string; email: string; avatar: string };
}) {
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton className="h-10" tooltip={user.name} />}
          >
            <Avatar size="sm" shape="square">
              <AvatarImage src={user.avatar} alt="" />
              <AvatarFallback tone="solid">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="text-ink-04 flex-1 truncate text-left font-medium">
              {user.name}
            </span>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-60"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar shape="square">
                <AvatarImage src={user.avatar} alt="" />
                <AvatarFallback tone="solid">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{user.name}</span>
                <span className="text-ink-03 truncate text-xs">{user.email}</span>
              </div>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {organizationName}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => router.push("/admin/language-models")}>
                <BadgeCheckIcon />
                Workspace settings
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>
                Theme
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme ?? "system"}
                onValueChange={(value) => setTheme(String(value))}
              >
                <DropdownMenuRadioItem value="light">
                  <SunIcon />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <MoonIcon />
                  Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <MonitorIcon />
                  System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/login") },
                })
              }
            >
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
