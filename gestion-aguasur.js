// ============================================================================
// AGUASUR ERP · SISTEMA DE GESTIÓN DE CLIENTES, RUTAS, ENVASES Y PEDIDOS
// Frontend con persistencia en localStorage (listo para conectar a Base de Datos)
// ============================================================================

const STORAGE_KEY = 'aguasur_erp_clean_v1';

const PRODUCT_CATALOG = {
  b20: { id: 'b20', name: 'Bidón Retornable 20L', short: '20L', price: 3500, returnable: true },
  disp: { id: 'disp', name: 'Abono Dispenser Frío/Calor', short: 'Dispenser F/C', price: 8500, returnable: false }
};

const INITIAL_DATA = {
  truckConfig: {
    driver: 'Reparto Central Aguasur',
    loaded20: 80,
    loaded12: 0,
    loadedSoda: 0
  },
  clients: [],
  orders: []
};

let state = loadState();
let activeDeliveryOrderId = null;
let activeCobroClientId = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('No se pudo leer localStorage:', e);
  }
  return JSON.parse(JSON.stringify(INITIAL_DATA));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('No se pudo guardar en localStorage:', e);
  }
  renderAll();
}

function formatARS(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
}

function getItemsSummary(items) {
  const parts = [];
  if (items.b20 > 0) parts.push(`${items.b20}× Bidón 20L`);
  if (items.b12 > 0) parts.push(`${items.b12}× Bidón 12L`);
  if (items.soda > 0) parts.push(`${items.soda}× Pack Soda`);
  if (items.disp > 0) parts.push(`${items.disp}× Dispenser F/C`);
  return parts.length ? parts.join(' + ') : 'Sin productos';
}

function calcOrderTotal(items) {
  return (
    (Number(items.b20) || 0) * PRODUCT_CATALOG.b20.price +
    (Number(items.b12) || 0) * PRODUCT_CATALOG.b12.price +
    (Number(items.soda) || 0) * PRODUCT_CATALOG.soda.price +
    (Number(items.disp) || 0) * PRODUCT_CATALOG.disp.price
  );
}

