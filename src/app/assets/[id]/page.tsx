import { redirect } from "next/navigation";

/**
 * Asset details live in a popup on Assets management; old links to an
 * asset open that popup.
 */
export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/assets?asset=${encodeURIComponent(id)}`);
}
