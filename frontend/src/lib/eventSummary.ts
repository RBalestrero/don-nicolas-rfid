export type EventTone = "neutral" | "ok" | "warn" | "info";

export type EventView = {
  title: string;
  icon: string;
  tone: EventTone;
  facts: string[];
  linkLabel: string | null;
};

const ACCION_LABELS: Record<string, string> = {
  creacion: "Alta del artículo",
  actualizacion: "Datos actualizados",
  desactivacion: "Artículo dado de baja",
  asignacion_ubicacion: "Ubicación asignada",
  desasignacion_ubicacion: "Ubicación quitada",
  etiqueta_impresa: "Etiquetas impresas",
  etiqueta_codificada: "Etiquetas codificadas",
  etiqueta_reposicion: "Etiquetas reimpresas",
  etiqueta_baja: "Etiqueta eliminada",
  foto_agregada: "Foto agregada",
  foto_eliminada: "Foto eliminada",
  transferencia: "Movimiento a depósito",
  entrega_persona: "Entrega a persona",
  ajuste_inventario: "Ajuste por inventario",
};

const ACCION_ICONS: Record<string, string> = {
  creacion: "bi-plus-circle",
  actualizacion: "bi-pencil-square",
  desactivacion: "bi-slash-circle",
  asignacion_ubicacion: "bi-geo-alt",
  desasignacion_ubicacion: "bi-geo",
  etiqueta_impresa: "bi-printer",
  etiqueta_codificada: "bi-upc-scan",
  etiqueta_reposicion: "bi-arrow-repeat",
  etiqueta_baja: "bi-trash3",
  foto_agregada: "bi-image",
  foto_eliminada: "bi-image-fill",
  transferencia: "bi-arrow-left-right",
  entrega_persona: "bi-person-check",
  ajuste_inventario: "bi-clipboard-check",
};

const CAMPO_LABELS: Record<string, string> = {
  numero_patrimonial: "Patrimonio",
  descripcion: "Descripción",
  activo: "Estado",
  ubicacion_codigo: "Ubicación",
  deposito: "Depósito",
  nombre_archivo: "Archivo",
  cantidad: "Cantidad",
  stock_etiquetas: "Stock",
};

const SKIP_FIELDS = new Set([
  "cantidad",
  "stock_etiquetas",
  "modo",
  "ubicacion_codigo",
  "deposito",
  "deposito_origen",
  "deposito_destino",
  "epc",
  "epcs",
  "nombre_archivo",
  "numero_patrimonial",
  "descripcion",
  "impreso",
  "modo_simulacion",
  "enviado_impresora",
  "inventario_id",
  "transferencia_id",
  "movimiento_id",
  "persona_destino_id",
  "persona_nombre",
  "etiqueta_id",
  "deposito_origen_id",
  "deposito_destino_id",
  "tamano_bytes",
  "epc_legacy",
]);

export function formatAccionLabel(accion: string): string {
  return ACCION_LABELS[accion] ?? accion.replace(/_/g, " ");
}

function looksLikeId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!s) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return true;
  }
  if (/^[0-9a-f]{16,}$/i.test(s) && !/^D1/i.test(s)) return true;
  return false;
}

function formatHumanValue(value: unknown): string | null {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return "—";
    if (looksLikeId(t)) return null;
    if (t === "true") return "Sí";
    if (t === "false") return "No";
    return t;
  }
  return null;
}

function formatDiff(campo: string, anterior: unknown, nuevo: unknown): string | null {
  if (campo.endsWith("_id") || campo === "etiqueta_id") return null;
  const label = CAMPO_LABELS[campo] ?? null;
  if (!label && (looksLikeId(anterior) || looksLikeId(nuevo))) return null;

  if (campo === "activo") {
    const a = anterior === true || anterior === "true" ? "Activo" : "Inactivo";
    const n = nuevo === true || nuevo === "true" ? "Activo" : "Inactivo";
    return `${a} → ${n}`;
  }
  if (campo === "estado") {
    const map: Record<string, string> = {
      activa: "Activa",
      baja: "Eliminada",
      perdida: "Perdida",
    };
    const a = map[String(anterior)] ?? formatHumanValue(anterior);
    const n = map[String(nuevo)] ?? formatHumanValue(nuevo);
    if (!a || !n) return null;
    return `${a} → ${n}`;
  }

  const a = formatHumanValue(anterior);
  const n = formatHumanValue(nuevo);
  if (!a || !n) return null;
  if (!label) return null;
  return `${label}: ${a} → ${n}`;
}

function cambiosId(cambios: Record<string, unknown>, key: string): boolean {
  const v = cambios[key];
  return typeof v === "string" && v.length > 0;
}

