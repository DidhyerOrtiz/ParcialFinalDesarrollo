import {
  registrarReporte,
  formatearFecha,
  formatearTamano,
  LIMITE_FOTO,
  TIPOS_FOTO,
  DESCRIPCION_MIN,
  DESCRIPCION_MAX
} from '/js/api.js';

const CLAVE_BORRADOR = 'portal-municipal:borrador';
const TIEMPO_MAXIMO_ENVIO = 60000;

const $ = id => document.getElementById(id);

const formulario = $('formulario');
const descripcion = $('descripcion');
const contador = $('contador');
const descripcionError = $('descripcion-error');
const entradaFoto = $('foto');
const selectorFoto = $('selector-foto');
const fotoError = $('foto-error');
const vistaPrevia = $('vista-previa');
const vistaPreviaImagen = $('vista-previa-imagen');
const vistaPreviaNombre = $('vista-previa-nombre');
const vistaPreviaMeta = $('vista-previa-meta');
const quitarFoto = $('quitar-foto');
const botonEnviar = $('enviar');
const enviarGirador = $('enviar-girador');
const enviarTexto = $('enviar-texto');
const estadoEnvio = $('estado-envio');
const avisoError = $('aviso-error');
const avisoErrorTexto = $('aviso-error-texto');
const seccionFormulario = $('seccion-formulario');
const seccionConfirmacion = $('seccion-confirmacion');

let fotoLista = null;        // File listo para enviar (original u optimizado)
let urlVistaPrevia = null;   // Object URL de la vista previa
let procesandoFoto = 0;      // Identificador de la última selección en proceso
let enviando = false;

/* ---------- Borrador ---------- */

function guardarBorrador() {
  try {
    sessionStorage.setItem(CLAVE_BORRADOR, descripcion.value);
  } catch {
    // El almacenamiento puede no estar disponible; el borrador sigue en el formulario.
  }
}

function restaurarBorrador() {
  try {
    const guardado = sessionStorage.getItem(CLAVE_BORRADOR);
    if (guardado && !descripcion.value) descripcion.value = guardado;
  } catch {
    // Sin almacenamiento disponible.
  }
}

function borrarBorrador() {
  try {
    sessionStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // Sin almacenamiento disponible.
  }
}

/* ---------- Validación ---------- */

// Al enviar con FormData el navegador convierte cada salto de línea en CRLF,
// y la API cuenta esos dos caracteres. Se mide igual para no rebasar el límite.
function largoDescripcion() {
  return descripcion.value.trim().replace(/\r?\n/g, '\r\n').length;
}

function validarDescripcion() {
  const largo = largoDescripcion();
  let mensaje = '';
  if (largo === 0) mensaje = 'Escribe una descripción del problema.';
  else if (largo < DESCRIPCION_MIN) mensaje = 'La descripción debe tener al menos ' + DESCRIPCION_MIN + ' caracteres (llevas ' + largo + ').';
  else if (largo > DESCRIPCION_MAX) mensaje = 'La descripción no puede superar ' + DESCRIPCION_MAX + ' caracteres.';
  mostrarErrorCampo(descripcion, descripcionError, mensaje);
  return !mensaje;
}

function validarFoto() {
  let mensaje = '';
  if (procesandoFoto && !fotoLista) mensaje = 'Espera a que termine de prepararse la fotografía.';
  else if (!fotoLista) mensaje = fotoError.dataset.mensaje || 'Adjunta una fotografía del problema.';
  mostrarErrorCampo(entradaFoto, fotoError, mensaje);
  selectorFoto.dataset.invalido = mensaje ? 'true' : 'false';
  return !mensaje;
}

function mostrarErrorCampo(campo, contenedor, mensaje) {
  contenedor.textContent = mensaje;
  if (mensaje) campo.setAttribute('aria-invalid', 'true');
  else campo.removeAttribute('aria-invalid');
}

function actualizarContador() {
  const largo = largoDescripcion();
  contador.textContent = largo + ' / ' + DESCRIPCION_MAX;
}

/* ---------- Fotografía ---------- */

function decodificarImagen(archivo) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(archivo).catch(() => decodificarConImg(archivo));
  }
  return decodificarConImg(archivo);
}

function decodificarConImg(archivo) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolver(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('No se pudo leer la imagen'));
    };
    imagen.src = url;
  });
}

