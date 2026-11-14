# Portal municipal de atención ciudadana

Portal público y panel municipal sobre una API REST de Node.js y Cloud Firestore. Las rutas y el intercambio de datos están en [CONTRATO.md](CONTRATO.md).

## Configurar y ejecutar

1. Crea un proyecto Firebase en el plan Spark con una base de datos **Cloud Firestore Standard** en modo producción. Usa la base predeterminada.
2. En **Configuración del proyecto → Cuentas de servicio**, genera una clave privada para Firebase Admin y guárdala fuera del repositorio. El navegador envía solicitudes a la API y el servidor se autentica en Firestore. Mantén cerradas las reglas de acceso directo de clientes a la base.
3. Copia `.env.example` a `.env`. Configura `FIREBASE_PROJECT_ID` con el ID del proyecto, `GOOGLE_APPLICATION_CREDENTIALS` con la ruta absoluta al JSON de la cuenta de servicio y `ADMIN_KEY` con una clave larga aleatoria sin espacios. Si el servidor proporciona credenciales de aplicación, puedes omitir `GOOGLE_APPLICATION_CREDENTIALS`.
4. Con Node.js 22 o posterior, ejecuta `npm ci` y `npm start`. Abre `http://localhost:3000/` y `http://localhost:3000/admin`. Para publicar el panel usa HTTPS.

## Persistencia

Cada reporte guarda su descripción y fecha en `reportes/{id}` y su foto binaria en `reportes/{id}/archivos/foto`. Firestore confirma ambos documentos en una sola escritura por lotes. Así el listado puede mostrar la descripción original y descargar cada foto cuando se solicite. El límite de 700 KiB por foto deja margen frente al límite de tamaño del documento de Firestore y permite usar la base de datos del plan Spark.

Para probar con Firebase Emulator Suite, inicia el emulador de Firestore y configura `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` y el mismo `FIREBASE_PROJECT_ID` en la aplicación.

## Publicar en Vercel

Importa el repositorio en Vercel con la rama de producción `main` y directorio raíz en la raíz del repositorio. El punto de entrada del backend es `server.js`. Vercel sirve los archivos de `public/` y la API desde el mismo dominio.

Agrega estas variables al entorno **Production** de Vercel:

| Variable | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | ID del proyecto de Firebase |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Contenido completo del JSON de la cuenta de servicio. Configúralo como variable sensible. |
| `ADMIN_KEY` | Clave larga y aleatoria sin espacios para ingresar al panel municipal. Configúrala como variable sensible. |

Con la URL de producción, registra un reporte en `/`, verifica el folio y busca ese mismo folio y su foto en `/admin`.
