// @ts-check

import { PART_KEYS } from '../parts-table.mjs';
import { ModSwap, ModData, ModParts, ModSwapsLib, TyresLib, AeroLib } from '../classes.mjs';
import { DATA_LABEL_DESC, DATA_SPECIAL_COMMENTS } from '../data-table.mjs';

/**
 * @typedef {import('../classes.mjs').TyreSet} TyreSet
 * @typedef {import('../classes.mjs').SetOfModParts} SetOfModParts
 * @typedef {import('../classes.mjs').SetOfModSetups} SetOfModSetups
 * @typedef {import('../classes.mjs').SetOfMechTyres} SetOfMechTyres
 */

let ACE_PATH = '';
let DRAFTS = new ModSwapsLib();
/** Raw ModParts catalog from server by car_id @type {SetOfModParts} */
let MECHS = {};
/** Raw ModData catalog from server by car_id @type {SetOfModSetups} */
let SETUPS = {};
/** @type {TyresLib} */
let TYRES;
/** @type {AeroLib} */
let AEROS;
/** @type {SetOfMechTyres} */
let MECHS_TYRES;
let SWAPS = new ModSwapsLib(); // @ts-ignore

window.MECHS = () => MECHS; // @ts-ignore
window.SETUPS = () => SETUPS; // @ts-ignore
window.TYRES = () => TYRES; // @ts-ignore
window.AEROS = () => AEROS; // @ts-ignore
window.MECHS_TYRES = () => MECHS_TYRES; // @ts-ignore
window.SWAPS = () => SWAPS; // @ts-ignore
window.DRAFTS = () => DRAFTS;

/** car_id keeps its "ks_" prefix everywhere internally; only stripped for display. */
const hideKsPrefix = (carId = 'toto') => carId.startsWith('ks_') ? carId.slice(3) : carId;

const roundStr = (val = '0.001500065', decimals = 6) => {
  const n = Number(val);
  if (Number.isNaN(n)) return val;
  const factor = 10 ** decimals;
  return (Math.round((n + Number.EPSILON) * factor) / factor).toString();
};

let ui = {
	openCar:       /** @type {string | null} */ (null),
	openMech:      /** @type {string | null} */ (null),
	openPicker:    /** @type {string | null} */ (null), // part key
	openTyrePicker:/** @type {string | null} */ (null), // tyre mod key
	tyreCat:       /** @type {string | null} */ (null),
	openAero: false,
	tyreSearch: '',
};

function notify(message = 'toto', type = 'info') {
	const el = document.createElement('div');
	el.className = `notif ${type}`;
	el.textContent = message;
	document.getElementById('notifs')?.appendChild(el);
	setTimeout(() => el.remove(), 4000);
}

const socket = new WebSocket(`ws://${location.host}`);
function send(type = 'test', /** @type {any} */ payload) { socket.send(JSON.stringify({ type, payload })); }
socket.onmessage = (/** @type {any} */ event) => {
	let msg;
	try { msg = JSON.parse(event.data); }
	catch { return notify(`Bad message from server: ${event.data}`, 'error'); }
	handleServerMessage(msg);
};

socket.onclose = () => notify('Connection to local server lost.', 'error');

