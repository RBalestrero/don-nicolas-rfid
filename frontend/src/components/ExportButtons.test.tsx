import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportButtons from "./ExportButtons";

vi.mock("../lib/api", () => ({
  downloadReport: vi.fn(),
}));

import { downloadReport } from "../lib/api";

const downloadMock = vi.mocked(downloadReport);

describe("ExportButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadMock.mockResolvedValue(undefined);
  });

  it("dispara descarga xlsx y csv", async () => {
    const user = userEvent.setup();
    render(
      <ExportButtons
        basePath="/reportes/movimientos"
        filenameBase="movimientos"
        query={{ accion: "creacion" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /exportar xlsx/i }));
    await waitFor(() => {
      expect(downloadMock).toHaveBeenCalledWith(
        "/reportes/movimientos?formato=xlsx&accion=creacion",
        "movimientos.xlsx",
      );
    });

    await user.click(screen.getByRole("button", { name: /exportar csv/i }));
    await waitFor(() => {
      expect(downloadMock).toHaveBeenCalledWith(
        "/reportes/movimientos?formato=csv&accion=creacion",
        "movimientos.csv",
      );
    });
  });
});
