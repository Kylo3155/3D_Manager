const api = (path, options = {}) =>
  fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options }).then(
    async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Error');
      return data;
    }
  );

const listEl = (id) => document.getElementById(id);

const formatNumber = (value) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value || 0)
  );

const formatInteger = (value) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Number(value || 0));

const renderList = (el, items, formatter) => {
  el.innerHTML = '';
  if (!items.length) {
    el.innerHTML = '<div class="hint">Sin datos</div>';
    return;
  }
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = formatter(item);
    el.appendChild(div);
  });
};

const refresh = async () => {
  const printers = await api('/printers');
  renderList(listEl('printers'), printers, (p) => {
    const price = formatNumber(p.price || 0);
    const date = p.purchase_date || '-';
    return `
      <span>${p.brand} <small>${p.model}</small></span>
      <small>$${price}</small>
      <small>${date}</small>
    `;
  });

  const filaments = await api('/filaments');
  renderList(listEl('filaments'), filaments, (f) =>
    `<span>${f.name} <small>${f.color || ''}</small></span>`
      + `<small>${formatInteger(f.stock_grams)} g | $${formatNumber(f.cost_per_kg || 0)}/kg</small>`
      + `<small>${f.extruder_temp_c ?? '-'}C / ${f.bed_temp_c ?? '-'}C</small>`
  );
  updateFilamentOptions(filaments);

  const filamentMap = new Map(
    filaments.map((f) => [String(f.id), `${f.name}${f.color ? ` (${f.color})` : ''}`])
  );

  const supplies = await api('/supplies');
  renderList(listEl('supplies'), supplies, (s) =>
    `<span>${s.name}</span>
      <small>${formatInteger(s.stock_qty)} u</small>
      <small>$${formatNumber(s.unit_cost || 0)}/u | Total: $${formatNumber(Number(s.unit_cost || 0) * Number(s.stock_qty || 0))}</small>`
  );
  updateSupplyOptions(supplies);

  const supplyMap = new Map(supplies.map((s) => [String(s.id), s.name]));

  const financials = await api('/financials');
  renderList(listEl('financials'), financials, (m) =>
    `<span>${m.type === 'income' ? 'Ingreso' : 'Egreso'}: ${m.description || ''}</span><small>$${m.amount}</small>`
  );
  updateFinanceSummary(financials);

  const orders = await api('/orders');
  renderList(listEl('orders'), orders, (o) => {
    const created = o.created_date || '-';
    const due = o.due_date || '-';
    const models = (o.models || []).join(', ') || '-';
    const status = o.completed ? 'Completado' : 'Pendiente';
    const filaments = (o.details?.filaments || [])
      .map((f) => `${filamentMap.get(String(f.id)) || 'Filamento'} ${f.grams}g`)
      .join(', ') || '-';
    const supplies = (o.details?.supplies || [])
      .map((s) => `${supplyMap.get(String(s.id)) || 'Insumo'} ${s.qty}u`)
      .join(', ') || '-';
    return `
      <span>${o.customer_name || '-'}</span>
      <small>${created} → ${due}</small>
      <small>${models}</small>
      <small>$${formatNumber(o.total_charge || 0)}</small>
      <small>
        ${status}
        ${o.completed ? '' : `<button class="btn btn--ghost" data-complete="${o.id}">Completar</button>`}
        <button class="btn btn--ghost" data-toggle="${o.id}">Detalles</button>
      </small>
      <div class="order-details" data-details="${o.id}">
        <div><strong>Cliente:</strong> ${o.customer_name || '-'}</div>
        <div><strong>Creacion:</strong> ${created}</div>
        <div><strong>Entrega:</strong> ${due}</div>
        <div><strong>Modelos:</strong> ${models}</div>
        <div><strong>Filamentos:</strong> ${filaments}</div>
        <div><strong>Insumos:</strong> ${supplies}</div>
      </div>
    `;
  });
};

