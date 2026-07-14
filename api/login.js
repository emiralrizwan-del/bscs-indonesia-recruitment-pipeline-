import crypto from "crypto";

const SALT = "bsm-pipeline-dashboard-v1";

export function deriveToken(password) {
  return crypto.createHash("sha256").update(SALT + "::" + password).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const teamPassword = process.env.TEAM_PASSWORD;
  if (!teamPassword) return res.status(500).json({ error: "TEAM_PASSWORD is not configured on the server." });

  const { password } = req.body || {};
  if (!password || password !== teamPassword) return res.status(401).json({ error: "Incorrect password." });

  return res.status(200).json({ token: deriveToken(teamPassword) });
}