export function summarizeEvent(
  accion: string,
  cambios: Record<string, unknown> | null,
): EventView {
  const title = formatAccionLabel(accion);
  const icon = ACCION_ICONS[accion] ?? "bi-circle";
  const facts: string[] = [];
  const c = cambios ?? {};

  const tone: EventTone =
    accion === "desactivacion" || accion === "etiqueta_baja" || accion === "foto_eliminada"
      ? "warn"
      : accion.startsWith("etiqueta_") || accion === "creacion" || accion === "foto_agregada"
        ? "ok"
        : accion === "transferencia" ||
            accion === "entrega_persona" ||
            accion === "ajuste_inventario"
          ? "info"
          : "neutral";

  if (typeof c.cantidad === "number") {
    if (accion === "transferencia" || accion === "entrega_persona") {
      facts.push(c.cantidad === 1 ? "1 unidad" : `${c.cantidad} unidades`);
    } else {
      facts.push(c.cantidad === 1 ? "1 etiqueta" : `${c.cantidad} etiquetas`);
    }
  }
  if (typeof c.stock_etiquetas === "number") {
    facts.push(`Stock resultante: ${c.stock_etiquetas}`);
  }
  if (c.modo === "reposicion") {
    facts.push("Reposición (sin sumar stock)");
  }
  if (c.modo === "nueva" && (accion === "etiqueta_impresa" || accion === "etiqueta_codificada")) {
    facts.push("Alta de unidades nuevas");
  }
  if (
    typeof c.deposito_origen === "string" &&
    c.deposito_origen.trim() &&
    typeof c.deposito_destino === "string" &&
    c.deposito_destino.trim()
  ) {
    facts.push(`Origen: ${c.deposito_origen} → Destino: ${c.deposito_destino}`);
  } else {
    if (typeof c.deposito_origen === "string" && c.deposito_origen.trim()) {
      facts.push(`Origen: ${c.deposito_origen}`);
    }
    if (typeof c.deposito_destino === "string" && c.deposito_destino.trim()) {
      facts.push(`Destino: ${c.deposito_destino}`);
    }
  }
  if (typeof c.ubicacion_codigo === "string" && c.ubicacion_codigo.trim()) {
    facts.push(
      accion === "transferencia" || accion === "asignacion_ubicacion"
        ? `Ubicación destino: ${c.ubicacion_codigo}`
        : `Ubicación: ${c.ubicacion_codigo}`,
    );
  }
  if (typeof c.persona_nombre === "string" && c.persona_nombre.trim()) {
    facts.push(`Entregado a: ${c.persona_nombre}`);
  }
  if (typeof c.deposito === "string" && c.deposito.trim()) {
    facts.push(`Depósito: ${c.deposito}`);
  }
  if (Array.isArray(c.epcs) && c.epcs.length > 0 && typeof c.cantidad !== "number") {
    facts.push(c.epcs.length === 1 ? "1 etiqueta" : `${c.epcs.length} etiquetas`);
  }
  if (typeof c.nombre_archivo === "string" && c.nombre_archivo.trim()) {
    facts.push(`Archivo: ${c.nombre_archivo}`);
  }
  if (typeof c.numero_patrimonial === "string" && c.numero_patrimonial.trim()) {
    facts.push(`Patrimonio: ${c.numero_patrimonial}`);
  }
  if (typeof c.descripcion === "string" && c.descripcion.trim() && accion === "creacion") {
    facts.push(c.descripcion);
  }
  if (c.modo_simulacion === true) {
    facts.push("Impresión simulada");
  }

  for (const [campo, valor] of Object.entries(c)) {
    if (valor && typeof valor === "object" && "anterior" in valor && "nuevo" in valor) {
      if (campo === "categoria_id") {
        facts.push("Categoría actualizada");
        continue;
      }
      const v = valor as { anterior: unknown; nuevo: unknown };
      const line = formatDiff(campo, v.anterior, v.nuevo);
      if (line) facts.push(line);
      continue;
    }
    if (campo === "categoria_id") {
      facts.push("Categoría actualizada");
      continue;
    }
    if (SKIP_FIELDS.has(campo)) continue;
    const human = formatHumanValue(valor);
    if (human == null) continue;
    const label = CAMPO_LABELS[campo];
    if (label) facts.push(`${label}: ${human}`);
  }

  let linkLabel: string | null = null;
  if (cambiosId(c, "transferencia_id") || cambiosId(c, "movimiento_id")) {
    linkLabel = "Ver movimiento";
  } else if (cambiosId(c, "inventario_id")) linkLabel = "Ver inventario";

  return { title, icon, tone, facts, linkLabel };
}
