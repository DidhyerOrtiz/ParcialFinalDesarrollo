import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createApp } from './app.js';
import { firestoreReportStore } from './report-store.js';

const { FIREBASE_PROJECT_ID, FIRESTORE_EMULATOR_HOST, ADMIN_KEY, PORT = '3000' } = process.env;
if (!FIREBASE_PROJECT_ID?.trim() || !ADMIN_KEY || /\s/.test(ADMIN_KEY)) {
  throw new Error('Configura FIREBASE_PROJECT_ID y ADMIN_KEY sin espacios en .env.');
}

const firebase = initializeApp({
  projectId: FIREBASE_PROJECT_ID,
  ...(FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() })
});
const app = createApp({ store: firestoreReportStore(getFirestore(firebase)), adminKey: ADMIN_KEY });
app.listen(Number(PORT), () => console.log('Portal municipal disponible en el puerto ' + PORT));
