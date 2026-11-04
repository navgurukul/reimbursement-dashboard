"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  ChevronsUpDown,
  CreditCard,
  FileText,
  IndianRupee,
  Landmark,
  LogOut,
  MapPin,
  Menu,
  Settings,
  Tags,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import supabase from "@/lib/supabase";
import { organizations } from "@/lib/db";
import { PUNE_SOSC_ALLOWED_EMAILS } from "@/lib/features";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type NavItem = { title: string; href: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

interface SidebarBodyProps {
  orgName?: string;
  homeHref: string;
  groups: NavGroup[];
  pathname: string;
  userName: string;
  userEmail: string;
  userInitial: string;
  profileHref: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}

const isRouteActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

function OrgMark({ name }: { name?: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
    >
      {name?.trim()?.[0]?.toUpperCase() ?? "R"}
    </span>
  );
}

function SidebarBody({
  orgName,
  homeHref,
  groups,
  pathname,
  userName,
  userEmail,
  userInitial,
  profileHref,
  onNavigate,
  onSignOut,
}: SidebarBodyProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Org name */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <Link
          href={homeHref}
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-md font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <OrgMark name={orgName} />
          <span className="truncate text-sm" title={orgName}>
            {orgName || "Reimbursements"}
          </span>
        </Link>
      </div>

      {/* Nav links */}
      <nav
        aria-label="Main navigation"
        className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
      >
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = isRouteActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active &&
                      "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs ring-1 ring-sidebar-border"
                  )}
                >
                  <item.icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User menu */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="group flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-sidebar-accent">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-sm font-medium text-primary-foreground">
                {userInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">
                {userName}
              </p>
              <p
                className="truncate text-xs leading-tight text-muted-foreground"
                title={userEmail}
              >
                {userEmail}
              </p>
            </div>
            <ChevronsUpDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" side="top" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {userEmail}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href={profileHref} onClick={onNavigate}>
                <UserRound className="size-4" aria-hidden />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSignOut} className="cursor-pointer">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname() ?? "";
  const { organization, userRole, setUserRole } = useOrgStore();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showRemovedModal, setShowRemovedModal] = useState(false);
  const isAdmin = userRole === "owner" || userRole === "admin";

  const { profile, user, refreshProfile, logout } = useAuthStore();

  // Get email from multiple possible sources
  const userEmail = profile?.email || user?.email || user?.user_metadata?.email || "";
  const userName = profile?.full_name || userEmail.split('@')[0] || "?";
  const userInitial = (profile?.full_name || userEmail || "?")[0]?.toUpperCase() ?? "?";

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data, error } = await supabase.auth.getUser();

      if (!data?.user || error) {
        setShowRemovedModal(true);
        await logout();

        clearInterval(interval);
        setTimeout(() => {
          router.replace("/auth/signin");
        }, 5000);
      }
    }, 60000); // every 1 min

    return () => clearInterval(interval);
  }, [logout, router]);

  useEffect(() => {
    if (user && !profile) {
      refreshProfile();
    }
  }, [user, profile, refreshProfile]);

  // if this user's membership is deleted or added to removed_users, show removal modal only for them
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`member-removal-${user.id}`)
      // Listen for deletion from organization_users for this user
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'organization_users',
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          setShowRemovedModal(true);
          try {
            await logout();
          } catch (_) { }
          setTimeout(() => {
            router.replace('/auth/signin');
          }, 5000);
        }
      )
      // Also listen for backup insert into removed_users for this user
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'removed_users',
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          setShowRemovedModal(true);
          try {
            await logout();
          } catch (_) { }
          setTimeout(() => {
            router.replace('/auth/signin');
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (_) { }
    };
  }, [user?.id, logout, router]);

  // Refresh role from DB so newly assigned Admins get access without re-login
  useEffect(() => {
    const ensureLatestRole = async () => {
      try {
        if (!organization?.id || !user?.id) return;
        const { data, error } = await organizations.getUserRole(
          organization.id as unknown as string,
          user.id
        );
        if (!error && data?.role) {
          setUserRole(data.role as any);
        }
      } catch (_) { }
    };
    ensureLatestRole();
  }, [organization?.id, user?.id, setUserRole]);

  const handleSignOut = async () => {
    try {
      const loading = toast.loading("Signing you out...");
      await logout();
      toast.dismiss(loading);
      toast.success("Signed out successfully");
      router.push("/");
    } catch (err: any) {
      toast.error("Error signing out", { description: err.message });
    }
  };

  const base = `/org/${organization?.slug}`;

  const groups: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { title: "Expenses", href: `${base}/expenses`, icon: IndianRupee },
        { title: "Expense Events", href: `${base}/expense-events`, icon: Calendar },
        { title: "Policies", href: `${base}/policies`, icon: FileText },
        { title: "Team", href: `${base}/team`, icon: Users },
        { title: "Approver Info", href: `${base}/approver-info`, icon: UserCheck },
        { title: "Abbreviations", href: `${base}/abbreviations`, icon: Tags },
        // Show CP Pune-SoSC ONLY to allowed users based on email
        ...(PUNE_SOSC_ALLOWED_EMAILS.includes(userEmail)
          ? [{ title: "Pune SOSC Dashboard", href: `${base}/pune-sosc`, icon: MapPin }]
          : []),
      ],
    },
    ...(isAdmin
      ? [
          {
            label: "Finance",
            items: [
              { title: "Finance Management", href: `${base}/finance`, icon: Landmark },
              { title: "Advance Payment", href: `${base}/advance-payment`, icon: Wallet },
              { title: "Bank Details", href: `${base}/bank-details`, icon: CreditCard },
            ],
          },
          {
            label: "Administration",
            items: [{ title: "Settings", href: `${base}/settings`, icon: Settings }],
          },
        ]
      : []),
  ];

  const bodyProps: SidebarBodyProps = {
    orgName: organization?.name,
    homeHref: `${base}/expenses`,
    groups,
    pathname,
    userName,
    userEmail,
    userInitial,
    profileHref: `${base}/profile`,
    onSignOut: handleSignOut,
  };

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Mobile and tablet: top bar with a drawer */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <Link
          href={bodyProps.homeHref}
          className="flex min-w-0 items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <OrgMark name={organization?.name} />
          <span className="truncate text-sm">
            {organization?.name || "Reimbursements"}
          </span>
        </Link>
      </header>

      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent
          side="left"
          className="w-[18rem] max-w-[85vw] gap-0 p-0 lg:hidden"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Pages in this organisation
          </SheetDescription>
          <SidebarBody
            {...bodyProps}
            onNavigate={() => setIsMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        <SidebarBody {...bodyProps} />
      </aside>

      {/* Removal Msg Modal */}
      <Dialog open={showRemovedModal} onOpenChange={setShowRemovedModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You have been removed</DialogTitle>
            <DialogDescription>
              You have been removed from the dashboard. Redirecting to sign-in…
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
