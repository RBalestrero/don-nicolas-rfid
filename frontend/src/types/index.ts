export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface Activo {
  id: string;
  numero_patrimonial: string;
  descripcion: string;
  categoria_id: string;
  epc: string | null;
  datos_tecnicos: Record<string, unknown> | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
  categoria: Categoria;
}

export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: string;
}

export interface ActivoCreatePayload {
  numero_patrimonial: string;
  descripcion: string;
  categoria_id: string;
  epc?: string | null;
  datos_tecnicos?: Record<string, unknown> | null;
}

export interface CategoriaCreatePayload {
  nombre: string;
  descripcion?: string | null;
}
