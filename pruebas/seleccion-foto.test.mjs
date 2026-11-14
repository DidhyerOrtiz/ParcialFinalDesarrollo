import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSeleccionFoto } from '../public/js/seleccion-foto.js';

// Preparación controlada: cada foto queda pendiente hasta que la prueba la resuelve.
function preparacionManual() {
  const pendientes = new Map();
  return {
    preparar(original) {
      return new Promise((resolver, rechazar) => pendientes.set(original, { resolver, rechazar }));
    },
    resolver(original, archivo) {
      pendientes.get(original).resolver(archivo);
    },
    rechazar(original, error) {
      pendientes.get(original).rechazar(error);
    }
  };
}

const tic = () => new Promise(resolver => setImmediate(resolver));

function estadoDeEspera(promesa) {
  let resultado = null;
  promesa.then(valor => { resultado = valor; });
  return () => resultado;
}

test('A termina después de limpiar y elegir B: el envío espera a B y nunca usa A', async () => {
  const manual = preparacionManual();
  const publicados = [];
  const seleccion = crearSeleccionFoto({ preparar: manual.preparar, alCambiar: e => publicados.push(e) });
  const fotoA = { name: 'a.heic' };
  const fotoB = { name: 'b.heic' };
  const listaA = { name: 'a.jpg' };
  const listaB = { name: 'b.jpg' };

  seleccion.seleccionar(fotoA);
  seleccion.limpiar();
  seleccion.seleccionar(fotoB);

  const resultadoEspera = estadoDeEspera(seleccion.esperar());

  manual.resolver(fotoA, listaA);
  await tic();

  assert.equal(seleccion.estado.fase, 'preparando');
  assert.equal(seleccion.estado.original, fotoB);
  assert.equal(seleccion.estado.archivo, null);
  assert.equal(resultadoEspera(), null, 'el envío debe seguir esperando a B');
  assert.ok(!publicados.some(e => e.archivo === listaA), 'A nunca debe llegar a la vista previa');

  manual.resolver(fotoB, listaB);
  await tic();

  assert.equal(seleccion.estado.fase, 'lista');
  assert.equal(seleccion.estado.original, fotoB);
  assert.equal(seleccion.estado.archivo, listaB);
  assert.equal(resultadoEspera()?.archivo, listaB, 'el envío debe usar el archivo de B');
  assert.equal(publicados.at(-1).archivo, listaB, 'la vista previa debe mostrar B');
});

test('A termina después de elegir B sin limpiar: se descarta A', async () => {
  const manual = preparacionManual();
  const seleccion = crearSeleccionFoto({ preparar: manual.preparar });
  const fotoA = { name: 'a' };
  const fotoB = { name: 'b' };

  seleccion.seleccionar(fotoA);
  seleccion.seleccionar(fotoB);
  manual.resolver(fotoA, 'A');
  await tic();
  assert.equal(seleccion.estado.fase, 'preparando');

  manual.resolver(fotoB, 'B');
  await tic();
  assert.equal(seleccion.estado.archivo, 'B');
});

test('un error tardío de A no reemplaza a B', async () => {
  const manual = preparacionManual();
  const seleccion = crearSeleccionFoto({ preparar: manual.preparar });
  const fotoA = { name: 'a' };
  const fotoB = { name: 'b' };

  seleccion.seleccionar(fotoA);
  seleccion.limpiar();
  seleccion.seleccionar(fotoB);
  manual.resolver(fotoB, 'B');
  await tic();
  manual.rechazar(fotoA, new Error('falló A'));
  await tic();

  assert.equal(seleccion.estado.fase, 'lista');
  assert.equal(seleccion.estado.archivo, 'B');
});

test('limpiar mientras se espera libera el envío sin foto', async () => {
  const manual = preparacionManual();
  const seleccion = crearSeleccionFoto({ preparar: manual.preparar });
  const fotoA = { name: 'a' };

  seleccion.seleccionar(fotoA);
  const espera = seleccion.esperar();
  seleccion.limpiar();

  const estado = await espera;
  assert.equal(estado.fase, 'vacia');
  assert.equal(estado.archivo, null);

  manual.resolver(fotoA, 'A');
  await tic();
  assert.equal(seleccion.estado.fase, 'vacia');
});
