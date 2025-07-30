"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { FileText, Landmark } from "lucide-react";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Receipt,
  Users,
  Calendar ,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  ChevronsUpDown,
  ChevronsUpDownIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppSidebar() {
  const pathname = usePathname();
  const { organization, userRole } = useOrgStore();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isAdmin = userRole === "owner" || userRole === "admin";

 const { profile, user, refreshProfile, logout } = useAuthStore();
  
  // Get email from multiple possible sources
  const userEmail = profile?.email || user?.email || user?.user_metadata?.email || "";
  const userName = profile?.full_name || userEmail.split('@')[0] || "?";

   useEffect(() => {
     if (user && !profile) {
       refreshProfile();
     }
   }, [user, profile, refreshProfile]);

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

  const baseRoutes = [
    {
      title: "Dashboard",
      href: `/org/${organization?.slug}`,
      icon: LayoutDashboard,
    },
    {
      title: "Expenses",
      href: `/org/${organization?.slug}/expenses`,
      icon: Receipt,
    },
    { title: "Team", href: `/org/${organization?.slug}/team`, icon: Users },
    {
      title: "Policies",
      href: `/org/${organization?.slug}/policies`,
      icon: FileText,
    },
    {
      title: "Expense Events",
      href: `/org/${organization?.slug}/expense-events`,
      icon: Calendar,
    },
    ...(isAdmin
      ? [
          {
            title: "Finance Management",
            href: `/org/${organization?.slug}/finance`,
            icon: Landmark,
          },
          {
            title: "Bank Details",
            href: `/org/${organization?.slug}/bank-details`,
            icon: Receipt,
          },
        ]
      : []),
  ];

  const adminRoutes = {
    title: "Settings",
    href: `/org/${organization?.slug}/settings`,
    icon: Settings,
  };

  const sidebarItems = isAdmin ? [...baseRoutes, adminRoutes] : baseRoutes;

  function SidebarContent() {
    return (
      <div className="flex h-full flex-col">
        {/* Org name / logo */}
        <div className="flex h-14 items-center border-b px-4">
          <Link
            href={`/org/${organization?.slug}`}
            className="flex items-center gap-2 font-semibold"
          >
            <span className="text-lg">{organization?.name}</span>
          </Link>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium">
            {sidebarItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground transition-all",
                    isActive && "bg-accent text-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-2 pb-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer group flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent">
              <Avatar className="h-9 w-9">
                {/* {user ? (
                  <AvatarImage src={user?.avatar_url} alt={user.email ?? ""} />
                ) : ( */}
                <AvatarFallback className="bg-black text-white">
                  {profile?.full_name?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
                {/* )} */}
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {userEmail}
                </p>
              </div>
              <ChevronsUpDownIcon className="h-3 w-3 " aria-hidden />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={`/org/${organization?.slug}/profile`}>Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile */}
      <div className="lg:hidden">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop */}
      <div className="hidden border-r bg-muted/40 lg:block lg:w-64">
        <SidebarContent />
      </div>
    </>
  );
}
