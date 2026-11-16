// Membuat sertifikat HTTPS buatan sendiri untuk server di jaringan lokal (LAN).
// Kamera hanya bisa dibuka lewat HTTPS bila alamatnya bukan localhost, jadi HP yang membuka
// https://<IP-laptop>:5173 butuh ini. Sertifikat dibuat ulang bila IP laptop berubah.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".cert");
const key = join(dir, "key.pem");
const cert = join(dir, "cert.pem");
const ipsFile = join(dir, "ips.txt");

export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

const ips = ["127.0.0.1", ...lanAddresses()];
const wanted = ips.join(",");
if (existsSync(cert) && existsSync(ipsFile) && readFileSync(ipsFile, "utf8") === wanted) process.exit(0);

mkdirSync(dir, { recursive: true });
const config = join(dir, "openssl.cnf");
writeFileSync(
  config,
  [
    "[req]",
    "distinguished_name = dn",
    "x509_extensions = ext",
    "prompt = no",
    "[dn]",
    "CN = Gesture Rail Shooter (lokal)",
    "[ext]",
    "basicConstraints = CA:FALSE",
    "keyUsage = digitalSignature, keyEncipherment",
    "extendedKeyUsage = serverAuth",
    "subjectAltName = @alt",
    "[alt]",
    "DNS.1 = localhost",
    ...ips.map((ip, i) => `IP.${i + 1} = ${ip}`),
    "",
  ].join("\n"),
);
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "825", "-keyout", key, "-out", cert, "-config", config], {
  stdio: "ignore",
});
writeFileSync(ipsFile, wanted);
console.log(`Sertifikat HTTPS lokal dibuat untuk: ${ips.join(", ")}`);
