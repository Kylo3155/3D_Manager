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

const state = {
  printers: [],
  filaments: [],
  supplies: [],
  financials: [],
  orders: [],
};

const refresh = async () => {
  const printers = await api('/printers');
  state.printers = printers;
  renderList(listEl('printers'), printers, (p) => {
    const price = formatNumber(p.price || 0);
    const date = p.purchase_date || '-';
    return `
      <span>${p.brand} <small>${p.model}</small></span>
      <small>$${price}</small>
      <small class="list-actions"><span>${date}</span><button class="btn btn--ghost" data-edit="printers" data-id="${p.id}">Editar</button></small>
    `;
  });

  const filaments = await api('/filaments');
  state.filaments = filaments;
  renderList(listEl('filaments'), filaments, (f) =>
    `<span>${f.name} <small>${f.color || ''}</small></span>`
      + `<small>${formatInteger(f.stock_grams)} g | $${formatNumber(f.cost_per_kg || 0)}/kg</small>`
      + `<small class="list-actions"><span>${f.extruder_temp_c ?? '-'}C / ${f.bed_temp_c ?? '-'}C</span><button class="btn btn--ghost" data-edit="filaments" data-id="${f.id}">Editar</button></small>`
  );
  updateFilamentOptions(filaments);

  const filamentMap = new Map(
    filaments.map((f) => [String(f.id), `${f.name}${f.color ? ` (${f.color})` : ''}`])
  );

  const supplies = await api('/supplies');
    state.supplies = supplies;
  renderList(listEl('supplies'), supplies, (s) =>
    `<span>${s.name}</span>
      <small>${formatInteger(s.stock_qty)} u</small>
      <small class="list-actions"><span>$${formatNumber(s.unit_cost || 0)}/u | Total: $${formatNumber(Number(s.unit_cost || 0) * Number(s.stock_qty || 0))}</span><button class="btn btn--ghost" data-edit="supplies" data-id="${s.id}">Editar</button></small>`
  );
  updateSupplyOptions(supplies);

  const supplyMap = new Map(supplies.map((s) => [String(s.id), s.name]));

  const financials = await api('/financials');
  state.financials = financials;
  renderList(listEl('financials'), financials, (m) =>
    `<span>${m.type === 'income' ? 'Ingreso' : 'Egreso'}: ${m.description || ''}</span><small class="list-actions"><span>$${formatNumber(m.amount || 0)}</span><button class="btn btn--ghost" data-edit="financials" data-id="${m.id}">Editar</button></small>`
  );
  updateFinanceSummary(financials);

  const orders = await api('/orders');
  state.orders = orders;
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
      <small class="list-actions">
        ${status}
        ${o.completed ? '' : `<button class="btn btn--ghost" data-complete="${o.id}">Completar</button>`}
        <button class="btn btn--ghost" data-toggle="${o.id}">Detalles</button>
        <button class="btn btn--ghost" data-edit="orders" data-id="${o.id}">Editar</button>
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

  renderFinanceChart(financials);
};

const getWeekStart = (date) => {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatKey = (date, mode) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (mode === 'day') return `${year}-${month}-${day}`;
  if (mode === 'month') return `${year}-${month}`;
  if (mode === 'year') return `${year}`;
  const start = getWeekStart(date);
  const startMonth = String(start.getMonth() + 1).padStart(2, '0');
  const startDay = String(start.getDate()).padStart(2, '0');
  return `${start.getFullYear()}-W${startMonth}${startDay}`;
};

const labelFromKey = (key, mode) => {
  if (mode === 'day') return key.slice(5);
  if (mode === 'month') return key;
  if (mode === 'year') return key;
  return key.replace('-W', ' W ');
};

const buildBuckets = (mode) => {
  const now = new Date();
  const buckets = [];
  const count = mode === 'day' ? 14 : mode === 'week' ? 12 : mode === 'month' ? 12 : 5;
  const cursor = new Date(now);
  for (let i = 0; i < count; i += 1) {
    const current = new Date(cursor);
    buckets.unshift({ key: formatKey(current, mode), label: labelFromKey(formatKey(current, mode), mode) });
    if (mode === 'day') cursor.setDate(cursor.getDate() - 1);
    if (mode === 'week') cursor.setDate(cursor.getDate() - 7);
    if (mode === 'month') cursor.setMonth(cursor.getMonth() - 1);
    if (mode === 'year') cursor.setFullYear(cursor.getFullYear() - 1);
  }
  return buckets;
};

