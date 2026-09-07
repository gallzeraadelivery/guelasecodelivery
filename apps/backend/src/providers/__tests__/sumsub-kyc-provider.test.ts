import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SumsubKycProvider } from "../sumsub-kyc-provider.js";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("SumsubKycProvider", () => {
  const config = { appToken: "app-token", secretKey: "secret-key", levelName: "basic-kyc-level" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assina cada requisição com X-App-Token/Sig/Ts", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "applicant-1", review: { reviewStatus: "init" } })) // create applicant
      .mockResolvedValueOnce(jsonResponse({ ok: 1 })) // request check
      .mockResolvedValueOnce(jsonResponse({ reviewStatus: "pending" })); // fetch status

    const provider = new SumsubKycProvider(config);
    await provider.submitCheck({ driverId: "driver-1", cpf: "12345678900", cnhNumber: "999", cnhCategory: "AB" });

    const [createUrl, createOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe("https://api.sumsub.com/resources/applicants?levelName=basic-kyc-level");
    const headers = createOptions.headers as Record<string, string>;
    expect(headers["X-App-Token"]).toBe("app-token");
    expect(headers["X-App-Access-Sig"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers["X-App-Access-Ts"]).toMatch(/^\d+$/);
  });

  it("submitCheck cria applicant, envia documentos, solicita checagem e retorna status atual", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "applicant-1", review: { reviewStatus: "init" } })) // create applicant
      .mockResolvedValueOnce(jsonResponse({})) // upload CNH front
      .mockResolvedValueOnce(jsonResponse({})) // upload selfie
      .mockResolvedValueOnce(jsonResponse({ ok: 1 })) // request check
      .mockResolvedValueOnce(jsonResponse({ reviewStatus: "pending" })); // fetch status

    const provider = new SumsubKycProvider(config);
    const result = await provider.submitCheck({
      driverId: "driver-1",
      cpf: "12345678900",
      cnhNumber: "999",
      cnhCategory: "AB",
      documentFrontBase64: Buffer.from("cnh-front").toString("base64"),
      selfieBase64: Buffer.from("selfie").toString("base64"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      externalCheckId: "applicant-1",
      status: "PENDING",
      checks: {},
      raw: { reviewStatus: "pending" },
    });

    const uploadUrl = fetchMock.mock.calls[1][0] as string;
    expect(uploadUrl).toBe("https://api.sumsub.com/resources/applicants/applicant-1/info/idDoc");
    const requestCheckUrl = fetchMock.mock.calls[3][0] as string;
    expect(requestCheckUrl).toBe("https://api.sumsub.com/resources/applicants/applicant-1/status/pending");
  });

  it("getCheckStatus mapeia reviewStatus completed + GREEN para APPROVED", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reviewStatus: "completed", reviewResult: { reviewAnswer: "GREEN" } }),
    );

    const provider = new SumsubKycProvider(config);
    const result = await provider.getCheckStatus("applicant-1");

    expect(result.status).toBe("APPROVED");
    expect(result.checks).toEqual({ approved: true });
  });

  it("getCheckStatus mapeia reviewStatus completed + RED para REJECTED", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ reviewStatus: "completed", reviewResult: { reviewAnswer: "RED", rejectLabels: ["FORGERY"] } }),
    );

    const provider = new SumsubKycProvider(config);
    const result = await provider.getCheckStatus("applicant-1");

    expect(result.status).toBe("REJECTED");
    expect(result.checks).toEqual({ approved: false });
  });

  it("getCheckStatus mapeia onHold para REVIEW e demais status para PENDING", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reviewStatus: "onHold" }));
    const provider = new SumsubKycProvider(config);
    const onHold = await provider.getCheckStatus("applicant-1");
    expect(onHold.status).toBe("REVIEW");

    fetchMock.mockResolvedValueOnce(jsonResponse({ reviewStatus: "queued" }));
    const queued = await provider.getCheckStatus("applicant-1");
    expect(queued.status).toBe("PENDING");
  });

  it("reaproveita o applicant existente quando o Sumsub responde 409 (already exists)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { code: 409, description: "Applicant with external user id 'driver-1' already exists: applicant-existing" },
          false,
          409,
        ),
      ) // create applicant -> conflito
      .mockResolvedValueOnce(jsonResponse({ id: "applicant-existing" })) // busca por externalUserId
      .mockResolvedValueOnce(jsonResponse({ ok: 1 })) // request check
      .mockResolvedValueOnce(jsonResponse({ reviewStatus: "pending" })); // fetch status

    const provider = new SumsubKycProvider(config);
    const result = await provider.submitCheck({ driverId: "driver-1", cpf: "12345678900", cnhNumber: "999", cnhCategory: "AB" });

    expect(result.externalCheckId).toBe("applicant-existing");
    const lookupUrl = fetchMock.mock.calls[1][0] as string;
    expect(lookupUrl).toBe("https://api.sumsub.com/resources/applicants/-;externalUserId=driver-1/one");
  });

  it("propaga erro com corpo da resposta quando a API retorna status de erro", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ description: "Invalid token" }, false, 401));

    const provider = new SumsubKycProvider(config);
    await expect(provider.getCheckStatus("applicant-1")).rejects.toThrow(/Sumsub GET .* falhou \(401\)/);
  });
});
