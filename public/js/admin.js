import { listarReportes, obtenerFoto, formatearFecha } from '/js/api.js';

const $ = id => document.getElementById(id);

const seccionAcceso = $('seccion-acceso');
const seccionReportes = $('seccion-reportes');
const formularioAcceso = $('formulario-acceso');
const entradaClave = $('clave');
const claveError = $('clave-error');
const accesoError = $('acceso-error');
const accesoErrorTexto = $('acceso-error-texto');
const botonIngresar = $('ingresar');
const botonSalir = $('salir');
const botonActualizar = $('actualizar');
const estadoCargando = $('estado-cargando');
const estadoVacio = $('estado-vacio');
const estadoError = $('estado-error');
const estadoErrorTexto = $('estado-error-texto');
const resumen = $('resumen');
const lista = $('lista-reportes');
const contenedorMas = $('mas');
const botonMas = $('cargar-mas');
const masError = $('mas-error');
const plantilla = $('plantilla-reporte');

// La clave solo vive en memoria durante la sesión de esta pestaña.
let clave = null;
let siguienteCursor = null;
let totalMostrados = 0;
let generacion = 0;             // Invalida respuestas de cargas anteriores
let controladorCarga = null;
const urlsFotos = new Map();    // id del reporte -> Object URL
const controladoresFoto = new Map();

/* ---------- Utilidades ---------- */

function ponerOcupado(boton, girador, texto, activo, textoActivo, textoNormal) {
  boton.disabled = activo;
  boton.setAttribute('aria-busy', String(activo));
  girador.hidden = !activo;
  texto.textContent = activo ? textoActivo : textoNormal;
}

function mostrarSolo(estado) {
  estadoCargando.hidden = estado !== 'cargando';
  estadoVacio.hidden = estado !== 'vacio';
  estadoError.hidden = estado !== 'error';
}

function liberarFotos() {
  for (const controlador of controladoresFoto.values()) controlador.abort();
  controladoresFoto.clear();
  for (const url of urlsFotos.values()) URL.revokeObjectURL(url);
  urlsFotos.clear();
}

function vaciarLista() {
  liberarFotos();
  lista.replaceChildren();
  totalMostrados = 0;
  siguienteCursor = null;
  resumen.textContent = '';
  contenedorMas.hidden = true;
  masError.textContent = '';
}

function actualizarResumen() {
  if (!totalMostrados) {
    resumen.textContent = '';
    return;
  }
  const plural = totalMostrados === 1 ? 'reporte' : 'reportes';
  resumen.textContent = 'Mostrando ' + totalMostrados + ' ' + plural +
    (siguienteCursor ? '. Hay más reportes disponibles.' : '.');
}

/* ---------- Sesión ---------- */

function cerrarSesion(mensaje = '') {
  generacion++;
  controladorCarga?.abort();
  clave = null;
  vaciarLista();
  mostrarSolo(null);
  seccionReportes.hidden = true;
  botonSalir.hidden = true;
  seccionAcceso.hidden = false;
  entradaClave.value = '';
  if (mensaje) {
    accesoErrorTexto.textContent = mensaje;
    accesoError.hidden = false;
  }
  entradaClave.focus();
}

async function alIngresar(evento) {
  evento.preventDefault();
  if (botonIngresar.disabled) return;
  accesoError.hidden = true;
  const valor = entradaClave.value.trim();
  if (!valor) {
    claveError.textContent = 'Escribe la clave de acceso.';
    entradaClave.setAttribute('aria-invalid', 'true');
    entradaClave.focus();
    return;
  }
  if (/\s/.test(valor)) {
    claveError.textContent = 'La clave no debe contener espacios.';
    entradaClave.setAttribute('aria-invalid', 'true');
    entradaClave.focus();
    return;
  }
  claveError.textContent = '';
  entradaClave.removeAttribute('aria-invalid');

  ponerOcupado(botonIngresar, $('ingresar-girador'), $('ingresar-texto'), true, 'Verificando…', 'Ingresar');
  try {
    const datos = await listarReportes(valor);
    clave = valor;
    entradaClave.value = '';
    seccionAcceso.hidden = true;
    seccionReportes.hidden = false;
    botonSalir.hidden = false;
    vaciarLista();
    generacion++;
    pintarPagina(datos);
    $('titulo-reportes').focus();
  } catch (error) {
    accesoErrorTexto.textContent = error.estado === 401
      ? 'La clave de acceso es incorrecta.'
      : error.message;
    accesoError.hidden = false;
    entradaClave.select();
  } finally {
    ponerOcupado(botonIngresar, $('ingresar-girador'), $('ingresar-texto'), false, '', 'Ingresar');
  }
}

/* ---------- Listado ---------- */

async function cargarDesdeInicio() {
  if (!clave) return;
  const miGeneracion = ++generacion;
  controladorCarga?.abort();
  controladorCarga = new AbortController();
  vaciarLista();
  mostrarSolo('cargando');
  botonActualizar.disabled = true;

  try {
    const datos = await listarReportes(clave, { signal: controladorCarga.signal });
    if (miGeneracion !== generacion) return;
    pintarPagina(datos);
  } catch (error) {
    if (miGeneracion !== generacion || error.name === 'AbortError') return;
    if (error.estado === 401) return cerrarSesion('La sesión ya no es válida. Ingresa la clave de nuevo.');
    estadoErrorTexto.textContent = error.message;
    mostrarSolo('error');
  } finally {
    if (miGeneracion === generacion) botonActualizar.disabled = false;
  }
}

