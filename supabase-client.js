/**
 * AGUASUR - Conector Oficial para Supabase Database
 * Permite sincronizar y operar en tiempo real contra Supabase PostgreSQL
 * manteniendo soporte offline y fallback transparente a localStorage.
 */

const SUPABASE_CONFIG_KEY = 'aguasur_supabase_config';

const SupabaseService = {
  client: null,
  isReady: false,

  // Obtener credenciales guardadas
  getConfig() {
    try {
      const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    // Configuración predeterminada o vacía para configurar en UI
    return {
      url: window.SUPABASE_URL || '',
      anonKey: window.SUPABASE_ANON_KEY || '',
      autoSync: true
    };
  },

  // Guardar credenciales
  saveConfig(url, anonKey, autoSync = true) {
    const cfg = {
      url: (url || '').trim(),
      anonKey: (anonKey || '').trim(),
      autoSync: Boolean(autoSync)
    };
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(cfg));
    this.init();
    return cfg;
  },

  // Verificar si hay credenciales configuradas
  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg.url && cfg.anonKey && cfg.url.startsWith('http'));
  },

  // Inicializar cliente
  init() {
    const cfg = this.getConfig();
    if (!cfg.url || !cfg.anonKey || !cfg.url.startsWith('http')) {
      this.client = null;
      this.isReady = false;
      return false;
    }

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        this.client = window.supabase.createClient(cfg.url, cfg.anonKey);
        this.isReady = true;
        return true;
      } catch (err) {
        console.error('Error al inicializar cliente Supabase:', err);
        this.client = null;
        this.isReady = false;
        return false;
      }
    }
    return false;
  },

  // Probar conectividad con Supabase
  async testConnection() {
    const cfg = this.getConfig();
    if (!cfg.url || !cfg.anonKey) {
      return { success: false, message: 'Falta ingresar la URL y la Anon Key de Supabase.' };
    }

    if (!this.client) {
      const ok = this.init();
      if (!ok) return { success: false, message: 'La librería de Supabase no está cargada aún.' };
    }

    try {
      const { data, error } = await this.client
        .from('products')
        .select('id, name')
        .limit(1);

      if (error) {
        return { success: false, message: `Error de Supabase: ${error.message}` };
      }

      return { 
        success: true, 
        message: '¡Conexión exitosa a Supabase!', 
        sample: data 
      };
    } catch (err) {
      return { success: false, message: `Error de red: ${err.message}` };
    }
  },

  // Descargar todo el estado desde Supabase
  async fetchFullState() {
    if (!this.client) this.init();
    if (!this.client) throw new Error('Supabase no está configurado');

    try {
      const [
        { data: products, error: eProd },
        { data: clients, error: eCli },
        { data: orders, error: eOrd },
        { data: payments, error: ePay },
        { data: invoices, error: eInv },
        { data: expenses, error: eExp }
      ] = await Promise.all([
        this.client.from('products').select('*'),
        this.client.from('clients').select('*').order('created_at', { ascending: false }),
        this.client.from('orders').select('*').order('created_at', { ascending: false }),
        this.client.from('payments').select('*').order('created_at', { ascending: false }),
        this.client.from('invoices').select('*').order('created_at', { ascending: false }),
        this.client.from('expenses').select('*').order('created_at', { ascending: false })
      ]);

      if (eProd) throw eProd;

      // Normalizar campos si hay diferencias de casing (snake_case -> camelCase)
      const mappedOrders = (orders || []).map(o => ({
        id: o.id,
        date: o.date,
        clientId: o.client_id,
        clientName: o.client_name,
        phone: o.phone,
        address: o.address,
        note: o.note,
        items: o.items || [],
        hasEmpties: o.has_empties,
        returnedBottles: o.returned_bottles || 0,
        newBottleCost: Number(o.new_bottle_cost || 0),
        total: Number(o.total || 0),
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        dueDate: o.due_date,
        status: o.status,
        paymentId: o.payment_id,
        invoiceId: o.invoice_id
      }));

      const mappedPayments = (payments || []).map(p => ({
        id: p.id,
        orderId: p.order_id,
        clientId: p.client_id,
        clientName: p.client_name,
        phone: p.phone,
        concept: p.concept,
        amount: Number(p.amount || 0),
        method: p.method,
        status: p.status,
        dueDate: p.due_date,
        paidDate: p.paid_date || ''
      }));

      const mappedInvoices = (invoices || []).map(i => ({
        id: i.id,
        type: i.type,
        date: i.date,
        clientName: i.client_name,
        orderId: i.order_id,
        concept: i.concept,
        total: Number(i.total || 0),
        status: i.status
      }));

      const mappedExpenses = (expenses || []).map(x => ({
        id: x.id,
        date: x.date,
        category: x.category,
        concept: x.concept,
        method: x.method,
        amount: Number(x.amount || 0)
      }));

      return {
        products: products || [],
        clients: clients || [],
        orders: mappedOrders,
        payments: mappedPayments,
        invoices: mappedInvoices,
        expenses: mappedExpenses
      };
    } catch (err) {
      console.error('Error obteniendo estado de Supabase:', err);
      throw err;
    }
  },

  // Subir / Sincronizar estado completo a Supabase
  async uploadFullState(state) {
    if (!this.client) this.init();
    if (!this.client) throw new Error('Supabase no está configurado');

    try {
      // 1. Productos
      if (state.products && state.products.length) {
        await this.client.from('products').upsert(state.products, { onConflict: 'id' });
      }

      // 2. Clientes
      if (state.clients && state.clients.length) {
        const payloadClients = state.clients.map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone || '',
          address: c.address || '',
          obs: c.obs || '',
          bottles_on_loan: c.bottlesOnLoan || c.bottles_on_loan || 0
        }));
        await this.client.from('clients').upsert(payloadClients, { onConflict: 'id' });
      }

      // 3. Pedidos
      if (state.orders && state.orders.length) {
        const payloadOrders = state.orders.map(o => ({
          id: o.id,
          date: o.date,
          client_id: o.clientId || null,
          client_name: o.clientName,
          phone: o.phone || '',
          address: o.address || '',
          note: o.note || '',
          items: o.items || [],
          has_empties: o.hasEmpties !== false,
          returned_bottles: o.returnedBottles || 0,
          new_bottle_cost: o.newBottleCost || 0,
          total: o.total,
          payment_method: o.paymentMethod || 'Efectivo',
          payment_status: o.paymentStatus || 'Adeudado',
          due_date: o.dueDate || null,
          status: o.status || 'Pendiente',
          payment_id: o.paymentId || null,
          invoice_id: o.invoiceId || null
        }));
        await this.client.from('orders').upsert(payloadOrders, { onConflict: 'id' });
      }

      // 4. Pagos
      if (state.payments && state.payments.length) {
        const payloadPayments = state.payments.map(p => ({
          id: p.id,
          order_id: p.orderId || null,
          client_id: p.clientId || null,
          client_name: p.clientName,
          phone: p.phone || '',
          concept: p.concept,
          amount: p.amount,
          method: p.method || 'Efectivo',
          status: p.status || 'Adeudado',
          due_date: p.dueDate || null,
          paid_date: p.paidDate || null
        }));
        await this.client.from('payments').upsert(payloadPayments, { onConflict: 'id' });
      }

      // 5. Facturas / Recibos
      if (state.invoices && state.invoices.length) {
        const payloadInvoices = state.invoices.map(i => ({
          id: i.id,
          type: i.type || 'Recibo X',
          date: i.date,
          client_name: i.clientName,
          order_id: i.orderId || null,
          concept: i.concept,
          total: i.total,
          status: i.status || 'Adeudado'
        }));
        await this.client.from('invoices').upsert(payloadInvoices, { onConflict: 'id' });
      }

      // 6. Gastos
      if (state.expenses && state.expenses.length) {
        const payloadExpenses = state.expenses.map(x => ({
          id: x.id,
          date: x.date,
          category: x.category,
          concept: x.concept,
          method: x.method || 'Efectivo',
          amount: x.amount
        }));
        await this.client.from('expenses').upsert(payloadExpenses, { onConflict: 'id' });
      }

      return { success: true };
    } catch (err) {
      console.error('Error al subir estado a Supabase:', err);
      throw err;
    }
  },

  // Operaciones atómicas en vivo (Disparadas al momento de crear o editar)
  async upsertOrder(order) {
    if (!this.client) this.init();
    if (!this.client) return;

    try {
      await this.client.from('orders').upsert({
        id: order.id,
        date: order.date,
        client_id: order.clientId || null,
        client_name: order.clientName,
        phone: order.phone || '',
        address: order.address || '',
        note: order.note || '',
        items: order.items || [],
        has_empties: order.hasEmpties !== false,
        returned_bottles: order.returnedBottles || 0,
        new_bottle_cost: order.newBottleCost || 0,
        total: order.total,
        payment_method: order.paymentMethod || 'Efectivo',
        payment_status: order.paymentStatus || 'Adeudado',
        due_date: order.dueDate || null,
        status: order.status || 'Pendiente',
        payment_id: order.paymentId || null,
        invoice_id: order.invoiceId || null
      }, { onConflict: 'id' });
    } catch (e) {
      console.warn('No se pudo guardar pedido en Supabase:', e);
    }
  },

  async upsertClient(client) {
    if (!this.client) this.init();
    if (!this.client) return;

    try {
      await this.client.from('clients').upsert({
        id: client.id,
        name: client.name,
        phone: client.phone || '',
        address: client.address || '',
        obs: client.obs || '',
        bottles_on_loan: client.bottlesOnLoan || 0
      }, { onConflict: 'id' });
    } catch (e) {
      console.warn('No se pudo guardar cliente en Supabase:', e);
    }
  },

  async upsertPayment(payment) {
    if (!this.client) this.init();
    if (!this.client) return;

    try {
      await this.client.from('payments').upsert({
        id: payment.id,
        order_id: payment.orderId || null,
        client_id: payment.clientId || null,
        client_name: payment.clientName,
        phone: payment.phone || '',
        concept: payment.concept,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        due_date: payment.dueDate || null,
        paid_date: payment.paidDate || null
      }, { onConflict: 'id' });
    } catch (e) {
      console.warn('No se pudo guardar pago en Supabase:', e);
    }
  },

  async upsertExpense(expense) {
    if (!this.client) this.init();
    if (!this.client) return;

    try {
      await this.client.from('expenses').upsert({
        id: expense.id,
        date: expense.date,
        category: expense.category,
        concept: expense.concept,
        method: expense.method,
        amount: expense.amount
      }, { onConflict: 'id' });
    } catch (e) {
      console.warn('No se pudo guardar gasto en Supabase:', e);
    }
  },

  async updateStock(productId, stock, empty) {
    if (!this.client) this.init();
    if (!this.client) return;

    try {
      const payload = { updated_at: new Date().toISOString() };
      if (stock !== undefined) payload.stock = stock;
      if (empty !== undefined) payload.empty = empty;

      await this.client.from('products').update(payload).eq('id', productId);
    } catch (e) {
      console.warn('No se pudo actualizar stock en Supabase:', e);
    }
  }
};

// Intentar inicializar al cargar
if (typeof window !== 'undefined') {
  window.SupabaseService = SupabaseService;
}