function handleServerMessage(/** @type {any} */ msg) {
	if (msg.type === 'init') {
		ACE_PATH = msg.ace_mods_path || '';
		MECHS = msg.MECHS || {};
		SETUPS = msg.SETUPS || {};
		TYRES = new TyresLib(msg.TYRES);
		AEROS = new AeroLib(msg.AERO_LIB.store);
		MECHS_TYRES = msg.MECHS_TYRES || {};
		if (msg.SWAPS) SWAPS = new ModSwapsLib(msg.SWAPS); // @ts-ignore
		document.getElementById('path-input').value = ACE_PATH;
		renderCarList();
		return;
	}

	if (msg.type === 'path_result') {
		if (msg.ok) notify(`Path validated: ${msg.path}`, 'ok');
		else notify(`Invalid path: ${msg.reason || 'unknown reason'}`, 'error');
		return;
	}

	if (msg.type === 'swap_result') {
		if (msg.ok) notify(`${msg.car_id} (${msg.mech}) swapped and built!`, 'ok');
		else notify(`Swap failed for ${msg.car_id}: ${msg.reason || 'unknown reason'}`, 'error');
		return;
	}

	notify(`Unknown message type: ${msg.type}`, 'error');
} // @ts-ignore
document.getElementById('path-save').onclick = () => { // @ts-ignore
	const value = document.getElementById('path-input').value.trim();
	send('set_ace_mods_path', { path: value });
}; // @ts-ignore
document.getElementById('car-search').oninput = renderCarList;
document.addEventListener('keydown', (e) => { // @ts-ignore
	if (e.key !== '/' || document.activeElement.tagName === 'INPUT') return;
	e.preventDefault(); // @ts-ignore
	document.getElementById('car-search').focus();
});


// RENDER

function renderCarList() { // @ts-ignore
	const search = document.getElementById('car-search').value.trim().toLowerCase();
	const listEl = document.getElementById('car-list'); // @ts-ignore
	listEl.innerHTML = '';

	const carIds = Object.keys(MECHS)
		.filter((id) => id.toLowerCase().includes(search))
		.sort((a, b) => hideKsPrefix(a).localeCompare(hideKsPrefix(b))); // @ts-ignore
	document.getElementById('car-count').textContent = `${carIds.length} car${carIds.length === 1 ? '' : 's'}`;

	if (carIds.length === 0) { // @ts-ignore
		listEl.innerHTML = '<p class="empty">No car matches your search.</p>';
		return;
	} // @ts-ignore
	for (const carId of carIds) listEl.appendChild(buildCarRow(carId));
}

function buildCarRow(carId = 'toto') {
	const row = document.createElement('div');
	row.className = 'car-row';

	const head = document.createElement('div');
	head.className = 'car-head';
	head.innerHTML = `<span class="car-name">${hideKsPrefix(carId)}</span><span class="mech-tags">${buildMechTagsHTML(carId)}</span>`;
	head.onclick = () => toggleCar(carId);
	row.appendChild(head);

	if (ui.openCar === carId) row.appendChild(buildSwapPanel(carId));
	return row;
}

function buildMechTagsHTML(carId = 'toto') {
	const mechs = Object.keys(MECHS[carId]);
	if (mechs.length === 0) return '<span class="mech-tag none">no variant</span>';
	return mechs.map((m) => `<span class="mech-tag">${m}</span>`).join('');
}

function toggleCar(carId = 'toto') {
	ui = {
		openCar:        ui.openCar === carId ? null : carId, // @ts-ignore
		openMech:       ui.openCar === carId ? null : Object.keys(MECHS[carId])[0],
		openPicker:     null,
		openTyrePicker: null,
		tyreCat:        null,
		openAero:       false,
		tyreSearch:     '',
	};
	renderCarList();
}

function buildSwapPanel(carId = 'toto') {
	const panel = document.createElement('div');
	panel.className = 'swap-panel';

	panel.appendChild(buildMechSelect(carId));
	panel.appendChild(buildSectionTitle('CAR SPECS'));
	panel.appendChild(buildSpecsList(carId, '.car'));
	panel.appendChild(buildSectionTitle('TYRES'));
	panel.appendChild(buildTyresList(carId));
	if (AEROS.store[carId]) {
		panel.appendChild(buildSectionTitle('AERO (full kit)'));
		panel.appendChild(buildAeroSection(carId));
	}
	panel.appendChild(buildSectionTitle('PARTS'));
	panel.appendChild(buildPartList(carId));
	panel.appendChild(buildSwapPanelButtons(carId));
	return panel;
}

function buildSectionTitle(section = 'PARTS') {
	const el = document.createElement('h2');
	el.className = 'section-title';
	el.textContent = section;
	return el;
}

