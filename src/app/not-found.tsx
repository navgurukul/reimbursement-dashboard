import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOrgStore } from "@/store/useOrgStore";
export default function NotFound() {
  // const { organization } = useOrgStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold">404</CardTitle>
          <CardDescription className="text-xl mt-2">
            Page Not Found
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground mb-6">
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