const updateFinanceSummary = (financials) => {
  const summary = document.getElementById('finance-summary');
  if (!summary) return;
  const totalIncome = financials
    .filter((m) => m.type === 'income')
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);
  const totalExpense = financials
    .filter((m) => m.type === 'expense')
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);
  const profit = totalIncome - totalExpense;
  const values = summary.querySelectorAll('strong');
  if (values.length >= 3) {
    values[0].textContent = `$${formatNumber(totalExpense)}`;
    values[1].textContent = `$${formatNumber(totalIncome)}`;
    values[2].textContent = `$${formatNumber(profit)}`;
  }
};

let cachedFilaments = [];
let cachedSupplies = [];

const updateFilamentOptions = (filaments) => {
  cachedFilaments = filaments;
  const selects = [document.getElementById('budget-filament')].filter(Boolean);
  selects.forEach((select) => {
    const current = select.value;
    select.innerHTML = '<option value="">Filamento (seleccionar)</option>';
    filaments.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.id;
      option.textContent = `${f.name} ${f.material || ''} ${f.color || ''}`.trim();
      select.appendChild(option);
    });
    select.value = current;
  });
};

const updateSupplyOptions = (supplies) => {
  cachedSupplies = supplies;
};

const buildOptions = (items, placeholder, labeler) => {
  const options = [`<option value="">${placeholder}</option>`];
  items.forEach((item) => {
    const label = labeler ? labeler(item) : item.name;
    options.push(`<option value="${item.id}">${label}</option>`);
  });
  return options.join('');
};

const addFilamentRow = () => {
  const container = document.getElementById('order-filaments');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'order-row';
  row.innerHTML = `
    <select name="filament_id">
      ${buildOptions(cachedFilaments, 'Filamento (seleccionar)', (f) =>
        `${f.name}${f.color ? ` (${f.color})` : ''}`
      )}
    </select>
    <input name="filament_grams" type="number" placeholder="Gramos" />
    <button type="button" class="btn btn--ghost" data-remove>Quitar</button>
  `;
  container.appendChild(row);
};

const addSupplyRow = () => {
  const container = document.getElementById('order-supplies');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'order-row';
  row.innerHTML = `
    <select name="supply_id">
      ${buildOptions(cachedSupplies, 'Insumo (seleccionar)')}
    </select>
    <input name="supply_qty" type="number" placeholder="Cantidad" />
    <button type="button" class="btn btn--ghost" data-remove>Quitar</button>
  `;
  container.appendChild(row);
};

const addModelRow = () => {
  const container = document.getElementById('order-models');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'order-row';
  row.innerHTML = `
    <input name="model_name" placeholder="Modelo / pieza" />
    <button type="button" class="btn btn--ghost" data-remove>Quitar</button>
  `;
  container.appendChild(row);
};

const setupOrderForm = () => {
  const addFilamentBtn = document.getElementById('add-filament');
  const addSupplyBtn = document.getElementById('add-supply');
  const addModelBtn = document.getElementById('add-model');
  const filamentContainer = document.getElementById('order-filaments');
  const supplyContainer = document.getElementById('order-supplies');
  const modelContainer = document.getElementById('order-models');

  if (addFilamentBtn && filamentContainer) {
    addFilamentBtn.addEventListener('click', addFilamentRow);
    filamentContainer.addEventListener('click', (e) => {
      if (e.target && e.target.hasAttribute('data-remove')) {
        e.target.closest('.order-row')?.remove();
      }
    });
  }

  if (addSupplyBtn && supplyContainer) {
    addSupplyBtn.addEventListener('click', addSupplyRow);
    supplyContainer.addEventListener('click', (e) => {
      if (e.target && e.target.hasAttribute('data-remove')) {
        e.target.closest('.order-row')?.remove();
      }
    });
  }

  if (addModelBtn && modelContainer) {
    addModelBtn.addEventListener('click', addModelRow);
    modelContainer.addEventListener('click', (e) => {
      if (e.target && e.target.hasAttribute('data-remove')) {
        e.target.closest('.order-row')?.remove();
      }
    });
  }
};