function buildMechSelect(carId = 'toto') {
	const mechSelect = document.createElement('div');
	mechSelect.className = 'mech-select';
	for (const mech of Object.keys(MECHS[carId])) {
		const btn = document.createElement('button');
		btn.className = `mech-btn ${mech === ui.openMech ? 'active' : ''}`;
		btn.textContent = mech; // @ts-ignore
		btn.onclick = () => { ui.openMech = mech; ui.openPicker = null; ui.openTyrePicker = null; renderCarList(); };
		mechSelect.appendChild(btn);
	}
	return mechSelect;
}

function buildSwapPanelButtons(carId = 'toto') {
	const actions = document.createElement('div');
	actions.className = 'swap-actions';
	const swapBtn = document.createElement('button');
	swapBtn.className = 'btn-pink';
	swapBtn.textContent = 'swap it baby! 🦜'; // @ts-ignore
	swapBtn.onclick = () => confirmSwap(carId, ui.openMech);
	actions.appendChild(swapBtn);
	return actions;
}


// SPECS

function getSpecValue(carId = 'toto', mech = 'mech_1', fileExt = '.car', rowLabel = '1.2') {
	const draft = DRAFTS.get(carId, mech)?.setup.get(fileExt, rowLabel);
	if (draft !== undefined) return draft;
	const applied = SWAPS.get(carId, mech)?.setup.get(fileExt, rowLabel);
	if (applied !== undefined) return applied; // @ts-ignore

	const val = SETUPS[carId]?.[mech]?.[fileExt]?.[rowLabel];
	if (val) return roundStr(val);
}

function getOriginSpecValue(carId = 'toto', mech = 'mech_1', fileExt = '.car', rowLabel = '1.2') { // @ts-ignore
	return SETUPS[carId]?.[mech]?.[fileExt]?.[rowLabel];
}

function isSpecDrafted(carId = 'toto', mech = 'mech_1', fileExt = '.car', rowLabel = '1.2') {
	return DRAFTS.get(carId, mech)?.setup.get(fileExt, rowLabel);
}

function setDraftSpec(carId = 'toto', mech = 'mech_1', fileExt = '.car', rowLabel = '1.2', /** @type {any} */ value) {
	if (!DRAFTS.get(carId, mech)) DRAFTS.set(carId, mech);
	DRAFTS.get(carId, mech)?.setup.set(fileExt, rowLabel, value);
}

function resetSpecToOrigin(carId = 'toto', mech = 'toto', fileExt = 'toto', rowLabel = '1.2') {
	setDraftSpec(carId, mech, fileExt, rowLabel, getOriginSpecValue(carId, mech, fileExt, rowLabel));
}

function buildSpecsList(carId = 'toto', fileExt = 'toto') {
	const specsList = document.createElement('div');
	specsList.className = 'specs-list';
	specsList.appendChild(buildRealisticCheckbox());
	for (const rowLabel in DATA_LABEL_DESC[fileExt]) // @ts-ignore
		specsList.appendChild(buildSpecRow(carId, ui.openMech, fileExt, rowLabel));
	specsList.appendChild(buildSpecsResetAllButton(carId, fileExt));
	return specsList;
}

function buildRealisticCheckbox() {
	const wrapper = document.createElement('label');
	wrapper.className = 'realistic-toggle';
	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.checked = false;
	checkbox.disabled = true; // placeholder until we have an estimation table
	wrapper.appendChild(checkbox);
	wrapper.append(' Make it realistic');
	return wrapper;
}

function buildSpecRow(carId = 'toto', mech = 'toto', fileExt = 'toto', rowLabel = '1.2') {
	const row = document.createElement('div');
	row.className = 'spec-row'; // @ts-ignore
	const desc = DATA_LABEL_DESC[fileExt][rowLabel];

	const label = document.createElement('span');
	label.className = 'spec-label'; // @ts-ignore
	label.innerHTML = !DATA_SPECIAL_COMMENTS[desc] ? desc : `${desc} <span style="opacity: .8">(${DATA_SPECIAL_COMMENTS[desc]})<span>`;
	row.appendChild(label);

	const input = document.createElement('input');
	input.type = 'text';
	input.className = `spec-input ${isSpecDrafted(carId, mech, fileExt, rowLabel) ? 'pending' : ''}`;
	input.value = getSpecValue(carId, mech, fileExt, rowLabel) ?? '';
	input.onchange = () => { setDraftSpec(carId, mech, fileExt, rowLabel, input.value); renderCarList(); };
	row.appendChild(input);

	const defaultBtn = document.createElement('button');
	defaultBtn.className = 'btn-ghost';
	defaultBtn.textContent = 'default';
	defaultBtn.onclick = () => { resetSpecToOrigin(carId, mech, fileExt, rowLabel); renderCarList(); };
	row.appendChild(defaultBtn);
	return row;
}

