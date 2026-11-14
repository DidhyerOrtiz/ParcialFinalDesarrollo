import { resolve } from 'node:path';
import express from 'express';
import multer from 'multer';
import { adminAuth } from './admin-auth.js';

const PHOTO_LIMIT = 700 * 1024;
const REPORT_ID = /^[A-Za-z0-9]{20}$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_LIMIT + 1, fieldSize: 8000, files: 1, fields: 1, fieldNameSize: 32 }
}).single('foto');

function fail(res, status, codigo, mensaje) {
  return res.status(status).json({ error: { codigo, mensaje } });
}

function photoType(bytes) {
  if (bytes.length >= 12 &&
      bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 &&
      bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    return 'image/jpeg';
  }
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(PNG_SIGNATURE) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' &&
      bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') {
    return 'image/png';
  }
  if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.readUInt32LE(4) === bytes.length - 8 &&
      bytes.toString('ascii', 8, 12) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) {
    return 'image/webp';
  }
  return null;
}

function present(report) {
  return { ...report, fotoUrl: '/api/reportes/' + report.id + '/foto' };
}

function parseCursor(raw) {
  if (typeof raw !== 'string' || raw.length > 120 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new Error('Cursor inválido');
  }
  const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  if (!cursor || typeof cursor.id !== 'string' || !REPORT_ID.test(cursor.id) ||
      !Number.isSafeInteger(cursor.time) || cursor.time < 0 || cursor.time > 253402300799999) {
    throw new Error('Cursor inválido');
  }
  return cursor;
}

export function createApp({
  store, adminKey, adminEmail = 'admin@municipal.example', frontendDir = resolve('public'), app = express()
}) {
  const auth = adminAuth({ email: adminEmail, password: adminKey });
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  function requireAdmin(req, res, next) {
    const provided = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '');
    if (!provided || !auth.verify(provided[1])) {
      res.set('WWW-Authenticate', 'Bearer');
      return fail(res, 401, 'SESION_INVALIDA', 'Inicia sesión para consultar los reportes.');
    }
    next();
  }

  const parseLogin = express.json({ limit: '4kb' });
  app.post('/api/admin/login', (req, res) => {
    parseLogin(req, res, error => {
      if (error?.status === 413) {
        return fail(res, 413, 'SOLICITUD_GRANDE', 'La solicitud supera el tamaño permitido.');
      }
      const { correo, contrasena } = req.body ?? {};
      if (error || typeof correo !== 'string' || typeof contrasena !== 'string' ||
          correo.length > 254 || contrasena.length > 512) {
        return fail(res, 400, 'LOGIN_INVALIDO', 'Envía un correo y una contraseña válidos.');
      }
      const token = auth.login({ correo, contrasena });
      if (!token) {
        return fail(res, 401, 'CREDENCIALES_INVALIDAS', 'El correo o la contraseña son incorrectos.');
      }
      return res.json({ token });
    });
  });

  app.post('/api/reportes', (req, res, next) => {
    if (!req.is('multipart/form-data')) {
      return fail(res, 415, 'FORMATO_INVALIDO', 'Envía la descripción y la foto como formulario.');
    }
    if (Number(req.get('content-length')) > PHOTO_LIMIT + 16 * 1024) {
      return fail(res, 413, 'SOLICITUD_GRANDE', 'La solicitud supera el tamaño permitido.');
    }
    upload(req, res, error => {
      if (error?.code === 'LIMIT_FILE_SIZE') {
        return fail(res, 413, 'FOTO_GRANDE', 'La foto debe pesar como máximo 700 KiB.');
      }
      if (error) {
        return fail(res, 400, 'FORMULARIO_INVALIDO', 'Envía una descripción y una sola foto.');
      }
      next();
    });
  }, async (req, res) => {
    const descripcion = req.body?.descripcion?.trim?.();
    if (typeof descripcion !== 'string' || descripcion.length < 10 || descripcion.length > 2000) {
      return fail(res, 400, 'DESCRIPCION_INVALIDA', 'La descripción debe tener entre 10 y 2000 caracteres.');
    }
    if (!req.file?.size) {
      return fail(res, 400, 'FOTO_REQUERIDA', 'Adjunta una fotografía.');
    }
    if (req.file.size > PHOTO_LIMIT) {
      return fail(res, 413, 'FOTO_GRANDE', 'La foto debe pesar como máximo 700 KiB.');
    }
    const tipo = photoType(req.file.buffer);
    if (!tipo) {
      return fail(res, 415, 'FOTO_INVALIDA', 'Adjunta una imagen JPEG, PNG o WebP válida.');
    }

    const reporte = await store.create({ descripcion, foto: req.file.buffer, tipo });
    res.status(201).json({ reporte: present(reporte) });
  });

  app.get('/api/reportes', requireAdmin, async (req, res) => {
    const rawLimit = req.query.limite ?? '20';
    if (typeof rawLimit !== 'string' || !/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit)) {
      return fail(res, 400, 'LIMITE_INVALIDO', 'El límite debe estar entre 1 y 50.');
    }
    let cursor;
    if (req.query.cursor !== undefined) {
      try {
        cursor = parseCursor(req.query.cursor);
      } catch {
        return fail(res, 400, 'CURSOR_INVALIDO', 'El cursor de paginación es inválido.');
      }
    }

    const { items, next } = await store.list(Number(rawLimit), cursor);
    res.json({
      reportes: items.map(present),
      siguienteCursor: next ? Buffer.from(JSON.stringify(next)).toString('base64url') : null
    });
  });

  app.get('/api/reportes/:id/foto', requireAdmin, async (req, res) => {
    const photo = REPORT_ID.test(req.params.id) && await store.photo(req.params.id);
    if (!photo) {
      return fail(res, 404, 'FOTO_NO_ENCONTRADA', 'No se encontró la fotografía.');
    }
    res.type(photo.tipo).send(Buffer.from(photo.foto));
  });

  app.use('/api', (_req, res) => fail(res, 404, 'RUTA_NO_ENCONTRADA', 'La ruta no existe.'));
  app.get('/admin', (_req, res) => res.sendFile('admin.html', { root: frontendDir }));
  app.use(express.static(frontendDir));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (!req.path.startsWith('/api/')) return next(error);
    console.error('Error de almacenamiento', error.code ?? error.name);
    return fail(res, 503, 'ALMACENAMIENTO_NO_DISPONIBLE', 'No se pudo acceder al almacenamiento. Intenta de nuevo.');
  });

  return app;
}
