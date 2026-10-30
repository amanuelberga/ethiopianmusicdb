import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Sign-in problem", description: "Something went wrong while signing in.", robots: { index: false } };

// Fixed messages only: the URL carries a short code, never text that is shown as is
const MESSAGES: Record<string, string> = {
  invalid_link: "That link is not valid. Please request a new one.",
  expired: "That link has expired. Please request a new one.",
};

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <p className="text-sm text-muted-foreground">
      {(code && MESSAGES[code]) || "Something went wrong with that link."}
    </p>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Sorry, something went wrong.
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense>
                <ErrorContent searchParams={searchParams} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