function buildSpecsResetAllButton(carId = 'toto', fileExt = 'toto') {
	const resetAllBtn = document.createElement('button');
	resetAllBtn.className = 'btn-ghost specs-reset-all';
	resetAllBtn.textContent = 'reset all'; // @ts-ignore
	resetAllBtn.onclick = () => { for (const rowLabel in DATA_LABEL_DESC[fileExt]) resetSpecToOrigin(carId, ui.openMech, fileExt, rowLabel); renderCarList(); };
	return resetAllBtn;
}


// TYRES

function getTyreValue(carId = 'toto', mech = 'mech_1', mod = 'Mod_1') {
	return DRAFTS.get(carId, mech)?.tyres[mod]
		?? SWAPS.get(carId, mech)?.tyres[mod]
		?? MECHS_TYRES[carId]?.[mech]?.[mod];
}

function getOriginTyreValue(carId = 'toto', mech = 'mech_1', mod = 'Mod_1') {
	return MECHS_TYRES[carId]?.[mech]?.[mod];
}

function isTyreDrafted(carId = 'toto', mech = 'mech_1', mod = 'Mod_1') {
	return !!DRAFTS.get(carId, mech)?.tyres[mod];
}

function setDraftTyre(carId = 'toto', mech = 'mech_1', mod = 'Mod_1', /** @type {TyreSet} */ tyreSet) {
	if (!DRAFTS.get(carId, mech)) DRAFTS.set(carId, mech); // @ts-ignore
	DRAFTS.get(carId, mech).tyres[mod] = tyreSet; // @ts-ignore
}

function buildTyresList(carId = 'toto') {
	const mech = ui.openMech ?? '';
	const mods = Object.keys(MECHS_TYRES[carId]?.[mech] ?? {});

	const wrapper = document.createElement('div');
	wrapper.className = 'tyres-list';

	for (const mod of mods) wrapper.appendChild(buildTyreRow(carId, mech, mod));

	const resetBtn = document.createElement('button');
	resetBtn.className = 'btn-ghost tyres-reset-all';
	resetBtn.textContent = 'reset all tyres';
	resetBtn.onclick = () => {
		for (const mod in MECHS_TYRES[carId]?.[mech]) setDraftTyre(carId, mech, mod, getOriginTyreValue(carId, mech, mod)); // @ts-ignore
		renderCarList();
	};
	wrapper.appendChild(resetBtn);
	return wrapper;
}

function buildTyreRow(carId = 'toto', mech = 'toto', mod = 'toto') {
	const row = document.createElement('div');
	row.className = 'tyre-row clickable';

	const tyreSet = getTyreValue(carId, mech, mod);
	const stateClass = isTyreDrafted(carId, mech, mod) ? 'pending' : SWAPS.get(carId, mech)?.tyres[mod] ? 'applied' : '';

	row.innerHTML = `
		<span class="tyre-mod">${mod}</span>
		<span class="tyre-name ${stateClass}">${tyreSet?.front.tyre ?? '—'}</span>
		<span class="tyre-cat">${tyreSet?.front.category ?? ''}</span>`;

	row.onclick = (e) => {
		e.stopPropagation();
		ui.openTyrePicker = ui.openTyrePicker === mod ? null : mod;
		renderCarList();
	};

	if (ui.openTyrePicker === mod) row.appendChild(buildTyrePicker(carId, mech, mod, tyreSet));
	return row;
}