const renderFinanceChart = (financials) => {
  const container = document.getElementById('finance-chart');
  const range = document.getElementById('finance-range');
  if (!container || !range) return;
  const mode = range.value;
  const buckets = buildBuckets(mode);
  const data = new Map(buckets.map((b) => [b.key, 0]));

  financials.forEach((m) => {
    const dateStr = m.created_at || m.created_date;
    if (!dateStr) return;
    const date = new Date(dateStr);
    const key = formatKey(date, mode);
    if (!data.has(key)) return;
    const delta = m.type === 'income' ? Number(m.amount || 0) : -Number(m.amount || 0);
    data.set(key, (data.get(key) || 0) + delta);
  });

  const values = buckets.map((b) => data.get(b.key) || 0);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const width = 640;
  const height = 220;
  const padding = 32;
  const chartHeight = height - padding * 2;
  const mid = padding + chartHeight / 2;
  const step = (width - padding * 2) / Math.max(values.length - 1, 1);

  let points = '';
  let segments = '';
  let labels = '';
  const coords = values.map((value, index) => {
    const x = padding + index * step;
    const y = mid - (value / maxAbs) * (chartHeight / 2);
    return { x, y, value };
  });

  coords.forEach((point, index) => {
    points += `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y} `;
    const fill = point.value >= 0 ? '#1dbf73' : '#ef4444';
    segments += `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="${fill}" />`;
    labels += `<text x="${point.x}" y="${height - 6}" fill="#9aa0a6" font-size="10" text-anchor="middle">${buckets[index].label}</text>`;
  });

  const axisValues = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];
  const axisLabels = axisValues
    .map((val) => {
      const y = mid - (val / maxAbs) * (chartHeight / 2);
      return `<text x="${padding - 8}" y="${y + 4}" fill="#9aa0a6" font-size="10" text-anchor="end">$${formatNumber(val)}</text>`;
    })
    .join('');

  const axisLines = axisValues
    .map((val) => {
      const y = mid - (val / maxAbs) * (chartHeight / 2);
      return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#1f232b" stroke-width="1" />`;
    })
    .join('');

  const svg = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Ganancia por periodo" data-width="${width}">
      ${axisLines}
      ${axisLabels}
      <path d="${points}" fill="none" stroke="#9aa0a6" stroke-width="2" />
      ${segments}
      ${labels}
    </svg>
  `;

  container.innerHTML = svg;
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
    `<span><span class="tag ${m.type === 'income' ? 'tag--income' : 'tag--expense'}">${m.type === 'income' ? 'Ingreso' : 'Egreso'}</span>${m.description || ''}</span><small class="list-actions"><span>$${formatNumber(m.amount || 0)}</span><button class="btn btn--ghost" data-edit="financials" data-id="${m.id}">Editar</button></small>`
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

const financeRange = document.getElementById('finance-range');
if (financeRange) {
  financeRange.addEventListener('change', () => {
    renderFinanceChart(state.financials);
  });
}

const modal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const modalTitle = document.getElementById('modal-title');

const closeModal = () => {
  modal?.classList.remove('is-open');
  modal?.setAttribute('aria-hidden', 'true');
  if (editForm) editForm.innerHTML = '';
};

const openModal = (title, fields, onSubmit) => {
  if (!modal || !editForm || !modalTitle) return;
  modalTitle.textContent = title;
  editForm.innerHTML = fields.join('');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  const handler = async (e) => {
    e.preventDefault();
    await onSubmit(new FormData(editForm));
    editForm.removeEventListener('submit', handler);
  };
  editForm.addEventListener('submit', handler);
};

modal?.addEventListener('click', (e) => {
  if (e.target instanceof HTMLElement && e.target.hasAttribute('data-close')) {
    closeModal();
  }
});

const toField = (label, name, value, type = 'text', extra = '') =>
  `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${value ?? ''}" ${extra}></div>`;

const toTextarea = (label, name, value) =>
  `<div class="field"><label>${label}</label><textarea name="${name}" rows="4">${value ?? ''}</textarea></div>`;

const toSelect = (label, name, value, options) => {
  const opts = options
    .map((opt) => `<option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${opt.label}</option>`)
    .join('');
  return `<div class="field"><label>${label}</label><select name="${name}">${opts}</select></div>`;
};

