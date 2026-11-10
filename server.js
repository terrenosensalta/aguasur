/**
 * AGUASUR - Servidor Backend API REST
 * Node.js nativo (sin dependencias externas pesadas)
 * Persistencia en archivo JSON local: data/aguasur-db.json
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'aguasur-db.json');

// Plantilla inicial de datos predefinidos
const SEED_DATA = {
  products: [
    { id: 'P1', sku: 'AG-20L', name: 'Bidón Agua 20L', category: 'Agua Retornable', stock: 120, empty: 35, min: 25, price: 3800, returnable: true },
    { id: 'P4', sku: 'AG-6LD', name: 'Bidón Descartable 6L', category: 'Descartables', stock: 40, empty: 0, min: 15, price: 2100, returnable: false },
    { id: 'P5', sku: 'DP-FC', name: 'Abono Dispenser Frío/Calor', category: 'Dispensers', stock: 10, empty: 0, min: 3, price: 12500, returnable: false }
  ],
  clients: [
    { id: 'C1', name: 'Mariana Gómez', phone: '5491145550101', address: 'Las Heras 1420', obs: 'Casa frente a la plaza. Tocar timbre portón.' },
    { id: 'C2', name: 'Gimnasio Olimpo', phone: '5491145550102', address: 'Av. Belgrano 540', obs: 'Entregar en recepción planta baja de 9 a 13hs.' }
  ],
  orders: [
    {
      id: 'PED-101',
      date: new Date().toLocaleDateString('es-AR'),
      clientId: 'C1',
      clientName: 'Mariana Gómez',
      phone: '5491145550101',
      address: 'Las Heras 1420',
      note: 'Dejar en la galería',
      items: [{ productId: 'P1', name: 'Bidón Agua 20L', qty: 2, price: 3800 }],
      hasEmpties: true,
      returnedBottles: 2,
      newBottleCost: 0,
      total: 7600,
      paymentMethod: 'Transferencia / MP',
      paymentStatus: 'Realizado',
      dueDate: new Date().toISOString().slice(0, 10),
      status: 'Entregado',
      paymentId: 'PAG-501',
      invoiceId: 'CMP-00101'
    },
    {
      id: 'PED-102',
      date: new Date().toLocaleDateString('es-AR'),
      clientId: 'C2',
      clientName: 'Gimnasio Olimpo',
      phone: '5491145550102',
      address: 'Av. Belgrano 540',
      note: 'Pago programado para fin de semana',
      items: [{ productId: 'P1', name: 'Bidón Agua 20L', qty: 4, price: 3800 }],
      hasEmpties: true,
      returnedBottles: 4,
      newBottleCost: 0,
      total: 15200,
      paymentMethod: 'Transferencia / MP',
      paymentStatus: 'Adeudado',
      dueDate: new Date(Date.now() + 3*86400000).toISOString().slice(0, 10),
      status: 'Pendiente',
      paymentId: 'PAG-502',
      invoiceId: 'CMP-00102'
    }
  ],
  payments: [
    { id: 'PAG-501', orderId: 'PED-101', clientId: 'C1', clientName: 'Mariana Gómez', phone: '5491145550101', concept: '2x Bidón Agua 20L (2 envases devueltos) (PED-101)', amount: 7600, method: 'Transferencia / MP', status: 'Realizado', dueDate: new Date().toISOString().slice(0, 10), paidDate: new Date().toISOString().slice(0, 10) },
    { id: 'PAG-502', orderId: 'PED-102', clientId: 'C2', clientName: 'Gimnasio Olimpo', phone: '5491145550102', concept: '4x Bidón Agua 20L (4 envases devueltos) (PED-102)', amount: 15200, method: 'Transferencia / MP', status: 'Adeudado', dueDate: new Date(Date.now() + 3*86400000).toISOString().slice(0, 10), paidDate: '' }
  ],
  invoices: [
    { id: 'CMP-00101', type: 'Recibo X', date: new Date().toLocaleDateString('es-AR'), clientName: 'Mariana Gómez', orderId: 'PED-101', concept: '2x Bidón Agua 20L (2 envases devueltos)', total: 7600, status: 'Realizado' },
    { id: 'CMP-00102', type: 'Recibo X', date: new Date().toLocaleDateString('es-AR'), clientName: 'Gimnasio Olimpo', orderId: 'PED-102', concept: '4x Bidón Agua 20L (4 envases devueltos)', total: 15200, status: 'Adeudado' }
  ],
  expenses: [
    { id: 'GAS-201', date: new Date().toISOString().slice(0, 10), category: 'Combustible / Reparto', concept: 'Gasoil Reparto YPF', method: 'Efectivo', amount: 12000 }
  ]
};

// Cargar o inicializar base de datos
function loadDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(SEED_DATA, null, 2), 'utf-8');
    return JSON.parse(JSON.stringify(SEED_DATA));
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error al leer base de datos, usando predefinidos:', err);
    return JSON.parse(JSON.stringify(SEED_DATA));
  }
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando en archivo:', err);
  }
}

let db = loadDatabase();

// Servidor HTTP con CORS y API REST
const server = http.createServer((req, res) => {
  // Encabezados CORS para acceso local y remoto
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Servir archivos estáticos del frontend
  if (req.method === 'GET' && !pathname.startsWith('/api/')) {
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Archivo no encontrado');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
    return;
  }

  // Rutas API REST
  const sendJSON = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  const getBody = (callback) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        callback(null, parsed);
      } catch (e) {
        callback(e);
      }
    });
  };

  // GET /api/state -> Retorna estado completo predefinido + guardado
  if (pathname === '/api/state' && req.method === 'GET') {
    return sendJSON(200, { success: true, data: db });
  }

  // POST /api/state/sync -> Sincronización completa desde dispositivo local
  if (pathname === '/api/state/sync' && req.method === 'POST') {
    return getBody((err, payload) => {
      if (err || !payload) return sendJSON(400, { success: false, message: 'JSON inválido' });
      db = payload;
      saveDatabase(db);
      return sendJSON(200, { success: true, message: 'Datos sincronizados exitosamente' });
    });
  }

  // GET /api/orders
  if (pathname === '/api/orders' && req.method === 'GET') {
    return sendJSON(200, db.orders || []);
  }

  // POST /api/orders -> Crear pedido con lógica de envases
  if (pathname === '/api/orders' && req.method === 'POST') {
    return getBody((err, newOrder) => {
      if (err || !newOrder) return sendJSON(400, { success: false, message: 'Datos de pedido inválidos' });
      newOrder.id = newOrder.id || `PED-${105 + (db.orders ? db.orders.length : 0)}`;
      newOrder.date = newOrder.date || new Date().toLocaleDateString('es-AR');

      db.orders = db.orders || [];
      db.orders.unshift(newOrder);

      // Si se incluye cliente nuevo, guardarlo en la base
      if (newOrder.newClient && newOrder.newClient.name) {
        db.clients = db.clients || [];
        const exists = db.clients.some(c => c.id === newOrder.newClient.id);
        if (!exists) db.clients.unshift(newOrder.newClient);
      }

      saveDatabase(db);
      return sendJSON(201, { success: true, order: newOrder });
    });
  }

  // GET /api/clients
  if (pathname === '/api/clients' && req.method === 'GET') {
    return sendJSON(200, db.clients || []);
  }

  // POST /api/clients -> Crear cliente
  if (pathname === '/api/clients' && req.method === 'POST') {
    return getBody((err, newClient) => {
      if (err || !newClient) return sendJSON(400, { success: false, message: 'Datos de cliente inválidos' });
      newClient.id = newClient.id || `C${Date.now().toString().slice(-4)}`;
      db.clients = db.clients || [];
      db.clients.unshift(newClient);
      saveDatabase(db);
      return sendJSON(201, { success: true, client: newClient });
    });
  }

  // Ruta por defecto 404
  sendJSON(404, { success: false, message: 'Ruta API no encontrada' });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`💧 Backend de Aguasur iniciado en: http://localhost:${PORT}`);
  console.log(`📊 Base de datos local: ${DB_PATH}`);
  console.log(`====================================================`);
});