async function cargarMas() {
  if (!clave || !siguienteCursor || botonMas.disabled) return;
  const miGeneracion = generacion;
  masError.textContent = '';
  ponerOcupado(botonMas, $('cargar-mas-girador'), $('cargar-mas-texto'), true, 'Cargando…', 'Cargar más reportes');
  controladorCarga = new AbortController();
  const primerNuevo = totalMostrados;

  try {
    const datos = await listarReportes(clave, { cursor: siguienteCursor, signal: controladorCarga.signal });
    if (miGeneracion !== generacion) return;
    pintarPagina(datos);
    // Lleva el foco al primer reporte nuevo para que el teclado continúe desde ahí.
    lista.children[primerNuevo]?.querySelector('button')?.focus();
  } catch (error) {
    if (miGeneracion !== generacion || error.name === 'AbortError') return;
    if (error.estado === 401) return cerrarSesion('La sesión ya no es válida. Ingresa la clave de nuevo.');
    masError.textContent = error.message;
  } finally {
    ponerOcupado(botonMas, $('cargar-mas-girador'), $('cargar-mas-texto'), false, '', 'Cargar más reportes');
  }
}

function pintarPagina(datos) {
  const reportes = Array.isArray(datos?.reportes) ? datos.reportes : [];
  siguienteCursor = typeof datos?.siguienteCursor === 'string' && datos.siguienteCursor ? datos.siguienteCursor : null;

  const fragmento = document.createDocumentFragment();
  for (const reporte of reportes) fragmento.append(crearTarjeta(reporte));
  lista.append(fragmento);
  totalMostrados += reportes.length;

  mostrarSolo(totalMostrados ? null : 'vacio');
  contenedorMas.hidden = !siguienteCursor;
  actualizarResumen();
}

function crearTarjeta(reporte) {
  const nodo = plantilla.content.firstElementChild.cloneNode(true);
  const campo = nombre => nodo.querySelector('[data-campo="' + nombre + '"]');
  const id = String(reporte.id ?? '');

  // El contenido ciudadano siempre se inserta como texto.
  campo('folio').textContent = id;
  campo('descripcion').textContent = String(reporte.descripcion ?? '');
  const fecha = campo('fecha');
  fecha.textContent = formatearFecha(reporte.creadoEn);
  if (reporte.creadoEn) fecha.dateTime = String(reporte.creadoEn);

  const boton = nodo.querySelector('[data-accion="foto"]');
  const contenedorFoto = campo('contenedor-foto');
  const idContenedor = 'foto-' + id;
  contenedorFoto.id = idContenedor;
  boton.setAttribute('aria-controls', idContenedor);
  boton.setAttribute('aria-label', 'Ver fotografía del reporte ' + id);
  boton.addEventListener('click', () => alternarFoto(reporte, nodo));
  return nodo;
}

/* ---------- Fotografías ---------- */

function cerrarFoto(id, nodo) {
  const url = urlsFotos.get(id);
  if (url) URL.revokeObjectURL(url);
  urlsFotos.delete(id);
  const contenedor = nodo.querySelector('[data-campo="contenedor-foto"]');
  contenedor.replaceChildren();
  contenedor.hidden = true;
  const boton = nodo.querySelector('[data-accion="foto"]');
  boton.setAttribute('aria-expanded', 'false');
  boton.setAttribute('aria-label', 'Ver fotografía del reporte ' + id);
  nodo.querySelector('[data-campo="texto-foto"]').textContent = 'Ver fotografía';
}

async function alternarFoto(reporte, nodo) {
  const id = String(reporte.id ?? '');
  const boton = nodo.querySelector('[data-accion="foto"]');
  const girador = boton.querySelector('.girador');
  const texto = nodo.querySelector('[data-campo="texto-foto"]');
  const contenedor = nodo.querySelector('[data-campo="contenedor-foto"]');
  const errorFoto = nodo.querySelector('[data-campo="error-foto"]');

  if (urlsFotos.has(id)) {
    cerrarFoto(id, nodo);
    return;
  }
  if (controladoresFoto.has(id) || !clave) return;

  errorFoto.hidden = true;
  const controlador = new AbortController();
  controladoresFoto.set(id, controlador);
  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');
  girador.hidden = false;
  texto.textContent = 'Cargando fotografía…';

  try {
    const blob = await obtenerFoto(clave, reporte.fotoUrl, { signal: controlador.signal });
    if (controlador.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    urlsFotos.set(id, url);
    const imagen = document.createElement('img');
    imagen.alt = 'Fotografía adjunta al reporte ' + id;
    imagen.decoding = 'async';
    imagen.src = url;
    contenedor.replaceChildren(imagen);
    contenedor.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    boton.setAttribute('aria-label', 'Ocultar fotografía del reporte ' + id);
    texto.textContent = 'Ocultar fotografía';
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.estado === 401) return cerrarSesion('La sesión ya no es válida. Ingresa la clave de nuevo.');
    errorFoto.textContent = error.estado === 404
      ? 'No se encontró la fotografía de este reporte.'
      : error.message;
    errorFoto.hidden = false;
    texto.textContent = 'Ver fotografía';
  } finally {
    if (controladoresFoto.get(id) === controlador) controladoresFoto.delete(id);
    boton.disabled = false;
    boton.setAttribute('aria-busy', 'false');
    girador.hidden = true;
  }
}

/* ---------- Eventos ---------- */

formularioAcceso.addEventListener('submit', alIngresar);
entradaClave.addEventListener('input', () => {
  if (entradaClave.getAttribute('aria-invalid') === 'true') {
    claveError.textContent = '';
    entradaClave.removeAttribute('aria-invalid');
  }
});
botonSalir.addEventListener('click', () => cerrarSesion());
botonActualizar.addEventListener('click', cargarDesdeInicio);
$('reintentar').addEventListener('click', cargarDesdeInicio);
botonMas.addEventListener('click', cargarMas);
window.addEventListener('pagehide', evento => {
  if (!evento.persisted) liberarFotos();
});

entradaClave.focus();