const toCheckbox = (label, name, checked) =>
  `<div class="field"><label>${label}</label><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}></div>`;

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const setupEditHandlers = () => {
  document.body.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.dataset.edit || !target.dataset.id) return;

    const entity = target.dataset.edit;
    const id = Number(target.dataset.id);

    if (entity === 'printers') {
      const item = state.printers.find((p) => p.id === id);
      if (!item) return;
      const fields = [
        toField('Marca', 'brand', item.brand),
        toField('Modelo', 'model', item.model),
        toField('Precio', 'price', item.price, 'number', 'step="0.01"'),
        toField('Fecha de compra', 'purchase_date', item.purchase_date || '', 'date'),
      ];
      openModal('Editar impresora', fields, async (data) => {
        await api(`/printers/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            brand: data.get('brand'),
            model: data.get('model'),
            price: Number(data.get('price') || 0),
            purchase_date: data.get('purchase_date') || null,
          }),
        });
        closeModal();
        await refresh();
      });
    }

    if (entity === 'filaments') {
      const item = state.filaments.find((f) => f.id === id);
      if (!item) return;
      const fields = [
        toField('Nombre', 'name', item.name),
        toField('Color', 'color', item.color || ''),
        toField('Material', 'material', item.material || ''),
        toField('Stock (g)', 'stock_grams', item.stock_grams, 'number'),
        toField('Costo por kg', 'cost_per_kg', item.cost_per_kg, 'number', 'step="0.01"'),
        toField('Temp. extrusor (C)', 'extruder_temp_c', item.extruder_temp_c ?? '', 'number'),
        toField('Temp. cama (C)', 'bed_temp_c', item.bed_temp_c ?? '', 'number'),
      ];
      openModal('Editar filamento', fields, async (data) => {
        await api(`/filaments/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: data.get('name'),
            color: data.get('color') || null,
            material: data.get('material') || null,
            stock_grams: Number(data.get('stock_grams') || 0),
            cost_per_kg: Number(data.get('cost_per_kg') || 0),
            extruder_temp_c: data.get('extruder_temp_c') ? Number(data.get('extruder_temp_c')) : null,
            bed_temp_c: data.get('bed_temp_c') ? Number(data.get('bed_temp_c')) : null,
          }),
        });
        closeModal();
        await refresh();
      });
    }

    if (entity === 'supplies') {
      const item = state.supplies.find((s) => s.id === id);
      if (!item) return;
      const fields = [
        toField('Nombre', 'name', item.name),
        toField('Stock', 'stock_qty', item.stock_qty, 'number'),
        toField('Costo unitario', 'unit_cost', item.unit_cost, 'number', 'step="0.01"'),
      ];
      openModal('Editar insumo', fields, async (data) => {
        await api(`/supplies/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: data.get('name'),
            stock_qty: Number(data.get('stock_qty') || 0),
            unit_cost: Number(data.get('unit_cost') || 0),
          }),
        });
        closeModal();
        await refresh();
      });
    }

    if (entity === 'financials') {
      const item = state.financials.find((m) => m.id === id);
      if (!item) return;
      const fields = [
        toSelect('Tipo', 'type', item.type, [
          { value: 'income', label: 'Ingreso' },
          { value: 'expense', label: 'Egreso' },
        ]),
        toField('Monto', 'amount', item.amount, 'number', 'step="0.01"'),
        toField('Descripcion', 'description', item.description || ''),
      ];
      openModal('Editar movimiento', fields, async (data) => {
        await api(`/financials/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            type: data.get('type'),
            amount: Number(data.get('amount') || 0),
            description: data.get('description') || null,
          }),
        });
        closeModal();
        await refresh();
      });
    }

    if (entity === 'orders') {
      const item = state.orders.find((o) => o.id === id);
      if (!item) return;
      const detailsText = JSON.stringify(item.details || { filaments: [], supplies: [] }, null, 2);
      const modelsText = JSON.stringify(item.models || [], null, 2);
      const fields = [
        toField('Cliente', 'customer_name', item.customer_name || ''),
        toField('Fecha creacion', 'created_date', item.created_date || '', 'date'),
        toField('Fecha entrega', 'due_date', item.due_date || '', 'date'),
        toField('Cobro total', 'total_charge', item.total_charge, 'number', 'step="0.01"'),
        toCheckbox('Completado', 'completed', item.completed),
        toTextarea('Modelos (JSON)', 'models', modelsText),
        toTextarea('Detalles (JSON)', 'details', detailsText),
      ];
      openModal('Editar pedido', fields, async (data) => {
        const models = parseJson(data.get('models'), []);
        const details = parseJson(data.get('details'), { filaments: [], supplies: [] });
        await api(`/orders/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            customer_name: data.get('customer_name') || '',
            created_date: data.get('created_date') || null,
            due_date: data.get('due_date') || null,
            total_charge: Number(data.get('total_charge') || 0),
            completed: data.get('completed') === 'on',
            models,
            details,
          }),
        });
        closeModal();
        await refresh();
      });
    }
  });
};

setupEditHandlers();
