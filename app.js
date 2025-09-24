// Simple SPA with hash routing, localStorage persistence, and mock data

const Storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
  remove(key) { localStorage.removeItem(key); }
};

// Seed mock data once
function seedMockData() {
  // Sempre regrava os dados de demonstração ao carregar a página

  /** Mock items catalog (with alternatives mapping) */
  const itemsCatalog = [
    { code: 'MAT-0001', description: 'Chapa Aço 3mm', unit: 'PC', location: 'DEP-01 / A-01' },
    { code: 'MAT-0002', description: 'Parafuso M8x30', unit: 'PC', location: 'DEP-01 / B-05' },
    { code: 'MAT-0003', description: 'Porca M8', unit: 'PC', location: 'DEP-02 / C-10' },
    { code: 'MAT-0004', description: 'Arruela M8', unit: 'PC', location: 'DEP-02 / C-11' },
    { code: 'MAT-0100', description: 'Parafuso M8x32 (Alt 1)', unit: 'PC', location: 'DEP-01 / B-06' },
    { code: 'MAT-0101', description: 'Parafuso M8x35 (Alt 2)', unit: 'PC', location: 'DEP-01 / B-07' },
    { code: 'MAT-0200', description: 'Chapa Aço 2.9mm (Alt)', unit: 'PC', location: 'DEP-01 / A-02' },
  ];

  const alternatives = {
    'MAT-0001': ['MAT-0200'],
    'MAT-0002': ['MAT-0100', 'MAT-0101'],
  };

  /** Mock OPs */
  const orders = [
    {
      id: 'OP-1001', productCode: 'PROD-AX12', productDesc: 'Carroceria Modelo AX12', status: 'ativa',
      requiredItems: [
        { code: 'MAT-0001', quantity: 4 },
        { code: 'MAT-0002', quantity: 20 },
        { code: 'MAT-0003', quantity: 20 },
        { code: 'MAT-0004', quantity: 20 },
      ]
    },
    {
      id: 'OP-1002', productCode: 'PROD-BX20', productDesc: 'Carroceria Modelo BX20', status: 'ativa',
      requiredItems: [
        { code: 'MAT-0001', quantity: 2 },
        { code: 'MAT-0002', quantity: 10 },
        { code: 'MAT-0003', quantity: 10 },
      ]
    },
  ];

  Storage.set('catalog', { itemsCatalog, alternatives });
  Storage.set('orders', orders);
  Storage.set('separations', []);
  Storage.set('history', []);
  Storage.remove('operator');
}

seedMockData();

// Session
const Session = {
  get operator() { return Storage.get('operator', null); },
  login(username) {
    const op = { username, name: username.toUpperCase(), loggedAt: new Date().toISOString() };
    Storage.set('operator', op);
    return op;
  },
  logout() { Storage.remove('operator'); }
};

// Utils
const fmtDateTime = (iso) => new Date(iso).toLocaleString();
const nowIso = () => new Date().toISOString();

// Navigation
function navigate(route) {
  console.log('[nav] navigate to', route);
  if (!route) route = location.hash || '#/separar';
  if (!Session.operator && route !== '#/login') {
    openLoginDialog(() => {
      render(route);
    });
    return;
  }
  render(route);
}

window.addEventListener('hashchange', () => navigate(location.hash));
window.addEventListener('load', () => { console.log('[app] loaded'); navigate(location.hash); });
// Global safety listener in case specific listeners fail to bind
document.addEventListener('click', (ev) => {
  const target = ev.target;
  if (!target) return;
  if (target.id === 'btn-finalizar-total' || target.getAttribute('data-action') === 'finalize-total') {
    console.log('[global] captured click on finalize total');
    // Call action as a safety net
    try { window.__onFinalizeTotal?.(); } catch {}
  }
});

// DOM helpers
const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.substring(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  });
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null) continue;
    e.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return e;
};

// Views
let separarFilter = 'todas'; // 'todas' | 'parcial' | 'sem-separacao'
function render(route) {
  const container = document.getElementById('view-container');
  container.innerHTML = '';

  syncOperatorHeader();

  console.log('[render] route', route);
  if (route.startsWith('#/parciais')) return container.appendChild(ViewParciais());
  if (route.startsWith('#/ddp354')) return container.appendChild(ViewDDP354());
  if (route.startsWith('#/finalizadas')) return container.appendChild(ViewFinalizadas());
  if (route.startsWith('#/relatorios')) return container.appendChild(ViewRelatorios());
  return container.appendChild(ViewSeparar());
}

function syncOperatorHeader() {
  const op = Session.operator;
  const opName = document.getElementById('op-name');
  const btnLogout = document.getElementById('btn-logout');
  const btnOpenLogin = document.getElementById('btn-open-login');
  if (op) {
    opName.textContent = `Operador: ${op.name}`;
    btnLogout.hidden = false;
    btnOpenLogin.style.display = 'none';
  } else {
    opName.textContent = 'Não autenticado';
    btnLogout.hidden = true;
    btnOpenLogin.style.display = '';
  }
}

document.getElementById('btn-open-login').addEventListener('click', () => openLoginDialog());
document.getElementById('btn-logout').addEventListener('click', () => { Session.logout(); syncOperatorHeader(); });

function openLoginDialog(onSuccess) {
  const dlg = document.getElementById('dialog-login');
  const form = document.getElementById('login-form');
  const user = document.getElementById('login-user');
  const pass = document.getElementById('login-pass');
  const err = document.getElementById('login-error');
  user.value = '';
  pass.value = '';
  dlg.showModal();
  const submit = (ev) => {
    ev?.preventDefault();
    if (!user.value || !pass.value) return;
    const u = user.value.trim();
    const p = pass.value.trim();
    const isDemoValid = (u === 'operador' && p === '1234');
    if (!isDemoValid) { err.style.display = ''; return; }
    err.style.display = 'none';
    Session.login(u);
    dlg.close();
    form.removeEventListener('submit', submit);
    syncOperatorHeader();
    if (typeof onSuccess === 'function') onSuccess();
  };
  form.addEventListener('submit', submit);
}

// Data helpers
function getOrders() { return Storage.get('orders', []); }
function getCatalog() { return Storage.get('catalog', { itemsCatalog: [], alternatives: {} }); }
function getSeparations() { return Storage.get('separations', []); }
function saveSeparations(data) { Storage.set('separations', data); }
function getHistory() { return Storage.get('history', []); }
function saveHistory(h) { Storage.set('history', h); }

// Business logic
function buildChecklistFromOrder(orderId) {
  const { itemsCatalog, alternatives } = getCatalog();
  const order = getOrders().find(o => o.id === orderId);
  if (!order) return null;
  const items = order.requiredItems.map(req => {
    const item = itemsCatalog.find(i => i.code === req.code);
    return {
      baseCode: req.code,
      currentCode: req.code,
      quantity: req.quantity,
      unit: item?.unit ?? 'UN',
      location: item?.location ?? '-',
      description: item?.description ?? req.code,
      alternatives: alternatives[req.code] || [],
      confirmed: false,
      substitution: null
    };
  });
  return items;
}

