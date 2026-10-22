import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

async function hashIp(ip: string, pepper: string): Promise<string> {
  const bytes = new TextEncoder().encode(pepper + ":" + ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Método não permitido." });

  const accessPassword = Deno.env.get("APP_ACCESS_PASSWORD");
  const internalEmail = Deno.env.get("APP_AUTH_EMAIL");
  const pepper = Deno.env.get("RATE_LIMIT_PEPPER");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!accessPassword || !internalEmail || !pepper || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(503, { error: "O acesso ainda não foi configurado no servidor." });
  }

  let suppliedPassword = "";
  try {
    const body = await request.json();
    suppliedPassword = typeof body?.password === "string" ? body.password : "";
  } catch {
    return json(400, { error: "Requisição inválida." });
  }
  if (!suppliedPassword || suppliedPassword.length > 256) {
    return json(400, { error: "Informe a senha de acesso." });
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = await hashIp(forwardedFor, pepper);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: limitError } = await admin.rpc("check_password_login_rate_limit", {
    p_ip_hash: ipHash,
  });
  if (limitError) {
    console.error("Rate-limit check failed:", limitError.message);
    return json(503, { error: "Não foi possível validar o acesso agora." });
  }
  if (allowed !== true) return json(429, { error: "Muitas tentativas. Aguarde 15 minutos." });

  if (!constantTimeEqual(suppliedPassword, accessPassword)) {
    return json(401, { error: "Senha incorreta." });
  }

  // A pre-provisioned, confirmed internal user is used for Supabase Auth.
  // The shared access password and internal email never enter the public bundle.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: internalEmail,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("Internal auth link generation failed:", linkError?.message ?? "missing token hash");
    return json(503, { error: "Não foi possível iniciar a sessão." });
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: sessionError } = await publicClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (sessionError || !sessionData.session || !sessionData.user) {
    console.error("Internal session exchange failed:", sessionError?.message ?? "missing session");
    return json(503, { error: "Não foi possível iniciar a sessão." });
  }

  return json(200, {
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    expires_in: sessionData.session.expires_in,
    token_type: sessionData.session.token_type,
    user: { id: sessionData.user.id },
  });
});
