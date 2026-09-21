import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivoFotos from "./ActivoFotos";
import type { Fotografia } from "../types";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
  apiFetchBlob: vi.fn(),
}));

import { apiFetch, apiFetchBlob } from "../lib/api";

const apiFetchMock = vi.mocked(apiFetch);
const apiFetchBlobMock = vi.mocked(apiFetchBlob);

const foto: Fotografia = {
  id: "foto-1",
  activo_id: "act-1",
  nombre_archivo: "frente.png",
  mime_type: "image/png",
  tamano_bytes: 2048,
  es_principal: true,
  creado_en: "2024-01-01T00:00:00Z",
  url: "/api/v1/fotografias/foto-1/archivo",
};

describe("ActivoFotos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchBlobMock.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  });

  it("lista fotografías y permite eliminar", async () => {
    const user = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([foto])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    render(<ActivoFotos activoId="act-1" />);

    expect(await screen.findByText("frente.png")).toBeInTheDocument();
    expect(screen.getByText(/^Principal$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /eliminar frente\.png/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^eliminar$/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/fotografias/foto-1", { method: "DELETE" });
    });
    expect(await screen.findByLabelText(/subir fotografía/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/fotografías del activo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument();
  });

  it("sube una fotografía automáticamente al elegir archivo", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce(foto).mockResolvedValueOnce([foto]);

    const { container } = render(<ActivoFotos activoId="act-1" />);

    expect(await screen.findByLabelText(/subir fotografía/i)).toBeInTheDocument();
    expect(screen.getByText(/soltá una imagen o elegí archivo/i)).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["img"], "nueva.png", { type: "image/png" });
    await user.upload(input, file);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/activos/act-1/fotografias?es_principal=true",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
      );
    });
  });
});