function ensureSeparation(orderId) {
  const sep = getSeparations();
  // 1) If there is an unfinished separation, use it
  let rec = sep.find(s => s.orderId === orderId && !s.finishedAt);
  if (rec) return rec;
  // 2) If there is a partial already finished, reopen it instead of creating a new one
  const partials = sep.filter(s => s.orderId === orderId && s.finishedAt && s.finalizeMode === 'parcial');
  if (partials.length > 0) {
    // choose the most recent by finishedAt
    partials.sort((a,b) => new Date(b.finishedAt) - new Date(a.finishedAt));
    rec = partials[0];
    rec.finishedAt = null;
    delete rec.finalizeMode;
    saveSeparations(sep);
    return rec;
  }
  // 3) Otherwise create a new separation from scratch
  const order = getOrders().find(o => o.id === orderId);
  rec = {
    orderId,
    productCode: order?.productCode,
    productDesc: order?.productDesc,
    operator: Session.operator?.username,
    startedAt: nowIso(),
    finishedAt: null,
    items: buildChecklistFromOrder(orderId),
    history: [] // substitutions and events
  };
  sep.push(rec);
  saveSeparations(sep);
  return rec;
}

function updateSeparation(orderId, updater) {
  const sep = getSeparations();
  const idx = sep.findIndex(s => s.orderId === orderId && !s.finishedAt);
  if (idx === -1) return;
  updater(sep[idx]);
  saveSeparations(sep);
}

function finalizeSeparation(orderId, mode) {
  updateSeparation(orderId, rec => {
    rec.finishedAt = nowIso();
    rec.finalizeMode = mode; // 'total' | 'parcial'
    // Garantir que productCode e productDesc estão salvos para o relatório
    if (!rec.productCode || !rec.productDesc) {
      const order = getOrders().find(o => o.id === orderId);
      if (order) {
        rec.productCode = order.productCode;
        rec.productDesc = order.productDesc;
      }
    }
  });
}

function removeSeparation(orderId) {
  const all = getSeparations();
  const next = all.filter(s => s.orderId !== orderId);
  saveSeparations(next);
}

// Components / Views
function ViewSeparar() {
  const root = el('div', { class: 'grid', id: 'view-separar' });

  const searchCard = el('div', { class: 'card grid' }, [
    el('div', { style: 'font-weight:700; margin-bottom:4px' }, 'Separar Materiais'),
    el('div', { class: 'search-row' }, [
      el('label', {}, [
        el('span', {}, 'Código da OP'),
        el('input', { id: 'inp-op', placeholder: 'ex.: OP-1001' })
      ]),
      el('label', {}, [
        el('span', {}, 'Código do Produto'),
        el('input', { id: 'inp-prod', placeholder: 'ex.: PROD-AX12' })
      ]),
      el('div', {}, el('button', { class: 'btn', id: 'btn-buscar', onclick: onBuscar }, 'Buscar'))
    ]),
    (() => {
      const wrap = el('div', { style: 'display:flex; gap:8px; flex-wrap:wrap; align-items:center' });
      const mk = (value, label) => {
        const active = separarFilter === value;
        const b = el('button', { class: active ? 'btn' : 'btn btn-ghost' }, label);
        b.addEventListener('click', () => { separarFilter = value; onBuscar(); });
        return b;
      };
      wrap.appendChild(el('div', { class: 'muted' }, 'Filtro:'));
      wrap.appendChild(mk('todas', 'Todas'));
      wrap.appendChild(mk('parcial', 'Parciais'));
      wrap.appendChild(mk('sem-separacao', 'Sem Separação'));
      // Reaplica classe ativa após cada busca
      setTimeout(() => {
        const buttons = wrap.querySelectorAll('button');
        buttons.forEach(btn => {
          const map = { 'Todas': 'todas', 'Parciais': 'parcial', 'Sem Separação': 'sem-separacao' };
          const val = map[btn.textContent] || 'todas';
          btn.className = (separarFilter === val) ? 'btn' : 'btn btn-ghost';
        });
      }, 0);
      return wrap;
    })(),
    el('div', { class: 'muted' }, 'Busque por OP ou Produto. OPs já finalizadas (total) não aparecem aqui. OPs com separação parcial são sinalizadas e podem ser retomadas pelo botão.'),
    el('div', { id: 'op-list', class: 'op-list' })
  ]);

  const content = el('div', { class: 'two-col' }, [
    searchCard,
    el('div', { class: 'card sticky' }, [
      el('div', { class: 'grid' }, [
        el('div', { class: 'grid' }, [
          el('div', { class: 'muted' }, 'Dica: pesquise por OP ou Produto.'),
          el('div', { class: 'muted' }, 'Selecione uma OP para abrir o checklist.'),
          el('p', { class: 'muted' }, 'Funcionalidade: esta página lista e permite abrir OPs ativas para iniciar a separação de materiais. Todas as ações são vinculadas ao operador logado.'),
        ])
      ])
    ])
  ]);

  function onBuscar() {
    const vOp = document.getElementById('inp-op').value.trim().toUpperCase();
    const vProd = document.getElementById('inp-prod').value.trim().toUpperCase();
    const list = document.getElementById('op-list');
    list.innerHTML = '';
    const history = getHistory().filter(r => r.finalizeMode === 'total');
    const finalizedIds = new Set(history.map(r => r.orderId));
    const partialIds = new Set(getSeparations().filter(s => s.finalizeMode === 'parcial' && s.finishedAt).map(s => s.orderId));
    // Primeiro filtra por busca (OP/Produto) e remove finalizadas
    let results = getOrders().filter(o => 
      (!vOp || o.id.toUpperCase().includes(vOp)) && 
      (!vProd || o.productCode.toUpperCase().includes(vProd)) &&
      !finalizedIds.has(o.id) // Remove finalizadas de todos os filtros
    );
    
    if (separarFilter === 'parcial') {
      // Apenas OPs com separação parcial (não finalizadas)
      results = results.filter(o => partialIds.has(o.id));
    } else if (separarFilter === 'sem-separacao') {
      // Apenas OPs sem nenhum item separado (não finalizadas)
      const separations = getSeparations();
      results = results.filter(o => {
        const sep = separations.find(s => s.orderId === o.id);
        if (!sep) return true; // OP sem separação iniciada
        // OP com separação iniciada mas sem itens confirmados
        return sep.items.every(item => !item.confirmed);
      });
    } else {
      // todas: mantém todas as OPs ativas (não finalizadas)
    }
    if (!results.length) {
      list.appendChild(el('div', { class: 'op-item' }, [
        el('div', {}, 'Nenhuma OP encontrada.'),
      ]));
      return;
    }
    for (const o of results) {
      list.appendChild(el('div', { class: 'op-item' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600' }, `${o.id} • ${o.productCode}`),
          el('div', { class: 'muted' }, o.productDesc),
          (() => {
            // Como finalizadas foram removidas, só mostra status para parciais
            if (partialIds.has(o.id)) {
              return el('div', { class: 'status-chip status-pend' }, 'Separação Parcial');
            }
            // Para "Sem Separação", verifica se tem separação iniciada mas sem itens confirmados
            if (separarFilter === 'sem-separacao') {
              const sep = getSeparations().find(s => s.orderId === o.id);
              if (sep && sep.items.some(item => item.confirmed)) {
                return el('div', { class: 'status-chip status-sub' }, 'Em Andamento');
              }
            }
            return null;
          })()
        ]),
        el('div', {}, el('button', { class: 'btn', onclick: () => openChecklist(o.id) }, 'Abrir Checklist'))
      ]));
    }
  }

  // initial load with all active
  setTimeout(() => document.getElementById('btn-buscar').click(), 0);

  root.appendChild(content);
  return root;
}