function showToast(msg, subtitle = '') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'erp-toast';
  el.innerHTML = `
    <div class="erp-toast-icon">💧</div>
    <div>
      <strong>${msg}</strong>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
    </div>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 350);
  }, 4000);
}

// ============================================================================
// PUBLIC WEBSITE ORDER CALCULATOR & DIRECT CONNECTION TO ERP
// ============================================================================
const webCart = { b20: 2, b12: 0, soda: 0, disp: 0 };

function updateWebQty(key, delta) {
  webCart[key] = Math.max(0, (webCart[key] || 0) + delta);
  const qtyEl = document.getElementById(`webQty_${key}`);
  if (qtyEl) qtyEl.textContent = webCart[key];
  updateWebOrderSummary();
}

function quickSelectProduct(key, qty = 2) {
  webCart[key] = Math.max(qty, (webCart[key] || 0) + 1);
  const qtyEl = document.getElementById(`webQty_${key}`);
  if (qtyEl) qtyEl.textContent = webCart[key];
  updateWebOrderSummary();
  const orderSec = document.getElementById('contacto');
  if (orderSec) orderSec.scrollIntoView({ behavior: 'smooth' });
  showToast('Producto agregado a tu pedido', `${PRODUCT_CATALOG[key].name} seleccionado`);
}

function updateWebOrderSummary() {
  const total = calcOrderTotal(webCart);
  const summaryEl = document.getElementById('webOrderSummaryText');
  const totalEl = document.getElementById('webOrderTotalText');
  if (summaryEl) summaryEl.textContent = getItemsSummary(webCart);
  if (totalEl) totalEl.textContent = formatARS(total);
}

function submitPublicWebOrder(e) {
  e.preventDefault();
  const total = calcOrderTotal(webCart);
  if (total <= 0) {
    showToast('Seleccioná al menos 1 producto', 'Usá los botones + para agregar bidones.');
    return;
  }
  const name = document.getElementById('webClientName').value.trim();
  const phone = document.getElementById('webClientPhone').value.trim();
  const zone = document.getElementById('webClientZone').value;
  const address = document.getElementById('webClientAddress').value.trim();
  const shift = document.getElementById('webClientShift').value;
  const paymentMethod = document.getElementById('webClientPayment').value;
  const notes = document.getElementById('webClientNotes').value.trim();
  const isUrgent = document.getElementById('webClientUrgent').checked;

  // Buscar o crear cliente en el ERP
  let client = state.clients.find(
    c => c.name.toLowerCase() === name.toLowerCase() || (phone && c.phone.includes(phone.replace(/\D/g, '')))
  );
  if (!client) {
    client = {
      id: 'CLI-' + (100 + state.clients.length + 1),
      name,
      type: 'Hogar',
      zone,
      address,
      notes: notes || 'Alta desde Pedido Web',
      phone: phone.replace(/\D/g, '') || '5491100000000',
      routeDays: 'A coordinar (Web)',
      jugsInHand: 0,
      hasDispenser: webCart.disp > 0,
      balance: 0,
      usualOrder: { b20: webCart.b20, b12: webCart.b12, soda: webCart.soda },
      lastDelivery: 'Nuevo cliente web'
    };
    state.clients.unshift(client);
  }

  const nextNum = 1001 + state.orders.length;
  const newOrder = {
    id: 'AGS-' + nextNum,
    clientId: client.id,
    clientName: client.name,
    zone,
    address,
    phone: client.phone,
    items: { ...webCart },
    total,
    status: 'Pendiente',
    priority: isUrgent ? 'Urgente · Sin Agua' : 'Pedido Web',
    shift,
    paymentMethod,
    paymentStatus: 'Pendiente',
    emptiesReturned: 0,
    createdAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs',
    notes: notes || 'Pedido cargado desde la página web pública.'
  };

  state.orders.unshift(newOrder);
  saveState();

  const feedback = document.getElementById('webOrderFeedback');
  if (feedback) {
    const waText = encodeURIComponent(
      `¡Hola Aguasur! Hice el pedido *${newOrder.id}* por la web:\n` +
      `• Pedido: ${getItemsSummary(newOrder.items)} (${formatARS(newOrder.total)})\n` +
      `• Nombre: ${name}\n` +
      `• Dirección: ${address} (${zone})\n` +
      `• Franja: ${shift} · Pago: ${paymentMethod}`
    );
    feedback.style.display = 'block';
    feedback.innerHTML = `
      <div class="web-order-success">
        <div>
          <strong>✅ ¡Pedido ${newOrder.id} registrado en el Sistema de Reparto!</strong>
          <p>Ya impactó en tiempo real en la Hoja de Ruta del Panel Interno de Aguasur.</p>
        </div>
        <div class="web-order-success-actions">
          <button type="button" class="btn btn-primary" onclick="switchAppMode('erp')">
            Ver en el Panel Interno →
          </button>
          <a class="btn btn-soft" href="https://wa.me/5491100000000?text=${waText}" target="_blank" rel="noopener">
            Enviar comprobante por WhatsApp
          </a>
        </div>
      </div>
    `;
  }

  showToast(
    `¡Nuevo Pedido Web ${newOrder.id}!`,
    `${name} · ${getItemsSummary(newOrder.items)} (${zone})`
  );
}

// ============================================================================
// VIEW SWITCHER (PUBLIC SITE <-> INTERNAL ERP PANEL)
// ============================================================================
function switchAppMode(mode) {
  const publicView = document.getElementById('publicSiteView');
  const erpView = document.getElementById('erpPanelView');
  const btnPublic = document.getElementById('modeBtnPublic');
  const btnErp = document.getElementById('modeBtnErp');

  if (mode === 'erp') {
    publicView.style.display = 'none';
    erpView.style.display = 'block';
    btnPublic?.classList.remove('active');
    btnErp?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
  } else {
    erpView.style.display = 'none';
    publicView.style.display = 'block';
    btnErp?.classList.remove('active');
    btnPublic?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function switchErpTab(tabId) {
  document.querySelectorAll('.erp-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.erp-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `erpTab_${tabId}`);
  });
}

// ============================================================================
// ERP RENDERING & KPI CALCULATIONS
// ============================================================================
function renderAll() {
  updateBadgesAndKPIs();
  renderRouteOrders();
  renderClientsTable();
  populateQuickOrderClientSelect();
  renderTruckAndCashClose();
}

function updateBadgesAndKPIs() {
  const activeOrders = state.orders.filter(o => o.status === 'Pendiente' || o.status === 'En Reparto');
  const deliveredOrders = state.orders.filter(o => o.status === 'Entregado');

  // Badge en navbar y barra flotante
  document.querySelectorAll('.live-pending-count').forEach(el => {
    el.textContent = activeOrders.length;
  });

  // Calcular bidones vendidos y efectivo/transferencia/cta cte
  let sold20 = 0;
  let sold12 = 0;
  let soldSoda = 0;
  let emptiesBack = 0;
  let cashToday = 0;
  let transferToday = 0;
  let ctaCteToday = 0;

  deliveredOrders.forEach(o => {
    sold20 += Number(o.items.b20 || 0);
    sold12 += Number(o.items.b12 || 0);
    soldSoda += Number(o.items.soda || 0);
    emptiesBack += Number(o.emptiesReturned || 0);

    if (o.paymentMethod === 'Efectivo') cashToday += o.total;
    else if (o.paymentMethod === 'Transferencia') transferToday += o.total;
    else ctaCteToday += o.total;
  });

  const totalDebt = state.clients.reduce((acc, c) => acc + (Number(c.balance) || 0), 0);
  const totalJugsStreet = state.clients.reduce((acc, c) => acc + (Number(c.jugsInHand) || 0), 0);
  const totalDispensers = state.clients.filter(c => c.hasDispenser).length;

  const rem20 = Math.max(0, state.truckConfig.loaded20 - sold20);
  const rem12 = Math.max(0, state.truckConfig.loaded12 - sold12);

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  const totalOrdersCount = state.orders.length;
  const pct = totalOrdersCount ? Math.round((deliveredOrders.length / totalOrdersCount) * 100) : 0;

  setTxt('kpiOrdersProgress', `${deliveredOrders.length} / ${totalOrdersCount}`);
  setTxt('kpiOrdersPct', `${pct}% completado · ${activeOrders.length} en curso`);
  const bar = document.getElementById('kpiProgressBar');
  if (bar) bar.style.width = `${pct}%`;

  setTxt('kpiSoldJugs', `${sold20 + sold12} bidones`);
  setTxt('kpiTruckRem', `Quedan ${rem20} (20L) y ${rem12} (12L) en camión`);

  setTxt('kpiRevenueToday', formatARS(cashToday + transferToday));
  setTxt('kpiRevenueBreak', `Efvo: ${formatARS(cashToday)} · Transf: ${formatARS(transferToday)}`);

  setTxt('kpiStreetAssets', `${totalJugsStreet} envases`);
  setTxt('kpiDebtTotal', `${totalDispensers} dispensers · Cta. Cte: ${formatARS(totalDebt)}`);
}

// ============================================================================
// TAB 1: HOJA DE RUTA & GESTIÓN DE PEDIDOS
// ============================================================================
function renderRouteOrders() {
  const tbody = document.getElementById('erpOrdersTableBody');
  if (!tbody) return;

  const zoneFilter = document.getElementById('filterZone')?.value || 'ALL';
  const statusFilter = document.getElementById('filterStatus')?.value || 'ALL';
  const search = (document.getElementById('filterOrderSearch')?.value || '').toLowerCase();

  // Orden inteligente: primero Urgentes, luego En Reparto / Pendiente, luego Entregado
  const statusWeight = { 'En Reparto': 1, 'Pendiente': 2, 'Ausente': 3, 'Entregado': 4 };

  const filtered = state.orders
    .filter(o => (zoneFilter === 'ALL' || o.zone === zoneFilter))
    .filter(o => (statusFilter === 'ALL' || o.status === statusFilter))
    .filter(o =>
      !search ||
      o.clientName.toLowerCase().includes(search) ||
      o.address.toLowerCase().includes(search) ||
      o.id.toLowerCase().includes(search)
    )
    .sort((a, b) => {
      if (a.status !== b.status) return (statusWeight[a.status] || 9) - (statusWeight[b.status] || 9);
      if (a.priority.includes('Urgente') && !b.priority.includes('Urgente')) return -1;
      if (!a.priority.includes('Urgente') && b.priority.includes('Urgente')) return 1;
      return 0;
    });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:36px;color:var(--muted);">
          No hay pedidos que coincidan con el filtro seleccionado.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map(o => {
      const client = state.clients.find(c => c.id === o.clientId);
      const jugsHeld = client ? client.jugsInHand : 0;
      const clientDebt = client ? client.balance : 0;

      let badgeStatus = 'status-pending';
      if (o.status === 'En Reparto') badgeStatus = 'status-transit';
      else if (o.status === 'Entregado') badgeStatus = 'status-done';
      else if (o.status === 'Ausente') badgeStatus = 'status-absent';

      let badgePrio = 'prio-normal';
      if (o.priority.includes('Urgente')) badgePrio = 'prio-urgent';
      else if (o.priority.includes('Web')) badgePrio = 'prio-web';

      const waMsg = encodeURIComponent(
        `¡Hola ${o.clientName}! 🚚💧 Te escribimos de *Aguasur*. Estamos pasando hoy (${o.shift}) por *${o.address}* con tu pedido (${getItemsSummary(o.items)} - ${formatARS(o.total)}). ¡Recordá tener los envases vacíos a mano!`
      );

      return `
        <tr class="${o.status === 'Entregado' ? 'row-delivered' : ''}">
          <td>
            <div class="order-id-cell">
              <strong>${o.id}</strong>
              <span class="prio-pill ${badgePrio}">${o.priority}</span>
              <small>${o.createdAt} · ${o.shift}</small>
            </div>
          </td>
          <td>
            <div class="client-cell">
              <strong>${o.clientName}</strong>
              <span>📍 <b>${o.zone}</b> · ${o.address}</span>
              ${o.notes ? `<small class="note-tag">📝 ${o.notes}</small>` : ''}
            </div>
          </td>
          <td>
            <div class="items-cell">
              <strong>${getItemsSummary(o.items)}</strong>
              <span>Envases en cliente: <b>${jugsHeld} bidones</b></span>
              ${o.status === 'Entregado' ? `<small class="returned-tag">♻️ Retiró ${o.emptiesReturned} vacíos</small>` : ''}
            </div>
          </td>
          <td>
            <div class="price-cell">
              <strong>${formatARS(o.total)}</strong>
              <span>${o.paymentMethod}</span>
              ${clientDebt > 0 ? `<small class="debt-tag">Deuda previa: ${formatARS(clientDebt)}</small>` : ''}
            </div>
          </td>
          <td>
            <span class="status-pill ${badgeStatus}">${o.status}</span>
          </td>
          <td>
            <div class="row-actions">
              ${
                o.status !== 'Entregado'
                  ? `
                    ${
                      o.status === 'Pendiente' || o.status === 'Ausente'
                        ? `<button class="act-btn act-dispatch" onclick="setOrderStatus('${o.id}', 'En Reparto')" title="Subir al reparto">🚚 En Reparto</button>`
                        : ''
                    }
                    <button class="act-btn act-deliver" onclick="openDeliveryModal('${o.id}')" title="Confirmar entrega y envases vacíos">✅ Entregar</button>
                    <button class="act-btn act-absent" onclick="setOrderStatus('${o.id}', 'Ausente')" title="No estaba en domicilio">⚠️ Ausente</button>
                  `
                  : `<span class="done-check">✔ Cerrado</span>`
              }
              <a class="act-btn act-wa" href="https://wa.me/${o.phone}?text=${waMsg}" target="_blank" rel="noopener" title="Avisar por WhatsApp">💬</a>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function setOrderStatus(orderId, newStatus) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = newStatus;
  saveState();
  showToast(`Pedido ${order.id} → ${newStatus}`, order.clientName);
}

