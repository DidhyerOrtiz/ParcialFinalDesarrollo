import app from '../server.js';

const { PORT = '3000' } = process.env;
app.listen(Number(PORT), () => console.log('Portal municipal disponible en el puerto ' + PORT));