function openChecklist(orderId) {
  const container = document.getElementById('view-container');
  container.innerHTML = '';
  container.appendChild(ViewChecklist(orderId));
}

function ViewChecklist(orderId) {
  const { itemsCatalog } = getCatalog();
  const order = getOrders().find(o => o.id === orderId);
  const separation = ensureSeparation(orderId);

  function renderHeader() {
    return el('div', { class: 'card grid' }, [
      el('div', { style: 'display:flex; justify-content:space-between; align-items:center' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700' }, `${order.id} • ${order.productCode}`),
          el('div', { class: 'muted' }, order.productDesc),
          el('div', { class: 'muted' }, `Início: ${fmtDateTime(separation.startedAt)} | Operador: ${Session.operator?.name}`),
        ]),
        el('div', {}, el('button', { class: 'btn btn-ghost', onclick: () => history.back() }, 'Voltar'))
      ]),
      el('p', { class: 'muted' }, 'Funcionalidade: confirme cada item do checklist após a separação física. Se algum item não estiver disponível, escolha um alternativo. Só é possível finalizar totalmente quando todos os itens estiverem confirmados.')
    ]);
  }

  function countStatus(items) {
    let confirmed = 0, pending = 0, substituted = 0;
    for (const it of items) {
      if (it.confirmed) confirmed++; else pending++;
      if (it.substitution) substituted++;
    }
    return { confirmed, pending, substituted };
  }

  function renderChecklist() {
    console.log('[checklist] render with items', separation.items?.length);
    const wrapper = el('div', { class: 'checklist' });
    const table = el('table', { class: 'table' });
    const thead = el('thead', {}, el('tr', {}, [
      el('th', { class: 'col-code' }, 'CODIGO'),
      el('th', { class: 'col-dep' }, 'DEPOSITO'),
      el('th', { class: 'col-loc' }, 'Localização'),
      el('th', { class: 'col-qty' }, 'qtde'),
      el('th', { class: 'col-desc' }, 'Descrição'),
      el('th', { class: 'col-unit' }, 'Un'),
      el('th', { class: 'col-actions' }, 'Ações')
    ]));
    const tbody = el('tbody');
    for (const [idx, it] of separation.items.entries()) {
      console.log('[checklist] row', idx, it.currentCode, 'confirmed=', it.confirmed);
      const dep = (it.location || '').split('/')[0].trim();
      const tr = el('tr');
      const chk = el('input', { type: 'checkbox' });
      chk.checked = it.confirmed;
      chk.addEventListener('change', () => {
        console.log('[checklist] toggle item', idx, '=>', chk.checked);
        updateSeparation(orderId, rec => {
          rec.items[idx].confirmed = chk.checked;
          if (chk.checked) {
            rec.items[idx].confirmedBy = Session.operator?.username;
            rec.items[idx].confirmedAt = nowIso();
          } else {
            delete rec.items[idx].confirmedBy;
            delete rec.items[idx].confirmedAt;
          }
        });
        rerender();
      });
      const btnAlt = el('button', { class: 'btn btn-ghost small', onclick: () => chooseAlternative(idx) }, 'Alternativos');
      tr.appendChild(el('td', {}, [chk, ' ', it.currentCode]));
      tr.appendChild(el('td', {}, dep));
      tr.appendChild(el('td', {}, it.location));
      tr.appendChild(el('td', { style: 'text-align:right' }, String(it.quantity)));
      tr.appendChild(el('td', {}, [
        el('div', {}, it.description),
        it.substitution ? el('div', { class: 'row-sub' }, `Substituído: ${it.baseCode} → ${it.currentCode}`) : null
      ]));
      tr.appendChild(el('td', {}, it.unit));
      tr.appendChild(el('td', { style: 'text-align:right' }, btnAlt));
      tbody.appendChild(tr);
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }

  function renderSummary() {
    const s = countStatus(separation.items);
    const allConfirmed = s.pending === 0;
    const wrapper = el('div', { class: 'card sticky' });
    wrapper.appendChild(el('div', { style: 'font-weight:700; margin-bottom:8px' }, 'Resumo da Separação'));
    wrapper.appendChild(el('div', { style: 'display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px' }, [
      el('div', { class: 'status-chip status-ok' }, `Confirmados: ${s.confirmed}`),
      el('div', { class: 'status-chip status-pend' }, `Pendentes: ${s.pending}`),
      el('div', { class: 'status-chip status-sub' }, `Substituídos: ${s.substituted}`),
    ]));
    wrapper.appendChild(el('div', { id: 'finalize-status', class: 'muted' }, ''));
    // Não desabilitar para garantir captura do clique; a lógica valida pendências
    const btnTotal = el('button', { id: 'btn-finalizar-total', class: 'btn', 'data-action': 'finalize-total', title: allConfirmed ? '' : 'Há itens pendentes' }, 'Finalizar Total');
    // expose a callable for the global safety listener
    window.__onFinalizeTotal = () => onFinalize('total');
    btnTotal.addEventListener('click', (ev) => { console.log('[btn-finalizar-total] click captured'); onFinalize('total'); });
    const btnParcial = el('button', { class: 'btn btn-ghost' }, 'Finalizar Parcial');
    btnParcial.addEventListener('click', () => onFinalize('parcial'));
    wrapper.appendChild(el('div', { class: 'grid' }, [btnTotal, btnParcial]));
    return wrapper;
  }

  function chooseAlternative(itemIndex) {
    console.log('[alt] open for index', itemIndex);
    const { itemsCatalog, alternatives } = getCatalog();
    const base = separation.items[itemIndex].baseCode;
    const allowed = alternatives[base] || [];
    openAlternativesDialog(allowed.map(code => itemsCatalog.find(i => i.code === code)).filter(Boolean), (selected) => {
      if (!selected) return;
      console.log('[alt] selected', selected.code);
      updateSeparation(orderId, rec => {
        const recItem = rec.items[itemIndex];
        recItem.currentCode = selected.code;
        recItem.description = selected.description;
        recItem.unit = selected.unit;
        recItem.location = selected.location;
        recItem.substitution = { from: recItem.baseCode, to: selected.code, operator: Session.operator?.username, at: nowIso() };
        rec.history.push({ type: 'substitution', ...recItem.substitution });
      });
      rerender();
    });
  }

  function onFinalize(mode) {
    console.log('[onFinalize] called with mode=', mode);
    const s = separation.items;
    const pending = s.filter(i => !i.confirmed).length;
    console.log('[onFinalize] pending items=', pending);
    if (mode === 'total' && pending > 0) {
      openConfirm('Finalização Parcial', 'Faltam itens a serem separados no checklist. Deseja finalizar parcialmente?', () => doFinalize('parcial'));
    } else {
      if (mode === 'total') {
        const btn = document.getElementById('btn-finalizar-total');
        const status = document.getElementById('finalize-status');
        console.log('[onFinalize] total flow, btn exists?', !!btn);
        if (status) status.textContent = 'Finalizando separação...';
        if (btn) { btn.classList.add('loading'); btn.textContent = 'Finalizando...'; }
        setTimeout(() => doFinalize(mode), 600);
      } else {
        if (pending === 0) {
          openConfirm('Ação não permitida', 'Todos os itens estão confirmados. Utilize "Finalizar Total".', () => {});
          return;
        }
        console.log('[onFinalize] partial flow proceeding');
        doFinalize(mode);
      }
    }
  }

  function doFinalize(mode) {
    console.log('[doFinalize] starting with mode=', mode);
    finalizeSeparation(orderId, mode);
    const rec = getSeparations().find(s => s.orderId === orderId && s.finishedAt);
    console.log('[doFinalize] record found?', !!rec);
    const info = [
      `Operador: ${Session.operator?.name}`,
      `Início: ${fmtDateTime(rec.startedAt)}`,
      `Fim: ${fmtDateTime(rec.finishedAt)}`,
      `Modo: ${rec.finalizeMode === 'total' ? 'Total' : 'Parcial'}`
    ].join('\n');
    const nextAction = () => {
      if (rec.finalizeMode === 'parcial') {
        console.log('[doFinalize] navigating to parciais');
        location.hash = '#/parciais';
      } else {
        // Total: mover para histórico, remover da lista e voltar ao início
        const h = getHistory();
        // Evitar duplicatas: se já houver um histórico com a mesma OP e mesma finishedAt, atualiza
        const existsIdx = h.findIndex(x => x.orderId === rec.orderId && x.finishedAt === rec.finishedAt);
        if (existsIdx >= 0) h[existsIdx] = { ...rec }; else h.push({ ...rec });
        saveHistory(h);
        removeSeparation(orderId);
        console.log('[doFinalize] finalized total, navigating to separar');
        location.hash = '#/separar';
      }
    };
    const status = document.getElementById('finalize-status');
    const btn = document.getElementById('btn-finalizar-total');
    if (btn) { btn.classList.remove('loading'); btn.textContent = 'Finalizar Total'; }
    if (status) status.textContent = 'Separação finalizada com sucesso.';
    openConfirm('Separação finalizada com sucesso', info, nextAction);
  }

  function rerender() {
    // reload separation fresh from storage
    const fresh = getSeparations().find(s => s.orderId === orderId && !s.finishedAt) || separation;
    separation.items = fresh.items;
    body.innerHTML = '';
    body.appendChild(renderChecklist());
    aside.innerHTML = '';
    aside.appendChild(renderSummary());
  }

  const header = renderHeader();
  const body = el('div', { class: 'card' }, renderChecklist());
  const aside = renderSummary();

  return el('div', { class: 'grid' }, [header, el('div', { class: 'two-col' }, [body, aside])]);
}

