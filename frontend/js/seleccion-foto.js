// Controla la fotografía elegida en el portal y su preparación asíncrona.
//
// Cada selección o limpieza avanza `turno`, que nunca retrocede. Una preparación
// solo publica su resultado si su turno sigue siendo el vigente, así que una foto
// anterior que termine tarde no puede reemplazar a la más reciente.
//
// Fases: 'vacia' | 'preparando' | 'lista' | 'error'.

const VACIA = Object.freeze({ fase: 'vacia', original: null, archivo: null, error: null });

export function crearSeleccionFoto({ preparar, alCambiar = () => {} }) {
  let turno = 0;
  let estado = VACIA;
  let esperas = [];

  function publicar(nuevo) {
    estado = Object.freeze(nuevo);
    alCambiar(estado);
    if (estado.fase !== 'preparando' && esperas.length) {
      const pendientes = esperas;
      esperas = [];
      for (const resolver of pendientes) resolver(estado);
    }
  }

  async function seleccionar(original) {
    const miTurno = ++turno;
    if (!original) {
      publicar(VACIA);
      return;
    }
    publicar({ fase: 'preparando', original, archivo: null, error: null });

    let siguiente;
    try {
      const archivo = await preparar(original);
      siguiente = { fase: 'lista', original, archivo, error: null };
    } catch (error) {
      siguiente = { fase: 'error', original, archivo: null, error };
    }
    if (miTurno !== turno) return; // Otra selección o limpieza ocurrió mientras tanto.
    publicar(siguiente);
  }

  function limpiar() {
    turno++;
    publicar(VACIA);
  }

  // Resuelve con el estado definitivo de la selección vigente. Si mientras se
  // espera el usuario elige otra foto, sigue esperando a esa nueva selección.
  function esperar() {
    if (estado.fase !== 'preparando') return Promise.resolve(estado);
    return new Promise(resolver => esperas.push(resolver));
  }

  return {
    seleccionar,
    limpiar,
    esperar,
    get estado() {
      return estado;
    }
  };
}
