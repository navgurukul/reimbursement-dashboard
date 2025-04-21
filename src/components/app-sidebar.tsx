"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useOrgStore } from "@/store/useOrgStore";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Receipt,
  Users,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function AppSidebar() {
  const pathname = usePathname();
  const { organization } = useOrgStore();
  const { logout } = useAuthStore();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      const loadingToast = toast.loading("Signing you out...");
      await logout();
      toast.dismiss(loadingToast);
      toast.success("Signed out successfully", {
        description: "You have been signed out of your account.",
      });
      router.push("/");
    } catch (error: any) {
      console.error("Error signing out:", error.message);
      toast.error("Error signing out", {
        description: "Please try again.",
      });
    }
  };

  const sidebarItems = [
    {
      title: "Dashboard",
      href: `/org/${organization?.slug}`,
      icon: LayoutDashboard,
    },
    {
      title: "Reimbursements",
      href: `/org/${organization?.slug}/reimbursements`,
      icon: Receipt,
    },
    {
      title: "Team",
      href: `/org/${organization?.slug}/team`,
      icon: Users,
    },
    {
      title: "Settings",
      href: `/org/${organization?.slug}/settings`,
      icon: Settings,
    },
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Link
          href={`/org/${organization?.slug}`}
          className="flex items-center gap-2 font-semibold"
        >
          <span className="text-lg">{organization?.name}</span>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start px-2 text-sm font-medium">
          {sidebarItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground",
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
      <div className="mt-auto p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden border-r bg-muted/40 lg:block lg:w-64">
        <SidebarContent />
      </div>
    </>
  );
}