function ViewParciais() {
  const root = el('div', { class: 'grid' });
  const list = el('div', { class: 'grid' });

  const filterCard = el('div', { class: 'card grid' }, [
    el('div', { style: 'font-weight:700; margin-bottom:4px' }, 'Ordens com Separação Parcial'),
    el('div', { class: 'search-row' }, [
      el('label', {}, [ el('span', {}, 'Período inicial'), el('input', { type: 'date', id: 'pini' }) ]),
      el('label', {}, [ el('span', {}, 'Período final'), el('input', { type: 'date', id: 'pfim' }) ]),
      el('label', {}, [ el('span', {}, 'OP ou Produto'), el('input', { id: 'ptext', placeholder: 'ex.: OP-1001 ou PROD-AX12' }) ]),
      el('div', {}, el('button', { class: 'btn', onclick: () => renderList() }, 'Filtrar'))
    ]),
    el('p', { class: 'muted' }, 'Filtre separações parciais por período e por OP/Produto. As OPs parciais também aparecem em “Separar Materiais”, com o selo amarelo, para facilitar a retomada.')
  ]);

  function renderList() {
    list.innerHTML = '';
    const ongoing = getSeparations().filter(s => s.finishedAt && s.finalizeMode === 'parcial');
    const txt = (document.getElementById('ptext').value || '').trim().toUpperCase();
    const d0 = document.getElementById('pini').value;
    const d1 = document.getElementById('pfim').value;
    const inRange = (iso) => {
      if (!d0 && !d1) return true;
      const t = new Date(iso).setHours(0,0,0,0);
      const t0 = d0 ? new Date(d0).setHours(0,0,0,0) : -Infinity;
      const t1 = d1 ? new Date(d1).setHours(23,59,59,999) : Infinity;
      return t >= t0 && t <= t1;
    };
    const rows = ongoing.filter(s => {
      const order = getOrders().find(o => o.id === s.orderId);
      if (!order) return false;
      const textOk = !txt || order.id.toUpperCase().includes(txt) || order.productCode.toUpperCase().includes(txt) || (order.productDesc || '').toUpperCase().includes(txt);
      return textOk && inRange(s.finishedAt);
    });

    if (!rows.length) {
      list.appendChild(el('div', { class: 'card' }, 'Nenhuma separação parcial.'));
      return;
    }
    for (const s of rows) {
      const order = getOrders().find(o => o.id === s.orderId);
      const counts = { total: s.items.length, confirmed: s.items.filter(i => i.confirmed).length };
      list.appendChild(el('div', { class: 'op-item' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600' }, `${order.id} • ${order.productCode}`),
          el('div', { class: 'muted' }, order.productDesc),
          el('div', { class: 'muted' }, `Início: ${fmtDateTime(s.startedAt)} | Última finalização: ${fmtDateTime(s.finishedAt)}`),
          el('div', { class: 'muted' }, `Progresso: ${counts.confirmed}/${counts.total} (parcial)`),
        ]),
        el('div', {}, el('div', {}, [
          el('button', { class: 'btn', onclick: () => reopenPartial(s.orderId) }, 'Continuar Separação'),
          el('button', { class: 'btn btn-ghost', style: 'margin-left:8px', onclick: () => openPartialReport(s) }, 'Relatório')
        ]))
      ]));
    }
  }

  root.appendChild(filterCard);
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { style: 'font-weight:700; margin-bottom:8px' }, 'Lista'),
    el('p', { class: 'muted' }, 'Selecione uma OP parcial para continuar a separação do ponto onde parou ou gerar um relatório.'),
    list
  ]));

  setTimeout(renderList, 0);
  return root;
}