// Modal de Entrega (Controla bidones entregados, envases vacíos retirados y cobro)
function openDeliveryModal(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  activeDeliveryOrderId = orderId;

  const expectedEmpties = (Number(order.items.b20) || 0) + (Number(order.items.b12) || 0);
  document.getElementById('delModalTitle').textContent = `Confirmar Entrega · ${order.id}`;
  document.getElementById('delModalClient').textContent = `${order.clientName} (${order.address})`;
  document.getElementById('delModalItems').textContent = `${getItemsSummary(order.items)} — Total: ${formatARS(order.total)}`;
  document.getElementById('delModalEmpties').value = expectedEmpties;
  document.getElementById('delModalPaymentMethod').value = order.paymentMethod || 'Efectivo';

  document.getElementById('deliveryModalBackdrop').classList.add('open');
}

function closeDeliveryModal() {
  document.getElementById('deliveryModalBackdrop').classList.remove('open');
  activeDeliveryOrderId = null;
}

function confirmOrderDelivery(e) {
  e.preventDefault();
  const order = state.orders.find(o => o.id === activeDeliveryOrderId);
  if (!order) return;

  const emptiesReturned = Math.max(0, parseInt(document.getElementById('delModalEmpties').value, 10) || 0);
  const paymentMethod = document.getElementById('delModalPaymentMethod').value;

  const deliveredJugs = (Number(order.items.b20) || 0) + (Number(order.items.b12) || 0);
  const netJugChange = deliveredJugs - emptiesReturned;

  order.status = 'Entregado';
  order.emptiesReturned = emptiesReturned;
  order.paymentMethod = paymentMethod;
  order.paymentStatus = paymentMethod === 'Cuenta Corriente' ? 'A Cuenta' : 'Pagado';

  // Actualizar comodato de envases y saldo del cliente
  const client = state.clients.find(c => c.id === order.clientId);
  if (client) {
    client.jugsInHand = Math.max(0, (Number(client.jugsInHand) || 0) + netJugChange);
    client.lastDelivery = 'Hoy (' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ')';
    if (paymentMethod === 'Cuenta Corriente') {
      client.balance = (Number(client.balance) || 0) + order.total;
    }
  }

  closeDeliveryModal();
  saveState();
  showToast(
    `✅ Entrega ${order.id} completada`,
    `Cobro: ${paymentMethod} (${formatARS(order.total)}) · Vacíos recuperados: ${emptiesReturned}`
  );
}