function buildTyrePicker(carId = 'toto', mech = 'toto', mod = 'toto', /** @type {TyreSet | undefined} */ current) {
	const picker = document.createElement('div');
	picker.className = 'tyre-picker';
	picker.onclick = (e) => e.stopPropagation();

	// Front / Rear displays with sync button
	const axleRow = document.createElement('div');
	axleRow.className = 'tyre-axle-row';

	const frontLabel = document.createElement('span');
	frontLabel.className = 'tyre-axle-label';
	frontLabel.innerHTML = `<b>Front:</b> ${current?.front.tyre ?? '—'} <span class="tyre-cat">${current?.front.category ?? ''}</span>`;

	const syncBtn = document.createElement('button');
	syncBtn.className = 'btn-ghost tyre-sync-btn';
	syncBtn.textContent = 'sync front → rear';
	syncBtn.onclick = () => {
		if (!current?.front) return;
		setDraftTyre(carId, mech, mod, { front: current.front, rear: { ...current.front } });
		renderCarList();
	};

	const rearLabel = document.createElement('span');
	rearLabel.className = 'tyre-axle-label';
	rearLabel.innerHTML = `<b>Rear:</b> ${current?.rear.tyre ?? '—'} <span class="tyre-cat">${current?.rear.category ?? ''}</span>`;

	axleRow.appendChild(frontLabel);
	axleRow.appendChild(syncBtn);
	axleRow.appendChild(rearLabel);
	picker.appendChild(axleRow);

	// Search
	const search = document.createElement('input');
	search.type = 'text';
	search.placeholder = 'Search a tyre...';
	search.value = ui.tyreSearch;
	search.oninput = () => { ui.tyreSearch = search.value; renderList(); };
	picker.appendChild(search);

	// Category filters
	const filters = document.createElement('div');
	filters.className = 'tyre-picker-filters';
	for (const cat of TYRES.categories) {
		const btn = document.createElement('button');
		btn.className = `tyre-filter-btn ${ui.tyreCat === cat ? 'active' : ''}`;
		btn.textContent = cat;
		btn.onclick = () => { ui.tyreCat = ui.tyreCat === cat ? null : cat; renderList(); };
		filters.appendChild(btn);
	}
	picker.appendChild(filters);

	// Tyre list — two columns: Front / Rear
	const header = document.createElement('div');
	header.className = 'tyre-picker-header';
	header.innerHTML = '<span>Tyre</span><span>Front</span><span>Rear</span>';
	picker.appendChild(header);

	const list = document.createElement('div');
	list.className = 'tyre-picker-list';
	picker.appendChild(list);

	const renderList = () => {
		list.innerHTML = '';
		const term = ui.tyreSearch.toLowerCase();

		for (const cat of TYRES.categories) {
			if (ui.tyreCat && cat !== ui.tyreCat) continue;
			for (const tyreName in TYRES.store[cat]) {
				if (term && !tyreName.toLowerCase().includes(term)) continue;
				list.appendChild(buildTyrePickerItem(carId, mech, mod, cat, tyreName, current));
			}
		}
		if (!list.children.length) list.innerHTML = '<p class="empty">No tyre matches.</p>';
	};
	renderList();
	return picker;
}

function buildTyrePickerItem(carId = 'toto', mech = 'toto', mod = 'toto', cat = 'toto', tyreName = 'toto', /** @type {TyreSet | undefined} */ current) {
	const item = document.createElement('div');
	item.className = 'tyre-picker-item';

	const nameEl = document.createElement('span');
	nameEl.textContent = tyreName;
	item.appendChild(nameEl);

	// Assign to front only
	const frontBtn = document.createElement('button');
	frontBtn.className = 'btn-ghost';
	frontBtn.textContent = 'Front';
	frontBtn.onclick = (e) => {
		e.stopPropagation();
		const rear = current?.rear ?? { category: cat, tyre: tyreName };
		setDraftTyre(carId, mech, mod, { front: { category: cat, tyre: tyreName }, rear });
		renderCarList();
	};

	// Assign to rear only
	const rearBtn = document.createElement('button');
	rearBtn.className = 'btn-ghost';
	rearBtn.textContent = 'Rear';
	rearBtn.onclick = (e) => {
		e.stopPropagation();
		const front = current?.front ?? { category: cat, tyre: tyreName };
		setDraftTyre(carId, mech, mod, { front, rear: { category: cat, tyre: tyreName } });
		renderCarList();
	};

	item.appendChild(frontBtn);
	item.appendChild(rearBtn);
	return item;
}