function openPartialReport(record) {
  const { itemsCatalog } = getCatalog();
  const title = `Relatório Parcial da OP ${record.orderId}`;
  const header = `Produto: ${record.productCode}\nOperador: ${record.operator}\nInício: ${fmtDateTime(record.startedAt)}\nÚltima parcial: ${fmtDateTime(record.finishedAt)}\n`;
  const sep = '\n'.padEnd(40, '—') + '\n';
  const pending = record.items.filter(i => !i.confirmed);
  const done = record.items.filter(i => i.confirmed);
  const fmt = (it, idx) => {
    const curr = itemsCatalog.find(i => i.code === it.currentCode) || { description: it.description };
    const altFlag = it.substitution ? `(ALT de ${it.baseCode})` : '(OFICIAL)';
    const who = it.confirmedBy ? ` • por ${it.confirmedBy} em ${fmtDateTime(it.confirmedAt)}` : '';
    return `${String(idx+1).padStart(2,'0')}  ${it.currentCode.padEnd(10)}  ${curr.description}  | ${String(it.quantity).padStart(3)} ${it.unit}  ${altFlag}${who}`;
  };
  const msg = `${header}${sep}Itens separados (${done.length}):\n${done.map(fmt).join('\n') || '-'}\n\nItens pendentes (${pending.length}):\n${pending.map(fmt).join('\n') || '-'}`;
  const dlg = document.getElementById('dialog-confirm');
  document.getElementById('confirm-title').textContent = title;
  const msgEl = document.getElementById('confirm-message');
  msgEl.textContent = '';
  msgEl.className = 'report';
  msgEl.textContent = msg;
  const btnOk = document.getElementById('confirm-ok');
  const btnCancel = document.getElementById('confirm-cancel');
  const closeAll = () => { btnOk.onclick = null; btnCancel.onclick = null; dlg.close(); };
  btnOk.textContent = 'Fechar';
  btnOk.onclick = () => closeAll();
  btnCancel.onclick = () => closeAll();
  dlg.showModal();
}

function ViewDDP354() {
  const root = el('div', { class: 'grid' });
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { style: 'font-weight:700; margin-bottom:8px' }, 'DDP 354 — Separação e Validação de Materiais (Diretrizes para Desenvolvimento)'),
    el('p', { class: 'muted' }, 'Documento funcional com diretrizes de construção do módulo no TeepMES. Define escopo, regras, integrações e critérios de aceite.'),
    el('div', { class: 'grid' }, [
      el('div', {}, [
        el('h4', {}, '1. Objetivo'),
        el('p', {}, 'Assegurar que todos os materiais requeridos por OP estejam separados e validados antes da produção, com controle de alternativos, rastreabilidade e autoria do operador.'),
      ]),
      el('div', {}, [
        el('h4', {}, '2. Escopo Funcional'),
        el('ul', {}, [
          el('li', {}, 'Autenticação do operador (responsável por todas as ações).'),
          el('li', {}, 'Busca e seleção de OP por código ou por produto.'),
          el('li', {}, 'Filtros na busca: Todas, Parciais, Sem Separação (ativas).'),
          el('li', {}, 'Checklist de materiais (código, depósito, localização, qtde, descrição, unidade).'),
          el('li', {}, 'Confirmação item a item (check) com rastreabilidade (operador e timestamp).'),
          el('li', {}, 'Seleção de itens alternativos pré-cadastrados, com busca e registro de substituição.'),
          el('li', {}, 'Finalização Total (100% confirmados) e Finalização Parcial (pendentes).'),
          el('li', {}, 'Consulta de Separações Parciais (retomar) e Finalizadas (histórico).'),
          el('li', {}, 'Relatórios detalhados: separados vs pendentes, alternativos, rastreabilidade.'),
          el('li', {}, 'Exportação CSV e impressão de relatórios.'),
        ])
      ]),
      el('div', {}, [
        el('h4', {}, '3. Integrações (ERP/Mestre de Dados)'),
        el('ul', {}, [
          el('li', {}, 'OPs ativas e seus insumos (BOM) devem vir do ERP via integração.'),
          el('li', {}, 'Cadastro de itens: código, descrição, unidade, depósito e localização fixa.'),
          el('li', {}, 'Mapa de alternativos por item padrão (até N alternativos).'),
          el('li', {}, 'Retorno de eventos: separação total/parcial, substituições e responsável.'),
        ])
      ]),
      el('div', {}, [
        el('h4', {}, '4. Regras de Negócio'),
        el('ul', {}, [
          el('li', {}, 'Finalização Total somente com 0 pendentes.'),
          el('li', {}, 'Finalização Parcial exige ao menos 1 pendente.'),
          el('li', {}, 'Registrar substituição contendo: item padrão, alternativo, operador e data.'),
          el('li', {}, 'Registrar timestamps: início da separação e finalização (total/parcial).'),
          el('li', {}, 'Retomar parcial preserva progresso (itens já confirmados/substituídos).'),
        ])
      ]),
      el('div', {}, [
        el('h4', {}, '5. Requisitos Não Funcionais'),
        el('ul', {}, [
          el('li', {}, 'Usabilidade em ambiente fabril (cliques grandes, contraste, responsivo).'),
          el('li', {}, 'Performance: carregamento de OP em < 1s com até 200 itens.'),
          el('li', {}, 'Rastreabilidade: logs de alteração por usuário e horário.'),
          el('li', {}, 'Segurança: perfis de acesso (operador, líder, auditor) e trilha de auditoria.'),
        ])
      ]),
      el('div', {}, [
        el('h4', {}, '6. Critérios de Aceite (exemplos)'),
        el('ul', {}, [
          el('li', {}, 'CA-01: Não permitir finalizar Total com pendentes; exibir sugestão de Parcial.'),
          el('li', {}, 'CA-02: Ao selecionar alternativo, registrar substituição e refletir no checklist.'),
          el('li', {}, 'CA-03: OP finalizada Total deve sumir da tela de Separar e constar em Finalizadas.'),
          el('li', {}, 'CA-04: Relatório de Parcial deve listar separados e pendentes com quantidades.'),
          el('li', {}, 'CA-05: Filtros devem funcionar corretamente (Todas/Parciais/Separar).'),
          el('li', {}, 'CA-06: Rastreabilidade completa: operador e timestamp em cada confirmação.'),
          el('li', {}, 'CA-07: Relatórios devem mostrar dados completos de simulação.'),
        ])
      ]),
      el('div', {}, [
        el('h4', {}, '7. Dados e Estados'),
        el('ul', {}, [
          el('li', {}, 'OP: id, produto (código/descrição), status.'),
          el('li', {}, 'Item do checklist: baseCode, currentCode, descrição, unidade, localização, quantidade, confirmado, substitution, confirmedBy, confirmedAt.'),
          el('li', {}, 'Sessão: operador (usuário, nome, loginAt).'),
          el('li', {}, 'Separação: orderId, productCode, productDesc, operator, startedAt, finishedAt, finalizeMode, items.'),
          el('li', {}, 'Filtros: separarFilter (todas/parcial/sem-separacao).'),
        ])
      ]),
      el('div', {}, [
        el('h4', {}, '8. Roadmap / Próximos Passos (sugestão)'),
        el('ul', {}, [
          el('li', {}, '✅ Impressão/Exportação de relatórios (PDF/CSV) - IMPLEMENTADO.'),
          el('li', {}, 'Scanner de código de barras/QR para confirmar itens.'),
          el('li', {}, 'Reserva/baixa de estoque integrada ao ERP no fechamento.'),
          el('li', {}, 'Dashboard com métricas de separação (tempo médio, eficiência).'),
          el('li', {}, 'Notificações em tempo real para OPs críticas.'),
        ])
      ])
    ])
  ]));
  return root;
}

