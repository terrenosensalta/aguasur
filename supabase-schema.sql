-- ============================================================================
-- AGUASUR - ESQUEMA DE BASE DE DATOS SUPABASE (PostgreSQL)
-- ============================================================================
-- Instrucciones:
-- 1. Ingresá a tu proyecto en Supabase (https://supabase.com).
-- 2. Dirigite a la sección "SQL Editor".
-- 3. Pegá todo el contenido de este archivo y ejecutalo (Run).
-- ============================================================================

-- Habilitar extensión para UUIDs si es necesario
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA: PRODUCTOS
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    empty INTEGER NOT NULL DEFAULT 0,
    min INTEGER NOT NULL DEFAULT 10,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    returnable BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. TABLA: CLIENTES
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    obs TEXT,
    bottles_on_loan INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. TABLA: PEDIDOS Y DESPACHOS
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    note TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    has_empties BOOLEAN NOT NULL DEFAULT true,
    returned_bottles INTEGER NOT NULL DEFAULT 0,
    new_bottle_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'Efectivo',
    payment_status TEXT NOT NULL DEFAULT 'Adeudado',
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'Pendiente',
    payment_id TEXT,
    invoice_id TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. TABLA: PAGOS Y COBRANZAS
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
    client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    phone TEXT,
    concept TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    method TEXT NOT NULL DEFAULT 'Efectivo',
    status TEXT NOT NULL DEFAULT 'Adeudado',
    due_date TEXT,
    paid_date TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 5. TABLA: COMPROBANTES / FACTURAS / RECIBOS X
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'Recibo X',
    date TEXT NOT NULL,
    client_name TEXT NOT NULL,
    order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
    concept TEXT NOT NULL,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Adeudado',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 6. TABLA: GASTOS OPERATIVOS
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    concept TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'Efectivo',
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Índices para optimizar búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- ============================================================================
-- POLÍTICAS DE ACCESO ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Habilitamos RLS en todas las tablas
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para la clave anónima (anon) de modo que el panel
-- pueda operar directamente desde el navegador de los operadores.
-- Si más adelante se agrega autenticación por usuario, se pueden ajustar.
DROP POLICY IF EXISTS "Permitir todo anon en products" ON products;
CREATE POLICY "Permitir todo anon en products" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo anon en clients" ON clients;
CREATE POLICY "Permitir todo anon en clients" ON clients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo anon en orders" ON orders;
CREATE POLICY "Permitir todo anon en orders" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo anon en payments" ON payments;
CREATE POLICY "Permitir todo anon en payments" ON payments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo anon en invoices" ON invoices;
CREATE POLICY "Permitir todo anon en invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo anon en expenses" ON expenses;
CREATE POLICY "Permitir todo anon en expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- DATOS SEMILLA PREDEFINIDOS (CATÁLOGO Y CLIENTES ACTIVOS AGUASUR)
-- ============================================================================
INSERT INTO products (id, sku, name, category, stock, empty, min, price, returnable)
VALUES 
    ('P1', 'AG-20L', 'Bidón Agua 20L', 'Agua Retornable', 120, 35, 25, 3800.00, true),
    ('P4', 'AG-6LD', 'Bidón Descartable 6L', 'Descartables', 40, 0, 15, 2100.00, false),
    ('P5', 'DP-FC', 'Abono Dispenser Frío/Calor', 'Dispensers', 10, 0, 3, 12500.00, false)
ON CONFLICT (id) DO UPDATE SET 
    price = EXCLUDED.price,
    name = EXCLUDED.name,
    returnable = EXCLUDED.returnable;

INSERT INTO clients (id, name, phone, address, obs, bottles_on_loan)
VALUES 
    ('C1', 'Mariana Gómez', '5491145550101', 'Las Heras 1420', 'Casa frente a la plaza. Tocar timbre portón.', 2),
    ('C2', 'Gimnasio Olimpo', '5491145550102', 'Av. Belgrano 540', 'Entregar en recepción planta baja de 9 a 13hs.', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO orders (id, date, client_id, client_name, phone, address, note, items, has_empties, returned_bottles, new_bottle_cost, total, payment_method, payment_status, due_date, status, payment_id, invoice_id)
VALUES 
    ('PED-101', '10/11/2026', 'C1', 'Mariana Gómez', '5491145550101', 'Las Heras 1420', 'Dejar en la galería', '[{"productId":"P1","name":"Bidón Agua 20L","qty":2,"price":3800}]'::jsonb, true, 2, 0.00, 7600.00, 'Transferencia / MP', 'Realizado', '2026-11-10', 'Entregado', 'PAG-501', 'CMP-00101'),
    ('PED-102', '10/11/2026', 'C2', 'Gimnasio Olimpo', '5491145550102', 'Av. Belgrano 540', 'Pago programado para fin de semana', '[{"productId":"P1","name":"Bidón Agua 20L","qty":4,"price":3800}]'::jsonb, true, 4, 0.00, 15200.00, 'Transferencia / MP', 'Adeudado', '2026-11-13', 'Pendiente', 'PAG-502', 'CMP-00102')
ON CONFLICT (id) DO NOTHING;

INSERT INTO payments (id, order_id, client_id, client_name, phone, concept, amount, method, status, due_date, paid_date)
VALUES 
    ('PAG-501', 'PED-101', 'C1', 'Mariana Gómez', '5491145550101', '2x Bidón Agua 20L (2 envases devueltos) (PED-101)', 7600.00, 'Transferencia / MP', 'Realizado', '2026-11-10', '2026-11-10'),
    ('PAG-502', 'PED-102', 'C2', 'Gimnasio Olimpo', '5491145550102', '4x Bidón Agua 20L (4 envases devueltos) (PED-102)', 15200.00, 'Transferencia / MP', 'Adeudado', '2026-11-13', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO invoices (id, type, date, client_name, order_id, concept, total, status)
VALUES 
    ('CMP-00101', 'Recibo X', '10/11/2026', 'Mariana Gómez', 'PED-101', '2x Bidón Agua 20L (2 envases devueltos)', 7600.00, 'Realizado'),
    ('CMP-00102', 'Recibo X', '10/11/2026', 'Gimnasio Olimpo', 'PED-102', '4x Bidón Agua 20L (4 envases devueltos)', 15200.00, 'Adeudado')
ON CONFLICT (id) DO NOTHING;

INSERT INTO expenses (id, date, category, concept, method, amount)
VALUES 
    ('GAS-201', '2026-11-10', 'Combustible / Reparto', 'Gasoil Reparto YPF', 'Efectivo', 12000.00)
ON CONFLICT (id) DO NOTHING;
