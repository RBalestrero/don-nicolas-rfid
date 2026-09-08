import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError, clearToken, setToken, UNAUTHORIZED_EVENT } from "./api";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    clearToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
  });

  it("envía X-Client web y parsea detail.message", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({
        detail: { code: "AUTH_INVALID_CREDENTIALS", message: "Credenciales inválidas" },
      }),
    } as Response);

    await expect(
      apiFetch("/auth/login", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({ message: "Credenciales inválidas", status: 401 });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Headers).get("X-Client")).toBe("web");
  });

  it("limpia token y emite evento en 401 fuera de login", async () => {
    setToken("expired");
    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ detail: "Token inválido o expirado" }),
    } as Response);

    await expect(apiFetch("/activos")).rejects.toBeInstanceOf(ApiError);
    expect(sessionStorage.getItem("don_nicolas_token")).toBeNull();
    expect(handler).toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  });
});
