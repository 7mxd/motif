import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./tmp";

/**
 * A self-signed certificate for localhost and 127.0.0.1, made by openssl for this test run (none is kept in the
 * repository). Null where openssl isn't installed, so the tests that need one are skipped.
 */
export function selfSignedCert(): { cert: string; key: string } | null {
  if (!Bun.which("openssl")) return null;
  const dir = tempDir("motif-tls-");
  const r = Bun.spawnSync(
    ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")],
    { env: { ...process.env, MSYS_NO_PATHCONV: "1" }, stderr: "ignore", stdout: "ignore" },
  );
  if (r.exitCode !== 0) return null;
  return { cert: readFileSync(join(dir, "cert.pem"), "utf8"), key: readFileSync(join(dir, "key.pem"), "utf8") };
}