function lienzoABlob(lienzo, tipo, calidad) {
  return new Promise(resolver => lienzo.toBlob(resolver, tipo, calidad));
}

// Redimensiona y exporta a JPEG hasta quedar por debajo del límite de la API.
async function optimizarFoto(archivo) {
  const imagen = await decodificarImagen(archivo);
  const anchoOriginal = imagen.width;
  const altoOriginal = imagen.height;
  if (!anchoOriginal || !altoOriginal) throw new Error('Imagen vacía');

  const lienzo = document.createElement('canvas');
  const contexto = lienzo.getContext('2d');
  let ladoMaximo = Math.min(2048, Math.max(anchoOriginal, altoOriginal));
  const calidades = [0.85, 0.75, 0.65, 0.55];

  try {
    for (let intento = 0; intento < 6; intento++) {
      const escala = Math.min(1, ladoMaximo / Math.max(anchoOriginal, altoOriginal));
      lienzo.width = Math.max(1, Math.round(anchoOriginal * escala));
      lienzo.height = Math.max(1, Math.round(altoOriginal * escala));
      // Fondo blanco para que las transparencias de PNG no queden negras en JPEG.
      contexto.fillStyle = '#ffffff';
      contexto.fillRect(0, 0, lienzo.width, lienzo.height);
      contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

      for (const calidad of calidades) {
        const blob = await lienzoABlob(lienzo, 'image/jpeg', calidad);
        if (blob && blob.size <= LIMITE_FOTO) {
          const nombre = (archivo.name || 'foto').replace(/\.[^.]*$/, '') + '.jpg';
          return new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() });
        }
      }
      ladoMaximo = Math.round(ladoMaximo * 0.75);
    }
  } finally {
    imagen.close?.();
  }
  throw new Error('No se pudo reducir la imagen');
}

function liberarVistaPrevia() {
  if (urlVistaPrevia) {
    URL.revokeObjectURL(urlVistaPrevia);
    urlVistaPrevia = null;
  }
  vistaPreviaImagen.removeAttribute('src');
  vistaPrevia.hidden = true;
}

function limpiarFoto() {
  procesandoFoto = 0;
  fotoLista = null;
  delete fotoError.dataset.mensaje;
  entradaFoto.value = '';
  liberarVistaPrevia();
}

function mostrarVistaPrevia(archivo, original) {
  liberarVistaPrevia();
  urlVistaPrevia = URL.createObjectURL(archivo);
  vistaPreviaImagen.src = urlVistaPrevia;
  vistaPreviaNombre.textContent = original.name || 'Fotografía';
  vistaPreviaMeta.textContent = archivo === original
    ? formatearTamano(archivo.size)
    : 'Optimizada de ' + formatearTamano(original.size) + ' a ' + formatearTamano(archivo.size) + ' (JPEG)';
  vistaPrevia.hidden = false;
}

async function alSeleccionarFoto() {
  const archivo = entradaFoto.files?.[0];
  fotoLista = null;
  delete fotoError.dataset.mensaje;
  liberarVistaPrevia();
  if (!archivo) {
    procesandoFoto = 0;
    return;
  }

  const turno = ++procesandoFoto;
  mostrarErrorCampo(entradaFoto, fotoError, '');
  selectorFoto.dataset.invalido = 'false';

  if (!archivo.type.startsWith('image/') && archivo.type !== '') {
    procesandoFoto = 0;
    fotoError.dataset.mensaje = 'El archivo seleccionado no es una imagen. Usa JPEG, PNG o WebP.';
    validarFoto();
    return;
  }

  try {
    let preparada = archivo;
    if (!TIPOS_FOTO.includes(archivo.type) || archivo.size > LIMITE_FOTO) {
      fotoError.textContent = '';
      vistaPreviaMeta.textContent = '';
      estadoEnvio.textContent = 'Preparando la fotografía…';
      preparada = await optimizarFoto(archivo);
    }
    if (turno !== procesandoFoto) return; // El usuario eligió otra foto mientras tanto.
    procesandoFoto = 0;
    fotoLista = preparada;
    mostrarVistaPrevia(preparada, archivo);
    estadoEnvio.textContent = 'Fotografía lista.';
    validarFoto();
  } catch {
    if (turno !== procesandoFoto) return;
    procesandoFoto = 0;
    fotoError.dataset.mensaje = 'No pudimos leer esta imagen. Usa una fotografía JPEG, PNG o WebP.';
    estadoEnvio.textContent = '';
    validarFoto();
  }
}

