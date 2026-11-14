import { FieldPath, Timestamp } from 'firebase-admin/firestore';

export function firestoreReportStore(db) {
  const reports = db.collection('reportes');

  return {
    async create({ descripcion, foto, tipo }) {
      const report = reports.doc();
      const creadoEn = Timestamp.fromMillis(Date.now());
      const batch = db.batch();
      batch.create(report, { descripcion, creadoEn });
      batch.create(report.collection('archivos').doc('foto'), { foto, tipo });
      await batch.commit();
      return { id: report.id, descripcion, creadoEn: creadoEn.toDate().toISOString() };
    },

    async list(limite, cursor) {
      let query = reports
        .orderBy('creadoEn', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')
        .select('descripcion', 'creadoEn')
        .limit(limite + 1);

      if (cursor) {
        query = query.startAfter(Timestamp.fromMillis(cursor.time), cursor.id);
      }

      const snapshot = await query.get();
      const items = snapshot.docs.slice(0, limite).map(doc => ({
        id: doc.id,
        descripcion: doc.get('descripcion'),
        creadoEn: doc.get('creadoEn').toDate().toISOString()
      }));
      const last = items.at(-1);
      return {
        items,
        next: snapshot.size > limite ? { time: Date.parse(last.creadoEn), id: last.id } : null
      };
    },

    async photo(id) {
      const doc = await reports.doc(id).collection('archivos').doc('foto').get();
      return doc.exists ? doc.data() : null;
    }
  };
}