function ViewFinalizadas() {
  const root = el('div', { class: 'grid' });
  const filters = el('div', { class: 'card grid' }, [
    el('div', { style: 'font-weight:700; margin-bottom:4px' }, 'Separações Finalizadas'),
    el('div', { class: 'search-row' }, [
      el('label', {}, [ el('span', {}, 'Período inicial'), el('input', { type: 'date', id: 'fini' }) ]),
      el('label', {}, [ el('span', {}, 'Período final'), el('input', { type: 'date', id: 'ffin' }) ]),
      el('label', {}, [ el('span', {}, 'OP ou Produto'), el('input', { id: 'ftext', placeholder: 'ex.: OP-1001 ou PROD-AX12' }) ]),
      el('div', {}, el('button', { class: 'btn', onclick: () => renderList() }, 'Filtrar'))
    ]),
    el('p', { class: 'muted' }, 'Consulte separações finalizadas (Total). Filtre por período e OP/Produto e gere um relatório detalhado da OP com itens e alternativos.')
  ]);

  const list = el('div', { class: 'grid' });

  function renderList() {
    list.innerHTML = '';
    const h = getHistory();
    const d0 = document.getElementById('fini').value;
    const d1 = document.getElementById('ffin').value;
    const txt = (document.getElementById('ftext').value || '').trim().toUpperCase();
    const inRange = (iso) => {
      if (!d0 && !d1) return true;
      const t = new Date(iso).setHours(0,0,0,0);
      const t0 = d0 ? new Date(d0).setHours(0,0,0,0) : -Infinity;
      const t1 = d1 ? new Date(d1).setHours(23,59,59,999) : Infinity;
      return t >= t0 && t <= t1;
    };
    const rows = h.filter(r => r.finalizeMode === 'total')
      .filter(r => inRange(r.finishedAt))
      .filter(r => !txt || r.orderId.toUpperCase().includes(txt) || r.productCode?.toUpperCase().includes(txt));

    if (!rows.length) {
      list.appendChild(el('div', { class: 'card' }, 'Nenhuma separação finalizada encontrada.'));
      return;
    }
    for (const r of rows) {
      const order = getOrders().find(o => o.id === r.orderId) || { productCode: r.productCode, productDesc: r.productDesc };
      list.appendChild(el('div', { class: 'op-item' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600' }, `${r.orderId} • ${order.productCode}`),
          el('div', { class: 'muted' }, order.productDesc),
          el('div', { class: 'muted' }, `Finalizada: ${fmtDateTime(r.finishedAt)} | Operador: ${r.operator}`),
        ]),
        el('div', {}, el('button', { class: 'btn', onclick: () => openReport(r) }, 'Relatório'))
      ]));
    }
  }

  function openReport(record) {
    const dlg = document.getElementById('dialog-confirm');
    const title = `Relatório da OP ${record.orderId}`;
    const header = `Produto: ${record.productCode || 'N/A'}\nDescrição: ${record.productDesc || 'N/A'}\nOperador: ${record.operator || 'N/A'}\nInício: ${fmtDateTime(record.startedAt)}\nFim: ${fmtDateTime(record.finishedAt)}\nModo: ${record.finalizeMode === 'total' ? 'Total' : 'Parcial'}`;
    const sep = '\n'.padEnd(50, '—') + '\n';
    
    // Separar itens confirmados e pendentes
    const confirmed = record.items.filter(it => it.confirmed);
    const pending = record.items.filter(it => !it.confirmed);
    
    const lines = [
      `ITENS SEPARADOS (${confirmed.length}/${record.items.length}):`,
      ...confirmed.map((it, idx) => {
        const altFlag = it.substitution ? `(ALT de ${it.baseCode})` : '(OFICIAL)';
        const who = it.confirmedBy ? ` • por ${it.confirmedBy} em ${fmtDateTime(it.confirmedAt)}` : '';
        return `${String(idx+1).padStart(2,'0')}  ${it.currentCode.padEnd(12)}  ${it.description.padEnd(30)}  | ${String(it.quantity).padStart(3)} ${it.unit}  ${altFlag}${who}`;
      }),
      '',
      `ITENS PENDENTES (${pending.length}):`,
      ...pending.map((it, idx) => {
        const altFlag = it.substitution ? `(ALT de ${it.baseCode})` : '(OFICIAL)';
        return `${String(idx+1).padStart(2,'0')}  ${it.currentCode.padEnd(12)}  ${it.description.padEnd(30)}  | ${String(it.quantity).padStart(3)} ${it.unit}  ${altFlag}`;
      })
    ].join('\n');
    
    const msg = `${header}${sep}${lines}`;
    document.getElementById('confirm-title').textContent = title;
    const msgEl = document.getElementById('confirm-message');
    msgEl.textContent = '';
    msgEl.className = 'report';
    msgEl.textContent = msg;
    const btnOk = document.getElementById('confirm-ok');
    const btnCancel = document.getElementById('confirm-cancel');
    const closeAll = () => { btnOk.onclick = null; btnCancel.onclick = null; dlg.close(); };
    btnOk.textContent = 'Fechar';
    btnOk.onclick = () => closeAll();
    btnCancel.onclick = () => closeAll();
    dlg.showModal();
  }

  root.appendChild(filters);
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { style: 'font-weight:700; margin-bottom:8px' }, 'Resultados'),
    list
  ]));

  // inicial: exibir tudo
  setTimeout(renderList, 0);
  return root;
}

