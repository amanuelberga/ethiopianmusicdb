/* eslint-disable @next/next/no-img-element */
type CoverSource = { cover_key: string | null; youtube_video_id: string | null };

export function coverUrl(r: CoverSource): string | null {
  if (r.cover_key) return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${r.cover_key}`;
  if (r.youtube_video_id) return `https://img.youtube.com/vi/${r.youtube_video_id}/hqdefault.jpg`;
  return null;
}

export function Cover({
  cover_key,
  youtube_video_id,
  title,
  className = "",
}: CoverSource & { title: string; className?: string }) {
  const src = coverUrl({ cover_key, youtube_video_id });
  if (!src) {
    return (
      <div className={`aspect-square bg-muted flex items-center justify-center text-[10px] text-muted-foreground ${className}`}>
        No cover
      </div>
    );
  }
  return <img src={src} alt={title} loading="lazy" className={`aspect-square object-cover bg-muted ${className}`} />;
}
