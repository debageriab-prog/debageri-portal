/** Streams a stored file, inline when the viewer asks to preview it. */
export function fileResponse(
  request: Request,
  file: { name: string; contentType: string },
  contents: Buffer,
) {
  const disposition =
    new URL(request.url).searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment";
  return new Response(new Uint8Array(contents), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
