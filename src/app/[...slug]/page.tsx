// Root catch-all: only reached when no concrete route matched, i.e. the
// request would 404. Soft-404 policy (ADR-005) redirects it one level up;
// unknown parents re-enter this route, so the chain walks to the nearest
// live page and always terminates at "/".
import { notFound, redirect } from "next/navigation";

import { buildSearchSuffix, softRedirectTarget } from "@/lib/routing/soft-404";

type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SoftNotFound({ params, searchParams }: Props) {
  const { slug } = await params;
  const target = softRedirectTarget(slug, buildSearchSuffix(await searchParams));
  if (target === null) notFound();
  // 307, deliberately not permanentRedirect: a browser-cached 308 would
  // shadow any real route later added at this path.
  redirect(target);
}
