"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

// Used by the sign-up, login and forgot-password forms. Tokens are single-use, so the forms call
// ref.current?.reset() after a failed attempt to get a fresh one.
export function CaptchaField({ onToken, ref }: { onToken: (token: string | null) => void; ref?: React.Ref<TurnstileInstance> }) {
  return (
    <Turnstile
      ref={ref}
      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
      onSuccess={onToken}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
    />
  );
}