function ViewRelatorios() {
  const root = el('div', { class: 'grid' });

  const filter = el('div', { class: 'card grid' }, [
    el('div', { style: 'font-weight:700; margin-bottom:4px' }, 'Relatórios'),
    el('div', { class: 'search-row' }, [
      el('label', {}, [ el('span', {}, 'Período inicial'), el('input', { type: 'date', id: 'rini' }) ]),
      el('label', {}, [ el('span', {}, 'Período final'), el('input', { type: 'date', id: 'rfim' }) ]),
      el('label', {}, [ el('span', {}, 'Tipo'), (() => {
        const sel = el('select', { id: 'rtype' }, [
          el('option', { value: 'final' }, 'Finalizadas'),
          el('option', { value: 'parcial' }, 'Parciais'),
        ]);
        return sel;
      })() ]),
      el('label', {}, [ el('span', {}, 'OP/Produto/Operador'), el('input', { id: 'rtext', placeholder: 'Deixe vazio para listar todas' }) ]),
      el('div', {}, el('button', { class: 'btn', onclick: () => renderTable() }, 'Filtrar'))
    ]),
    el('p', { class: 'muted' }, 'Como usar: 1) Escolha o tipo (Finalizadas/Parciais). 2) Informe um período ou deixe em branco para listar todas. 3) Busque por OP/Produto/Operador se necessário. 4) Marque as linhas para imprimir/exportar. Abaixo, a grade de itens mostra separados e pendentes, com operador e data/hora.')
  ]);

  const tableWrap = el('div', { class: 'card' });
  const actions = el('div', { class: 'card' }, [
    el('div', { style: 'display:flex; gap:8px; align-items:center; flex-wrap:wrap' }, [
      el('button', { class: 'btn', onclick: () => printSelected() }, 'Imprimir selecionadas'),
      el('button', { class: 'btn btn-ghost', onclick: () => exportCSV() }, 'Exportar CSV'),
      el('span', { id: 'rcount', class: 'muted' }, ''),
      el('span', { class: 'muted', style: 'margin-left:12px' }, 'Itens: '),
      (() => { const c = el('input', { type: 'checkbox', id: 'ritemsSel' }); return el('label', { style: 'display:flex; gap:6px; align-items:center' }, [c, el('span', {}, 'somente selecionadas')]); })()
    ])
  ]);
  const itemsWrap = el('div', { class: 'card' });

  let lastRows = [];
  function renderTable() {
    const d0 = document.getElementById('rini').value;
    const d1 = document.getElementById('rfim').value;
    const type = document.getElementById('rtype').value; // 'final' | 'parcial'
    const txt = (document.getElementById('rtext').value || '').trim().toUpperCase();
    const inRange = (iso) => {
      if (!d0 && !d1) return true;
      const t = new Date(iso).setHours(0,0,0,0);
      const t0 = d0 ? new Date(d0).setHours(0,0,0,0) : -Infinity;
      const t1 = d1 ? new Date(d1).setHours(23,59,59,999) : Infinity;
      return t >= t0 && t <= t1;
    };

    let rows = [];
    if (type === 'final') {
      rows = getHistory().filter(r => r.finalizeMode === 'total' && inRange(r.finishedAt));
    } else {
      rows = getSeparations().filter(r => r.finalizeMode === 'parcial' && r.finishedAt && inRange(r.finishedAt));
    }
    rows = rows.filter(r => {
      const order = getOrders().find(o => o.id === r.orderId) || { productCode: r.productCode, productDesc: r.productDesc };
      const ops = [r.orderId, order.productCode, order.productDesc, r.operator].map(x => (x || '').toUpperCase());
      return !txt || ops.some(v => v.includes(txt));
    });

    const table = el('table', { class: 'table', id: 'rtable' });
    const thead = el('thead', {}, el('tr', {}, [
      (() => { const th = el('th', {}, ''); const selAll = el('input', { type: 'checkbox', id: 'rselall' }); th.appendChild(selAll); return th; })(),
      el('th', {}, 'OP'),
      el('th', {}, 'Produto'),
      el('th', {}, 'Descrição'),
      el('th', {}, type === 'final' ? 'Finalizada em' : 'Última parcial'),
      el('th', {}, 'Operador'),
    ]));
    const tbody = el('tbody');
    for (const rec of rows) {
      const order = getOrders().find(o => o.id === rec.orderId) || { productCode: rec.productCode, productDesc: rec.productDesc };
      const tr = el('tr');
      const chk = el('input', { type: 'checkbox', 'data-id': rec.orderId });
      tr.appendChild(el('td', {}, chk));
      tr.appendChild(el('td', {}, rec.orderId));
      tr.appendChild(el('td', {}, order.productCode));
      tr.appendChild(el('td', {}, order.productDesc));
      tr.appendChild(el('td', {}, fmtDateTime(type === 'final' ? rec.finishedAt : rec.finishedAt)));
      tr.appendChild(el('td', {}, rec.operator));
      tbody.appendChild(tr);
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.innerHTML = '';
    tableWrap.appendChild(el('div', { style: 'font-weight:700; margin-bottom:8px' }, 'Resultados'));
    tableWrap.appendChild(table);
    document.getElementById('rcount').textContent = `${rows.length} registro(s)`;
    const selAll = document.getElementById('rselall');
    if (selAll) selAll.addEventListener('change', () => {
      (document.querySelectorAll('#rtable tbody input[type="checkbox"]') || []).forEach(i => { i.checked = selAll.checked; });
    });
    lastRows = rows;
    renderItemsTable();
  }

  function selectedIds() {
    return Array.from((document.querySelectorAll('#rtable tbody input[type="checkbox"]') || []))
      .filter(i => i.checked)
      .map(i => i.getAttribute('data-id'));
  }

  function printSelected() {
    const ids = selectedIds();
    if (!ids.length) return alert('Selecione ao menos um registro.');
    const type = document.getElementById('rtype').value;
    const records = (type === 'final'
      ? getHistory().filter(r => r.finalizeMode === 'total')
      : getSeparations().filter(r => r.finalizeMode === 'parcial' && r.finishedAt));
    const list = records.filter(r => ids.includes(r.orderId));
    const blocks = list.map(rec => buildReportBlock(rec, type));
    openLongReport(blocks.join('\n\n\n'));
  }

  function exportCSV() {
    const type = document.getElementById('rtype').value;
    const records = (type === 'final' ? getHistory().filter(r => r.finalizeMode === 'total') : getSeparations().filter(r => r.finalizeMode === 'parcial' && r.finishedAt));
    const rows = [];
    for (const rec of records) {
      for (const it of rec.items) {
        const status = it.confirmed ? 'SEPARADO' : 'PENDENTE';
        rows.push([
          rec.orderId, rec.productCode, rec.productDesc, status, it.baseCode, it.currentCode, it.quantity, it.unit,
          rec.operator || '', it.confirmedBy || '', it.confirmedAt || '', rec.startedAt, rec.finishedAt
        ]);
      }
    }
    const header = ['OP','Produto','Descrição','Status Item','Item Padrão','Item Usado','Qtde','Un','Operador OP','Operador Item','Confirmação Item','Início','Fim'];
    const csv = [header, ...rows].map(r => r.map(v => `"${(v||'').toString().replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function buildReportBlock(rec, type) {
    const { itemsCatalog } = getCatalog();
    const header = `OP: ${rec.orderId}  | Produto: ${rec.productCode}\nOperador: ${rec.operator} | Início: ${fmtDateTime(rec.startedAt)} | ${type==='final'?'Fim':'Última parcial'}: ${fmtDateTime(rec.finishedAt)}\n`;
    const sep = '\n'.padEnd(40, '—') + '\n';
    const lines = rec.items.map((it, idx) => {
      const curr = itemsCatalog.find(i => i.code === it.currentCode) || { description: it.description };
      const altFlag = it.substitution ? `(ALT de ${it.baseCode})` : '(OFICIAL)';
      const who = it.confirmedBy ? ` • por ${it.confirmedBy} em ${fmtDateTime(it.confirmedAt)}` : '';
      const status = it.confirmed ? '' : ' [PENDENTE]';
      return `${String(idx+1).padStart(2,'0')}  ${it.currentCode.padEnd(10)}  ${curr.description}  | ${String(it.quantity).padStart(3)} ${it.unit}  ${altFlag}${status}${who}`;
    }).join('\n');
    return `${header}${sep}${lines}`;
  }

  function openLongReport(text) {
    const dlg = document.getElementById('dialog-confirm');
    document.getElementById('confirm-title').textContent = 'Relatório';
    const msgEl = document.getElementById('confirm-message');
    msgEl.textContent = '';
    msgEl.className = 'report';
    msgEl.textContent = text;
    const btnOk = document.getElementById('confirm-ok');
    const btnCancel = document.getElementById('confirm-cancel');
    const closeAll = () => { btnOk.onclick = null; btnCancel.onclick = null; dlg.close(); };
    btnOk.textContent = 'Fechar';
    btnOk.onclick = () => closeAll();
    btnCancel.onclick = () => closeAll();
    dlg.showModal();
  }

  function renderItemsTable() {
    const type = document.getElementById('rtype').value;
    const onlySelected = document.getElementById('ritemsSel')?.checked;
    const ids = onlySelected ? selectedIds() : lastRows.map(r => r.orderId);
    if (!ids.length) { itemsWrap.innerHTML = ''; return; }
    const { itemsCatalog } = getCatalog();
    const records = (type === 'final' ? getHistory().filter(r => ids.includes(r.orderId)) : getSeparations().filter(r => ids.includes(r.orderId)));
    const table = el('table', { class: 'table' });
    const thead = el('thead', {}, el('tr', {}, [
      el('th', {}, 'OP'),
      el('th', {}, 'Item'),
      el('th', {}, 'Descrição'),
      el('th', {}, 'Qtde'),
      el('th', {}, 'Un'),
      el('th', {}, 'Status'),
      el('th', {}, 'Operador Item'),
      el('th', {}, 'Confirmação'),
    ]));
    const tbody = el('tbody');
    for (const rec of records) {
      for (const it of rec.items) {
        const curr = itemsCatalog.find(i => i.code === it.currentCode) || { description: it.description };
        const tr = el('tr');
        tr.appendChild(el('td', {}, rec.orderId));
        tr.appendChild(el('td', {}, it.currentCode));
        tr.appendChild(el('td', {}, curr.description));
        tr.appendChild(el('td', {}, String(it.quantity)));
        tr.appendChild(el('td', {}, it.unit));
        tr.appendChild(el('td', {}, it.confirmed ? 'SEPARADO' : 'PENDENTE'));
        tr.appendChild(el('td', {}, it.confirmedBy || ''));
        tr.appendChild(el('td', {}, it.confirmedAt ? fmtDateTime(it.confirmedAt) : ''));
        tbody.appendChild(tr);
      }
    }
    table.appendChild(thead); table.appendChild(tbody);
    itemsWrap.innerHTML = '';
    itemsWrap.appendChild(el('div', { style: 'font-weight:700; margin-bottom:8px' }, `Itens (${onlySelected ? 'selecionadas' : 'todas do filtro'})`));
    itemsWrap.appendChild(table);
    const chk = document.getElementById('ritemsSel');
    if (chk && !chk._bound) { chk.addEventListener('change', renderItemsTable); chk._bound = true; }
  }

  root.appendChild(filter);
  root.appendChild(actions);
  root.appendChild(tableWrap);
  root.appendChild(itemsWrap);
  // Por padrão, deixa datas em branco para listar tudo do tipo
  setTimeout(() => { const a=document.getElementById('rini'); const b=document.getElementById('rfim'); if (a) a.value=''; if (b) b.value=''; renderTable();
    // Atualiza ao trocar o tipo também
    const t=document.getElementById('rtype'); if (t && !t._bound){ t.addEventListener('change', renderTable); t._bound=true; }
  }, 0);
  return root;
}
function reopenPartial(orderId) {
  const seps = getSeparations();
  // Reabrir o mais recente parcial
  const partials = seps.filter(s => s.orderId === orderId && s.finishedAt && s.finalizeMode === 'parcial');
  if (partials.length) {
    partials.sort((a,b) => new Date(b.finishedAt) - new Date(a.finishedAt));
    const rec = partials[0];
    rec.finishedAt = null;
    delete rec.finalizeMode;
    saveSeparations(seps);
  }
  openChecklist(orderId);
}

// Dialog helpers
function openAlternativesDialog(items, onSelect) {
  const dlg = document.getElementById('dialog-alternativos');
  const list = document.getElementById('alt-list');
  const input = document.getElementById('alt-search-input');
  const btnClose = document.getElementById('alt-close');
  console.log('[dialog] alternativos open, items=', items?.length);
  function render(itemsToRender) {
    list.innerHTML = '';
    for (const it of itemsToRender) {
      const row = el('div', { class: 'op-item' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600' }, `${it.code} • ${it.description}`),
          el('div', { class: 'muted' }, `${it.location} • ${it.unit}`),
        ]),
        el('div', {}, el('button', { class: 'btn', onclick: () => { dlg.close(); onSelect?.(it); } }, 'Selecionar'))
      ]);
      list.appendChild(row);
    }
  }
  input.value = '';
  render(items);
  input.oninput = () => {
    const q = input.value.trim().toUpperCase();
    render(items.filter(i => i.code.toUpperCase().includes(q) || i.description.toUpperCase().includes(q)));
  };
  btnClose.onclick = () => { dlg.close(); onSelect?.(null); };
  dlg.showModal();
}

function openConfirm(title, message, onOk) {
  const dlg = document.getElementById('dialog-confirm');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  const btnOk = document.getElementById('confirm-ok');
  const btnCancel = document.getElementById('confirm-cancel');
  const closeAll = () => {
    btnOk.onclick = null;
    btnCancel.onclick = null;
    dlg.close();
  };
  btnOk.onclick = () => { closeAll(); onOk?.(); };
  btnCancel.onclick = () => closeAll();
  try {
    console.log('[dialog] confirm open:', title);
    dlg.showModal();
  } catch (e) {
    // Fallback para navegadores que não suportam <dialog>
    console.warn('[dialog] showModal failed, fallback alert:', e?.message);
    alert(`${title}\n\n${message}`);
    onOk?.();
  }
}