const formToJson = (form) => Object.fromEntries(new FormData(form));

const handleSubmit = (id, endpoint, transform) => {
  const form = document.getElementById(id);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = formToJson(form);
    const payload = transform ? transform(raw) : raw;
    await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    await refresh();
  });
};

handleSubmit('printer-form', '/printers', (raw) => ({
  brand: raw.brand,
  model: raw.model,
  price: Number(raw.price || 0),
  purchase_date: raw.purchase_date || null,
}));
handleSubmit('filament-form', '/filaments');
handleSubmit('supply-form', '/supplies');
handleSubmit('financial-form', '/financials');

handleSubmit('order-form', '/orders', () => {
  const details = { filaments: [], supplies: [] };
  const models = [];
  document.querySelectorAll('#order-models .order-row').forEach((row) => {
    const name = row.querySelector('input[name="model_name"]')?.value?.trim();
    if (name) models.push(name);
  });
  document.querySelectorAll('#order-filaments .order-row').forEach((row) => {
    const id = Number(row.querySelector('select[name="filament_id"]')?.value || 0);
    const grams = Number(row.querySelector('input[name="filament_grams"]')?.value || 0);
    if (id && grams) {
      details.filaments.push({ id, grams });
    }
  });
  document.querySelectorAll('#order-supplies .order-row').forEach((row) => {
    const id = Number(row.querySelector('select[name="supply_id"]')?.value || 0);
    const qty = Number(row.querySelector('input[name="supply_qty"]')?.value || 0);
    if (id && qty) {
      details.supplies.push({ id, qty });
    }
  });

  const payload = {
    customer_name: document.querySelector('[name="customer_name"]')?.value || '',
    details,
    models,
    total_charge: Number(document.querySelector('[name="total_charge"]')?.value || 0),
  };
  const created = document.querySelector('[name="created_date"]')?.value;
  const due = document.querySelector('[name="due_date"]')?.value;
  if (created) payload.created_date = created;
  if (due) payload.due_date = due;
  return payload;
});

const budgetForm = document.getElementById('budget-form');
const budgetResult = document.getElementById('budget-result');

budgetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = formToJson(budgetForm);
  const payload = {
    filament_id: raw.filament_id ? Number(raw.filament_id) : null,
    model_grams: Number(raw.model_grams || 0),
    print_hours: Number(raw.print_hours || 0),
    print_minutes: Number(raw.print_minutes || 0),
    post_hours: Number(raw.post_hours || 0),
    post_minutes: Number(raw.post_minutes || 0),
    labor_hour_cost: Number(raw.labor_hour_cost || 1500),
    markup_multiplier: Number(raw.markup_multiplier || 3),
  };

  try {
    const data = await api('/budget', { method: 'POST', body: JSON.stringify(payload) });
    budgetResult.textContent = `Base: $${formatNumber(data.base_cost)} | Precio: $${formatNumber(data.price)} | Filamento: $${formatNumber(data.filament_cost)} | Maquina: $${formatNumber(data.machine_cost)} | Mano de obra: $${formatNumber(data.labor_cost)}`;
  } catch (err) {
    budgetResult.textContent = err.message;
  }
});

const ordersList = document.getElementById('orders');
if (ordersList) {
  ordersList.addEventListener('click', async (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.dataset.complete) {
      await api(`/orders/${target.dataset.complete}/complete`, { method: 'PATCH' });
      await refresh();
    }
    if (target instanceof HTMLElement && target.dataset.toggle) {
      const details = ordersList.querySelector(`[data-details="${target.dataset.toggle}"]`);
      if (details) details.classList.toggle('is-open');
    }
  });
}

const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    navItems.forEach((btn) => btn.classList.remove('is-active'));
    item.classList.add('is-active');
    const target = item.dataset.page;
    pages.forEach((page) => {
      page.classList.toggle('is-active', page.dataset.section === target);
    });
  });
});

setupOrderForm();
refresh();