// Generador inteligente de Ruta Programada del Día
function generateScheduledRouteToday() {
  let added = 0;
  state.clients.forEach(c => {
    const alreadyHasActive = state.orders.some(
      o => o.clientId === c.id && (o.status === 'Pendiente' || o.status === 'En Reparto')
    );
    if (!alreadyHasActive) {
      const items = {
        b20: c.usualOrder?.b20 || 2,
        b12: c.usualOrder?.b12 || 0,
        soda: c.usualOrder?.soda || 0,
        disp: 0
      };
      const total = calcOrderTotal(items);
      const nextNum = 1001 + state.orders.length;
      state.orders.push({
        id: 'AGS-' + nextNum,
        clientId: c.id,
        clientName: c.name,
        zone: c.zone,
        address: c.address,
        phone: c.phone,
        items,
        total,
        status: 'Pendiente',
        priority: 'Ruta Fija',
        shift: 'Mañana (8-13h)',
        paymentMethod: c.type === 'Oficina' ? 'Transferencia' : 'Efectivo',
        paymentStatus: 'Pendiente',
        emptiesReturned: 0,
        createdAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs',
        notes: c.notes || 'Generado por rutina de visita programada.'
      });
      added++;
    }
  });

  saveState();
  if (added > 0) {
    showToast(`⚡ Se generaron ${added} pedidos de Ruta Habitual`, 'Listos para despachar por zona.');
  } else {
    showToast('Ruta al día', 'Todos los clientes habituales ya tienen un pedido activo hoy.');
  }
}