// AERO

function getAeroValue(carId = 'toto', mech = 'toto') {
    return DRAFTS.get(carId, mech)?.aero
        ?? SWAPS.get(carId, mech)?.aero
        ?? 'stock';
}

function setDraftAero(carId = 'toto', mech = 'toto', value = 'stock') {
	const draft = DRAFTS.get(carId, mech) || new ModSwap();
	draft.aero = value;
	DRAFTS.set(carId, mech, draft);
}

function buildAeroSection(carId = 'toto') {
    const mech = ui.openMech ?? '';
    const current = getAeroValue(carId, mech);
    const isPending = !!DRAFTS.get(carId, mech)?.aero;

    const wrapper = document.createElement('div');
    wrapper.className = 'aero-section';

    // Trigger button (acts as the dropdown "input")
    const trigger = document.createElement('div');
    trigger.className = `aero-trigger ${isPending ? 'pending' : ''}`;
    trigger.textContent = current === 'stock' ? 'stock' : hideKsPrefix(current);
    trigger.onclick = () => { ui.openAero = !ui.openAero; renderCarList(); };
    wrapper.appendChild(trigger);

    if (!ui.openAero) return wrapper;

    // Dropdown list
    const list = document.createElement('div');
    list.className = 'aero-list';

    const donors = ['stock', ...Object.keys(AEROS.store)
        .filter(id => id !== carId)
        .sort((a, b) => hideKsPrefix(a).localeCompare(hideKsPrefix(b)))
    ];

    for (const donorId of donors) {
        const item = document.createElement('div');
        item.className = `aero-item ${donorId === current ? 'active' : ''}`;
        item.textContent = donorId === 'stock' ? 'stock' : hideKsPrefix(donorId);
        item.onclick = () => { setDraftAero(carId, mech, donorId); ui.openAero = false; renderCarList(); };
        list.appendChild(item);
    }

    wrapper.appendChild(list);
    return wrapper;
}

// PARTS

function buildPartList(carId = 'toto') {
	const partList = document.createElement('div');
	partList.className = 'part-list'; // @ts-ignore
	for (const key of PART_KEYS) partList.appendChild(buildPartRow(carId, ui.openMech, key));
	return partList;
}

function buildPartRow(carId = 'toto', mech = 'toto', key = 'toto') {
	const row = document.createElement('div');
	row.className = 'part-row';

	const draft = DRAFTS.get(carId, mech)?.getPart(key);
	const applied = SWAPS.get(carId, mech)?.getPart(key);
	const ref = draft || applied || null;

	const sourceLabel = ref?.car_id ? `${hideKsPrefix(ref.car_id)} (${ref.mech})` : 'unchanged';
	const sourceClass = draft ? 'pending' : applied ? 'applied' : '';

	row.innerHTML = `<span class="part-key">${key}</span><span class="part-source ${sourceClass}">${sourceLabel}</span>`;
	row.onclick = (e) => {
		e.stopPropagation(); // @ts-ignore
		ui.openPicker = ui.openPicker === key ? null : key;
		renderCarList();
	};

	if (ui.openPicker === key) row.appendChild(buildPicker(carId, mech, key));
	return row;
}