/* ---------- Envío ---------- */

function ocultarAviso() {
  avisoError.hidden = true;
  avisoErrorTexto.textContent = '';
}

function mostrarAviso(mensaje) {
  avisoErrorTexto.textContent = mensaje;
  avisoError.hidden = false;
  avisoError.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function ponerEnviando(activo) {
  enviando = activo;
  botonEnviar.disabled = activo;
  botonEnviar.setAttribute('aria-busy', String(activo));
  enviarGirador.hidden = !activo;
  enviarTexto.textContent = activo ? 'Enviando reporte…' : 'Enviar reporte';
  descripcion.readOnly = activo;
  entradaFoto.disabled = activo;
  quitarFoto.disabled = activo;
}

async function alEnviar(evento) {
  evento.preventDefault();
  if (enviando) return;
  ocultarAviso();

  const descripcionValida = validarDescripcion();
  const fotoValida = validarFoto();
  if (!descripcionValida || !fotoValida) {
    (descripcionValida ? entradaFoto : descripcion).focus();
    return;
  }

  guardarBorrador();
  ponerEnviando(true);
  estadoEnvio.textContent = 'Enviando reporte…';
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_ENVIO);

  try {
    const reporte = await registrarReporte(descripcion.value.trim(), fotoLista, { signal: controlador.signal });
    mostrarConfirmacion(reporte);
  } catch (error) {
    const mensaje = error.name === 'AbortError'
      ? 'El servidor tardó demasiado en responder. Tu borrador se conservó; intenta enviarlo de nuevo.'
      : error.message + ' Tu borrador se conservó.';
    mostrarAviso(mensaje);
    estadoEnvio.textContent = '';
    if (error.codigo === 'DESCRIPCION_INVALIDA') {
      mostrarErrorCampo(descripcion, descripcionError, error.message);
    } else if (['FOTO_GRANDE', 'FOTO_INVALIDA', 'FOTO_REQUERIDA'].includes(error.codigo)) {
      mostrarErrorCampo(entradaFoto, fotoError, error.message);
      selectorFoto.dataset.invalido = 'true';
    }
  } finally {
    clearTimeout(temporizador);
    ponerEnviando(false);
  }
}

function mostrarConfirmacion(reporte) {
  $('folio').textContent = reporte?.id ?? '';
  $('fecha-registro').textContent = reporte?.creadoEn ? 'Registrado el ' + formatearFecha(reporte.creadoEn) : '';
  $('estado-copia').textContent = '';
  borrarBorrador();
  formulario.reset();
  limpiarFoto();
  actualizarContador();
  seccionFormulario.hidden = true;
  seccionConfirmacion.hidden = false;
  seccionConfirmacion.focus();
}

function nuevoReporte() {
  seccionConfirmacion.hidden = true;
  seccionFormulario.hidden = false;
  ocultarAviso();
  mostrarErrorCampo(descripcion, descripcionError, '');
  mostrarErrorCampo(entradaFoto, fotoError, '');
  selectorFoto.dataset.invalido = 'false';
  estadoEnvio.textContent = '';
  descripcion.focus();
}

async function copiarFolio() {
  const folio = $('folio').textContent;
  const estado = $('estado-copia');
  try {
    await navigator.clipboard.writeText(folio);
    estado.textContent = 'Folio copiado al portapapeles.';
  } catch {
    estado.textContent = 'No se pudo copiar automáticamente. Selecciona el folio para copiarlo.';
  }
}

/* ---------- Eventos ---------- */

descripcion.addEventListener('input', () => {
  actualizarContador();
  guardarBorrador();
  if (descripcion.getAttribute('aria-invalid') === 'true') validarDescripcion();
});
descripcion.addEventListener('blur', () => {
  if (descripcion.value.trim()) validarDescripcion();
});
entradaFoto.addEventListener('change', alSeleccionarFoto);
quitarFoto.addEventListener('click', () => {
  limpiarFoto();
  estadoEnvio.textContent = 'Fotografía quitada.';
  entradaFoto.focus();
});
formulario.addEventListener('submit', alEnviar);
$('nuevo-reporte').addEventListener('click', nuevoReporte);
$('copiar-folio').addEventListener('click', copiarFolio);

restaurarBorrador();
actualizarContador();
