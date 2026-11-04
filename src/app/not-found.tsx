import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOrgStore } from "@/store/useOrgStore";
export default function NotFound() {
  // const { organization } = useOrgStore();

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-6 text-center">
          <div className="space-y-1">
            <p className="text-4xl font-bold tracking-tight">404</p>
            <h1 className="section-heading">Page Not Found</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="flex flex-col gap-4">
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
            {/* <Button variant="outline" asChild>
              <Link href={`/org/${organization?.slug}`}>Go to Dashboard</Link>
            </Button> */}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
