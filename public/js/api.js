// Cliente de la API municipal. Todas las rutas son absolutas y del mismo origen.

export const LIMITE_FOTO = 716800;
export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
export const DESCRIPCION_MIN = 10;
export const DESCRIPCION_MAX = 2000;

const MENSAJES_HTTP = {
  400: 'Revisa los datos del formulario e intenta de nuevo.',
  401: 'La clave de acceso es inválida o está ausente.',
  404: 'No se encontró el recurso solicitado.',
  413: 'La fotografía o la solicitud es demasiado grande.',
  415: 'El formato de la imagen no es admitido.',
  503: 'El almacenamiento no está disponible por ahora. Intenta de nuevo en unos minutos.'
};

export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.codigo = codigo;
  }
}

async function errorDesdeRespuesta(respuesta) {
  let codigo = 'ERROR_HTTP';
  let mensaje = MENSAJES_HTTP[respuesta.status] ?? 'Ocurrió un error inesperado (HTTP ' + respuesta.status + ').';
  try {
    const cuerpo = await respuesta.json();
    if (cuerpo?.error?.mensaje) mensaje = String(cuerpo.error.mensaje);
    if (cuerpo?.error?.codigo) codigo = String(cuerpo.error.codigo);
  } catch {
    // La respuesta no era JSON; se conserva el mensaje genérico.
  }
  return new ErrorApi(respuesta.status, codigo, mensaje);
}

async function solicitar(url, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(url, { credentials: 'same-origin', ...opciones });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  }
  if (!respuesta.ok) throw await errorDesdeRespuesta(respuesta);
  return respuesta;
}

function autorizacion(clave) {
  return { Authorization: 'Bearer ' + clave };
}

export async function registrarReporte(descripcion, foto, { signal } = {}) {
  const datos = new FormData();
  datos.append('descripcion', descripcion);
  datos.append('foto', foto, foto.name);
  const respuesta = await solicitar('/api/reportes', { method: 'POST', body: datos, signal });
  const cuerpo = await respuesta.json();
  return cuerpo.reporte;
}

export async function listarReportes(clave, { cursor = null, limite = 20, signal } = {}) {
  const parametros = new URLSearchParams({ limite: String(limite) });
  if (cursor) parametros.set('cursor', cursor);
  const respuesta = await solicitar('/api/reportes?' + parametros, {
    headers: autorizacion(clave),
    signal
  });
  return respuesta.json();
}

export async function obtenerFoto(clave, fotoUrl, { signal } = {}) {
  // Solo se aceptan rutas de la propia API para no enviar la clave a otro origen.
  if (typeof fotoUrl !== 'string' || !fotoUrl.startsWith('/api/reportes/')) {
    throw new ErrorApi(0, 'URL_INVALIDA', 'La dirección de la fotografía no es válida.');
  }
  const respuesta = await solicitar(fotoUrl, { headers: autorizacion(clave), signal });
  return respuesta.blob();
}

export function formatearFecha(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'Fecha desconocida';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeStyle: 'short' }).format(fecha);
}

export function formatearTamano(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toLocaleString('es-GT', { maximumFractionDigits: 0 }) + ' KB';
}
