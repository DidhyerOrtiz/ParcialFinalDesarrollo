# Contrato de integración · Atención ciudadana municipal

## Encargo para Claude

Implementa el frontend del portal municipal en `feat/frontend` y abre un PR a `develop`. Trabaja dentro de `frontend/` con HTML, CSS y JavaScript nativo. La API correrá en el mismo origen y servirá esa carpeta. Entradas: `frontend/index.html` para `/` y `frontend/admin.html` para `/admin`. Usa rutas absolutas para recursos y llamadas REST con `fetch`.

| Elemento | Color |
|---|---|
| Fondo gris Tormenta | `#5A6068` |
| Paneles negro mate | `#1C1D20` |
| Acentos naranja Seguridad | `#FF5F00` |

Usa texto claro sobre el gris y el negro, y texto negro mate sobre botones naranjas. Interfaz en español, adaptable a móvil, con foco visible.

- Portal público: pide descripción y fotografía, muestra una vista previa, valida campos, evita envíos duplicados mientras se procesa y confirma el registro mostrando el folio devuelto por la API. Conserva el borrador ante errores.
- Panel municipal: pide la clave de acceso, consulta la API al ingresar, muestra los reportes con fecha, folio y descripción original y permite abrir la foto asociada. Incluye estados de carga, vacío y error, y un control para cargar más si la API devuelve cursor. Mantén la clave en memoria. Para mostrar las fotos, pídelas con `fetch` autenticado y usa `URL.createObjectURL` sobre el Blob, liberándolo al descartarlo. Inserta el contenido ciudadano como texto.
- Para las dos pantallas usa los datos reales de la API. El backend y la configuración Firebase se trabajan en `feat/backend`.

## API

### POST /api/reportes

Solicitud `multipart/form-data` con exactamente dos campos:

| Campo | Tipo | Validación |
|---|---|---|
| `descripcion` | Texto | Entre 10 y 2000 caracteres tras eliminar espacios iniciales y finales |
| `foto` | Archivo | JPEG, PNG o WebP, máximo 700 KiB (716800 bytes) |

Usa `FormData` y deja que el navegador genere el encabezado Content-Type. Si la imagen supera el límite, puedes redimensionarla y exportarla a JPEG o WebP en el navegador antes de enviarla. La API devuelve HTTP 201 cuando Firestore confirma el registro.

```json
{"reporte":{"id":"Abc123","descripcion":"Hay una fuga de agua en la esquina.","creadoEn":"2026-11-14T15:30:00.000Z","fotoUrl":"/api/reportes/Abc123/foto"}}
```

### GET /api/reportes

Envía `Authorization: Bearer <clave>`. Devuelve los reportes del más reciente al más antiguo con la misma estructura del POST. Por defecto devuelve 20 y acepta `limite` entre 1 y 50. Si `siguienteCursor` trae un valor, envíalo como `cursor` en la siguiente petición mediante `URLSearchParams`.

```json
{"reportes":[{"id":"Abc123","descripcion":"Hay una fuga de agua en la esquina.","creadoEn":"2026-11-14T15:30:00.000Z","fotoUrl":"/api/reportes/Abc123/foto"}],"siguienteCursor":null}
```

### GET /api/reportes/:id/foto

Envía el mismo encabezado de autorización. Devuelve la fotografía binaria con su Content-Type original.

### Errores

```json
{"error":{"codigo":"DESCRIPCION_INVALIDA","mensaje":"La descripción debe tener entre 10 y 2000 caracteres."}}
```

| HTTP | Significado |
|---|---|
| 400 | Formulario o parámetros inválidos |
| 401 | Clave de administración inválida o ausente |
| 404 | Fotografía o ruta inexistente |
| 413 | Fotografía o solicitud demasiado grande |
| 415 | Formato de solicitud o imagen no admitido |
| 503 | Almacenamiento temporalmente no disponible |

## Integración

Los PR de `feat/frontend` y `feat/backend` apuntan a `develop`. Una vez integrada y verificada la aplicación, abre el PR de `develop` a `main`.

## Verificación conjunta

Registrar un reporte con fotografía, comprobar que aparece el folio, abrir el panel con la clave, refrescar y verificar el mismo folio, la descripción original y la fotografía recuperada desde Firestore.
