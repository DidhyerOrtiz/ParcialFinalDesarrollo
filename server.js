import express from 'express';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createApp } from './backend/app.js';
import { firestoreReportStore } from './backend/report-store.js';

const { FIREBASE_PROJECT_ID, FIRESTORE_EMULATOR_HOST, FIREBASE_SERVICE_ACCOUNT_JSON, ADMIN_KEY } = process.env;
if (!FIREBASE_PROJECT_ID?.trim() || !ADMIN_KEY || /\s/.test(ADMIN_KEY)) {
  throw new Error('Configura FIREBASE_PROJECT_ID y ADMIN_KEY sin espacios.');
}

const options = { projectId: FIREBASE_PROJECT_ID };
if (!FIRESTORE_EMULATOR_HOST) {
  if (FIREBASE_SERVICE_ACCOUNT_JSON) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON debe contener un JSON válido.');
    }
    if (serviceAccount?.project_id !== FIREBASE_PROJECT_ID) {
      throw new Error('La cuenta de servicio debe corresponder a FIREBASE_PROJECT_ID.');
    }
    options.credential = cert(serviceAccount);
  } else {
    options.credential = applicationDefault();
  }
}

const firebase = initializeApp(options);
const store = firestoreReportStore(getFirestore(firebase));
export default createApp({ app: express(), store, adminKey: ADMIN_KEY });
