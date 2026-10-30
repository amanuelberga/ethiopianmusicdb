import { NotFoundContent } from "@/components/not-found-content";
import SiteLayout from "./(site)/layout";

// Unmatched URLs. This renders outside app/(site), so it wraps itself in the site layout.
export default function NotFound() {
  return (
    <SiteLayout>
      <NotFoundContent />
    </SiteLayout>
  );
}
