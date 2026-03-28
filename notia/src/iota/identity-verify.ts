export interface DriverIdentityResult {
  verified: boolean;
  driverDid: string;
  credentialCount: number;
}

async function post(endpoint: string, path: string): Promise<Response> {
  return fetch(`${endpoint}${path}`, { method: "POST" });
}

async function refreshIdentityArtifacts(endpoint: string): Promise<void> {
  const steps = ["/driver/create-did", "/driver/issue-vc", "/driver/create-vp"];
  for (const step of steps) {
    const res = await post(endpoint, step);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Identity bootstrap failed at ${step}: ${res.status}${body ? ` - ${body}` : ""}`);
    }
  }
}

export async function verifyDriverVP(): Promise<DriverIdentityResult> {
  const endpoint = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3002";
  const url = `${endpoint}/driver/verify`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Identity service unreachable at ${url}. Set IDENTITY_SERVICE_URL to a reachable verifier service or start the local backend at ../iota-identity-backend (error: ${message})`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const recoverableError =
      response.status >= 500 &&
      /expiration|driver DID not found|No such file/i.test(body);

    if (recoverableError) {
      await refreshIdentityArtifacts(endpoint);
      response = await post(endpoint, "/driver/verify");
      if (!response.ok) {
        const retriedBody = await response.text().catch(() => "");
        const detail = retriedBody ? ` - ${retriedBody}` : "";
        throw new Error(`Identity service error after refresh: ${response.status}${detail}`);
      }
    } else {
      const detail = body ? ` - ${body}` : "";
      throw new Error(`Identity service error: ${response.status}${detail}`);
    }
  }

  const data = await response.json() as {
    valid: boolean;
    holder: string;
    credential_count: number;
  };

  return {
    verified: data.valid,
    driverDid: data.holder,
    credentialCount: data.credential_count,
  };
}