// ============================================================================
// TAB 2: GESTIÓN DE CLIENTES, ENVASES EN COMODATO Y CUENTA CORRIENTE
// ============================================================================
function renderClientsTable() {
  const tbody = document.getElementById('erpClientsTableBody');
  if (!tbody) return;

  const search = (document.getElementById('filterClientSearch')?.value || '').toLowerCase();
  const zoneFilter = document.getElementById('filterClientZone')?.value || 'ALL';

  const list = state.clients.filter(c => {
    const matchZone = zoneFilter === 'ALL' || c.zone === zoneFilter;
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search) ||
      c.address.toLowerCase().includes(search) ||
      c.type.toLowerCase().includes(search);
    return matchZone && matchSearch;
  });

  tbody.innerHTML = list
    .map(c => {
      const usualText = getItemsSummary(c.usualOrder || { b20: 2 });
      return `
        <tr>
          <td>
            <div class="client-cell">
              <strong>${c.name} <span class="type-badge">${c.type}</span></strong>
              <span>📍 <b>${c.zone}</b> · ${c.address}</span>
              ${c.notes ? `<small class="note-tag">📝 ${c.notes}</small>` : ''}
            </div>
          </td>
          <td>
            <div class="route-cell">
              <strong>🗓️ ${c.routeDays}</strong>
              <span>Consumo habitual: ${usualText}</span>
              <small>Última entrega: ${c.lastDelivery}</small>
            </div>
          </td>
          <td>
            <div class="comodato-cell">
              <span class="jug-badge ${c.jugsInHand >= 6 ? 'high' : ''}">🍾 ${c.jugsInHand} envases</span>
              <span class="disp-badge ${c.hasDispenser ? 'active' : ''}">
                ${c.hasDispenser ? '❄️🔥 Dispenser F/C' : 'Sin dispenser'}
              </span>
            </div>
          </td>
          <td>
            <div class="balance-cell">
              ${
                c.balance > 0
                  ? `<strong class="debt-amount">${formatARS(c.balance)}</strong>
                     <button class="act-btn act-pay" onclick="registerDebtPayment('${c.id}')">💲 Cobrar</button>`
                  : `<span class="al-dia-badge">✔ Al día ($0)</span>`
              }
            </div>
          </td>
          <td>
            <div class="row-actions">
              <button class="act-btn act-deliver" onclick="prefillOrderForClient('${c.id}')">➕ Cargar Pedido</button>
              <a class="act-btn act-wa" href="https://wa.me/${c.phone}" target="_blank" rel="noopener" title="WhatsApp">💬</a>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function registerDebtPayment(clientId) {
  const client = state.clients.find(c => c.id === clientId);
  if (!client || client.balance <= 0) return;
  const paid = client.balance;
  client.balance = 0;
  saveState();
  showToast(`Cobro registrado: ${formatARS(paid)}`, `${client.name} quedó con saldo $0 (Al día).`);
}

function openNewClientModal() {
  document.getElementById('newClientModalBackdrop').classList.add('open');
}

function closeNewClientModal() {
  document.getElementById('newClientModalBackdrop').classList.remove('open');
}

function saveNewClient(e) {
  e.preventDefault();
  const name = document.getElementById('ncName').value.trim();
  const type = document.getElementById('ncType').value;
  const zone = document.getElementById('ncZone').value;
  const address = document.getElementById('ncAddress').value.trim();
  const phone = document.getElementById('ncPhone').value.replace(/\D/g, '') || '5491100000000';
  const routeDays = document.getElementById('ncRouteDays').value;
  const jugsInHand = parseInt(document.getElementById('ncJugs').value, 10) || 0;
  const hasDispenser = document.getElementById('ncDispenser').checked;
  const b20Habitual = parseInt(document.getElementById('ncUsual20').value, 10) || 2;
  const notes = document.getElementById('ncNotes').value.trim();

  const newClient = {
    id: 'CLI-' + (100 + state.clients.length + 1),
    name,
    type,
    zone,
    address,
    notes,
    phone,
    routeDays,
    jugsInHand,
    hasDispenser,
    balance: 0,
    usualOrder: { b20: b20Habitual, b12: 0, soda: 0 },
    lastDelivery: 'Recién dado de alta'
  };

  state.clients.unshift(newClient);
  closeNewClientModal();
  e.target.reset();
  saveState();
  showToast(`👥 Cliente ${newClient.name} guardado`, `Zona: ${zone} · Comodato inicial: ${jugsInHand} envases`);
}

// ============================================================================
// TAB 3: CARGA RÁPIDA DE PEDIDO (OPERADOR / WHATSAPP / MOSTRADOR)
// ============================================================================
function populateQuickOrderClientSelect() {
  const select = document.getElementById('qoClientSelect');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML =
    `<option value="NEW">➕ Cliente Nuevo / Eventual (cargar datos manuales)</option>` +
    state.clients
      .map(
        c =>
          `<option value="${c.id}">${c.name} — ${c.zone} (${c.address}) · [${c.jugsInHand} envases]</option>`
      )
      .join('');
  if (currentVal && (currentVal === 'NEW' || state.clients.some(c => c.id === currentVal))) {
    select.value = currentVal;
  }
}

function onQuickOrderClientChange() {
  const val = document.getElementById('qoClientSelect').value;
  const manualFields = document.getElementById('qoManualClientBox');
  const clientInfoCard = document.getElementById('qoClientQuickInfo');

  if (val === 'NEW') {
    if (manualFields) manualFields.style.display = 'grid';
    if (clientInfoCard) clientInfoCard.style.display = 'none';
  } else {
    const c = state.clients.find(cl => cl.id === val);
    if (!c) return;
    if (manualFields) manualFields.style.display = 'none';
    if (clientInfoCard) {
      clientInfoCard.style.display = 'flex';
      clientInfoCard.innerHTML = `
        <div>
          <strong>${c.name} (${c.type})</strong>
          <p>📍 ${c.zone} · ${c.address} · 🗓️ Ruta: ${c.routeDays}</p>
          ${c.notes ? `<small>📝 ${c.notes}</small>` : ''}
        </div>
        <div class="qo-client-badges">
          <span>🍾 ${c.jugsInHand} envases en comodato</span>
          <span>${c.balance > 0 ? `⚠️ Saldo Cta. Cte: ${formatARS(c.balance)}` : '✔ Sin deuda ($0)'}</span>
        </div>
      `;
    }
    document.getElementById('qoQty20').value = c.usualOrder?.b20 ?? 2;
    document.getElementById('qoQty12').value = c.usualOrder?.b12 ?? 0;
    document.getElementById('qoQtySoda').value = c.usualOrder?.soda ?? 0;
    updateQuickOrderPreview();
  }
}

function prefillOrderForClient(clientId) {
  switchErpTab('neworder');
  const select = document.getElementById('qoClientSelect');
  if (select) {
    select.value = clientId;
    onQuickOrderClientChange();
  }
}

function updateQuickOrderPreview() {
  const items = {
    b20: parseInt(document.getElementById('qoQty20')?.value, 10) || 0,
    b12: parseInt(document.getElementById('qoQty12')?.value, 10) || 0,
    soda: parseInt(document.getElementById('qoQtySoda')?.value, 10) || 0,
    disp: parseInt(document.getElementById('qoQtyDisp')?.value, 10) || 0
  };
  const total = calcOrderTotal(items);
  const el = document.getElementById('qoTotalPreview');
  if (el) el.textContent = `${getItemsSummary(items)} — Total: ${formatARS(total)}`;
}

function submitInternalQuickOrder(e) {
  e.preventDefault();
  const clientSelectVal = document.getElementById('qoClientSelect').value;
  const items = {
    b20: parseInt(document.getElementById('qoQty20').value, 10) || 0,
    b12: parseInt(document.getElementById('qoQty12').value, 10) || 0,
    soda: parseInt(document.getElementById('qoQtySoda').value, 10) || 0,
    disp: parseInt(document.getElementById('qoQtyDisp').value, 10) || 0
  };
  const total = calcOrderTotal(items);
  if (total <= 0) {
    showToast('Agregá al menos un producto al pedido');
    return;
  }

  let targetClient = null;
  if (clientSelectVal === 'NEW') {
    const name = document.getElementById('qoNewName').value.trim() || 'Cliente Telefónico';
    const zone = document.getElementById('qoNewZone').value;
    const address = document.getElementById('qoNewAddress').value.trim() || 'Dirección a confirmar';
    const phone = document.getElementById('qoNewPhone').value.replace(/\D/g, '') || '5491100000000';

    targetClient = {
      id: 'CLI-' + (100 + state.clients.length + 1),
      name,
      type: 'Hogar',
      zone,
      address,
      notes: document.getElementById('qoNotes').value.trim(),
      phone,
      routeDays: 'Martes y Viernes',
      jugsInHand: 0,
      hasDispenser: items.disp > 0,
      balance: 0,
      usualOrder: { b20: items.b20, b12: items.b12, soda: items.soda },
      lastDelivery: 'Primer pedido'
    };
    state.clients.unshift(targetClient);
  } else {
    targetClient = state.clients.find(c => c.id === clientSelectVal);
  }

  const priority = document.getElementById('qoPriority').value;
  const shift = document.getElementById('qoShift').value;
  const paymentMethod = document.getElementById('qoPayment').value;
  const notes = document.getElementById('qoNotes').value.trim() || targetClient.notes || '';

  const nextNum = 1001 + state.orders.length;
  const newOrder = {
    id: 'AGS-' + nextNum,
    clientId: targetClient.id,
    clientName: targetClient.name,
    zone: targetClient.zone,
    address: targetClient.address,
    phone: targetClient.phone,
    items,
    total,
    status: priority.includes('Urgente') ? 'En Reparto' : 'Pendiente',
    priority,
    shift,
    paymentMethod,
    paymentStatus: 'Pendiente',
    emptiesReturned: 0,
    createdAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs',
    notes
  };

  state.orders.unshift(newOrder);
  saveState();
  switchErpTab('route');
  showToast(
    `Pedido ${newOrder.id} agregado a la Hoja de Ruta`,
    `${targetClient.name} · ${getItemsSummary(items)} (${formatARS(total)})`
  );
}

// ============================================================================
// TAB 4: CONTROL DE CAMIÓN, ENVASES Y CIERRE DE CAJA
// ============================================================================
function renderTruckAndCashClose() {
  const delivered = state.orders.filter(o => o.status === 'Entregado');
  const inTransit = state.orders.filter(o => o.status === 'En Reparto' || o.status === 'Pendiente');

  let del20 = 0, del12 = 0, delSoda = 0, emptiesRecovered = 0;
  let comm20 = 0, comm12 = 0;
  let cash = 0, transfer = 0, ctaCte = 0;

  delivered.forEach(o => {
    del20 += Number(o.items.b20 || 0);
    del12 += Number(o.items.b12 || 0);
    delSoda += Number(o.items.soda || 0);
    emptiesRecovered += Number(o.emptiesReturned || 0);

    if (o.paymentMethod === 'Efectivo') cash += o.total;
    else if (o.paymentMethod === 'Transferencia') transfer += o.total;
    else ctaCte += o.total;
  });

  inTransit.forEach(o => {
    comm20 += Number(o.items.b20 || 0);
    comm12 += Number(o.items.b12 || 0);
  });

  const rem20 = Math.max(0, state.truckConfig.loaded20 - del20);
  const free20 = Math.max(0, rem20 - comm20);
  const rem12 = Math.max(0, state.truckConfig.loaded12 - del12);

  const box = document.getElementById('truckInventoryContainer');
  if (!box) return;

  box.innerHTML = `
    <div class="truck-grid">
      <div class="truck-card">
        <h4>🚛 Balance Físico del Camión (20L y 12L)</h4>
        <p class="truck-driver">${state.truckConfig.driver}</p>
        <ul class="truck-metrics">
          <li><span>Carga inicial al salir de planta (20L):</span> <b>${state.truckConfig.loaded20} bidones</b></li>
          <li><span>Entregados en clientes hoy (20L):</span> <b style="color:var(--blue)">-${del20} bidones</b></li>
          <li><span>Arriba del camión ahora mismo (20L):</span> <b>${rem20} bidones</b></li>
          <li><span>Libres para ventas espontáneas en calle:</span> <b style="color:var(--leaf)">${free20} bidones disponibles</b></li>
          <li><span>Bidones 12L restantes en camión:</span> <b>${rem12} de ${state.truckConfig.loaded12}</b></li>
          <li><span>♻️ Envases vacíos recolectados en camión:</span> <b style="color:var(--navy)">${emptiesRecovered} vacíos</b></li>
        </ul>
      </div>

      <div class="truck-card">
        <h4>💰 Arqueo y Cierre de Caja del Día</h4>
        <p class="truck-driver">Resumen de cobros registrados por el repartidor</p>
        <ul class="truck-metrics">
          <li><span>💵 Efectivo en mano a rendir:</span> <b style="color:var(--leaf)">${formatARS(cash)}</b></li>
          <li><span>📲 Transferencias / MercadoPago:</span> <b style="color:var(--blue)">${formatARS(transfer)}</b></li>
          <li><span>📓 Dejado en Cuenta Corriente hoy:</span> <b style="color:#d97706">${formatARS(ctaCte)}</b></li>
          <li class="total-line"><span>Total Facturado Entregado Hoy:</span> <b>${formatARS(cash + transfer + ctaCte)}</b></li>
        </ul>
        <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="exportRouteCSV()" style="padding:10px 18px;font-size:13px">📥 Descargar Planilla CSV</button>
          <button class="btn btn-soft" onclick="resetDemoData()" style="padding:10px 18px;font-size:13px">🔄 Restaurar Datos Demo</button>
        </div>
      </div>
    </div>
  `;
}

function exportRouteCSV() {
  const headers = ['ID Pedido', 'Cliente', 'Zona', 'Direccion', 'Detalle', 'Total ARS', 'Estado', 'Pago', 'Vacios Recuperados'];
  const rows = state.orders.map(o => [
    o.id,
    `"${o.clientName}"`,
    `"${o.zone}"`,
    `"${o.address}"`,
    `"${getItemsSummary(o.items)}"`,
    o.total,
    o.status,
    o.paymentMethod,
    o.emptiesReturned
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hoja_de_ruta_aguasur_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Hoja de ruta descargada en CSV');
}

function resetDemoData() {
  localStorage.removeItem(STORAGE_KEY);
  state = JSON.parse(JSON.stringify(INITIAL_DATA));
  renderAll();
  showToast('🔄 Datos de prueba restaurados al estado inicial');
}

window.addEventListener('DOMContentLoaded', () => {
  updateWebOrderSummary();
  renderAll();
  onQuickOrderClientChange();
});