function buildPicker(carId = 'toto', mech = 'toto', key = 'toto') {
	const picker = document.createElement('div');
	picker.className = 'part-picker';
	picker.onclick = (e) => e.stopPropagation();

	const search = document.createElement('input');
	search.type = 'text';
	search.placeholder = 'Search a donor car...';
	picker.appendChild(search);

	const list = document.createElement('div');
	list.className = 'picker-list';
	picker.appendChild(list);

	const renderOptions = () => {
		const term = search.value.trim().toLowerCase();
		list.innerHTML = '';
		for (const donorId of Object.keys(MECHS).filter((id) => id.toLowerCase().includes(term)).sort((a, b) => hideKsPrefix(a).localeCompare(hideKsPrefix(b))))
			for (const donorMech of Object.keys(MECHS[donorId]))
				list.appendChild(buildPickerItem(carId, mech, key, donorId, donorMech));
	};

	search.oninput = renderOptions;
	renderOptions();
	return picker;
}

function buildPickerItem(carId = 'toto', mech = 'toto', key = 'toto', donorId = 'toto', donorMech = 'toto') {
	const item = document.createElement('div');
	item.className = 'picker-item';

	const label = document.createElement('span');
	label.textContent = `${hideKsPrefix(donorId)} (${donorMech})`;
	item.appendChild(label);

	const btnGroup = document.createElement('span');

	const assignPart = document.createElement('button');
	assignPart.className = 'btn-ghost';
	assignPart.textContent = 'assign part';
	assignPart.onclick = () => { setDraftPart(carId, mech, key, donorId, donorMech); ui.openPicker = null; renderCarList(); };
	btnGroup.appendChild(assignPart);

	const assignAll = document.createElement('button');
	assignAll.className = 'btn-green';
	assignAll.textContent = 'assign all parts';
	assignAll.style.marginLeft = '0.4rem';
	assignAll.onclick = () => {
		for (const k of PART_KEYS) setDraftPart(carId, mech, k, donorId, donorMech);
		ui.openPicker = null;
		renderCarList();
		notify(`All parts staged from ${hideKsPrefix(donorId)} (${donorMech}). Hit "swap it baby!" to confirm.`, 'info');
	};
	btnGroup.appendChild(assignAll);

	item.appendChild(btnGroup);
	return item;
}

function setDraftPart(carId = 'toto', mech = 'toto', key = 'toto', donorId = 'toto', donorMech = 'toto') {
	const draft = DRAFTS.get(carId, mech) || new ModSwap();
	draft.parts[key] = { car_id: donorId, mech: donorMech };
	DRAFTS.set(carId, mech, draft);
}


// SWAP

function confirmSwap(carId = 'toto', mech = 'toto') {
	const draft = DRAFTS.get(carId, mech);
	if (!draft) return notify('No changes staged for this mech yet.', 'error');

	const modSwap = buildModSwapFromDraft(carId, mech, draft);
	send('update_swap_and_build', { car_id: carId, mech, mod_swap: modSwap });

	SWAPS.set(carId, mech, modSwap);
	DRAFTS.delete(carId, mech);
	renderCarList();
}

function buildModSwapFromDraft(carId = 'toto', mech = 'toto', draft = new ModSwap()) {
	const modSwap = new ModSwap();
	const base = SWAPS.get(carId, mech) || new ModSwap();

	// Merge setup: base first, draft overrides
	for (const fileExt in base.setup) // @ts-ignore
		for (const valuePath in base.setup[fileExt] || {}) {
			const val = base.setup.get(fileExt, valuePath);
			if (val) modSwap.setup.set(fileExt, valuePath, val);
		}
	for (const fileExt in draft.setup) // @ts-ignore
		for (const valuePath in draft.setup[fileExt] || {}) {
			const val = draft.setup.get(fileExt, valuePath);
			if (val) modSwap.setup.set(fileExt, valuePath, val);
		}

	// Merge parts
	for (const key of PART_KEYS) modSwap.parts[key] = draft.parts[key] || base.parts[key];
	for (const key of PART_KEYS) if (!modSwap.parts[key]) delete modSwap.parts[key];

	// Merge tyres: base first, draft overrides
	for (const mod in base.tyres) modSwap.tyres[mod] = base.tyres[mod];
	for (const mod in draft.tyres) modSwap.tyres[mod] = draft.tyres[mod];
	
	modSwap.aero = draft.aero || base.aero;

	return modSwap;
}
