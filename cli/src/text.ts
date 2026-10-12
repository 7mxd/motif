/** Remove a leading UTF-8 byte-order mark, which Windows editors and PowerShell 5.1 often add. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
