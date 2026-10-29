export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, "-")}-rehearsal-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.webm`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
